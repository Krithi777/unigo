"""
rides.py — Core ride lifecycle endpoints.

Endpoints:
  POST   /rides/create              Phase 1 — create a new ride
  POST   /rides/{ride_id}/join      Phase 1 — rider joins, triggers RouteMorph
  POST   /rides/{ride_id}/cancel    Phase 2 — driver cancels, triggers backup match
  POST   /rides/{ride_id}/start     Phase 4 — driver starts ride (sets status=active)
  PATCH  /rides/{ride_id}/request/{req_id}   Accept/reject a rider request
  GET    /rides/upcoming/{user_id}  Get upcoming rides for a user
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.db.supabase_client import supabase
from app.services.route_engine import run_routemorph
from app.services.backup_match import reassign_all_stranded
from app.sockets.socket_manager import (
    emit_route_update,
    emit_ride_cancelled,
    emit_ride_started,
    emit_ride_completed,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
#  Request / Response schemas
# --------------------------------------------------------------------------- #

class CreateRidePayload(BaseModel):
    driver_id: str
    community_id: str
    pickup_lat: float
    pickup_lng: float
    pickup_address: Optional[str] = None
    dropoff_lat: float
    dropoff_lng: float
    dropoff_address: Optional[str] = None
    departure_time: str          # ISO 8601 string
    seats_total: int = 4
    women_only: bool = False


class JoinRidePayload(BaseModel):
    rider_id: str
    pickup_lat: float
    pickup_lng: float
    pickup_address: Optional[str] = None


class UpdateRequestPayload(BaseModel):
    status: str   # 'accepted' | 'rejected'


# --------------------------------------------------------------------------- #
#  POST /rides/create
# --------------------------------------------------------------------------- #

@router.post("/create", status_code=status.HTTP_201_CREATED)
async def create_ride(payload: CreateRidePayload):
    """
    Create a new scheduled ride.
    If women_only=True, the driver must be female (checked against users table).
    """
    # 1. Gender gate for women-only rides
    if payload.women_only:
        driver_res = (
            supabase.table("users")
            .select("gender")
            .eq("id", payload.driver_id)
            .single()
            .execute()
        )
        driver = driver_res.data
        if not driver or driver.get("gender") != "female":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Women-only rides can only be created by female drivers.",
            )

    # 2. Insert ride row
    ride_data = {
        "driver_id": payload.driver_id,
        "community_id": payload.community_id,
        "pickup_lat": payload.pickup_lat,
        "pickup_lng": payload.pickup_lng,
        "pickup_address": payload.pickup_address,
        "dropoff_lat": payload.dropoff_lat,
        "dropoff_lng": payload.dropoff_lng,
        "dropoff_address": payload.dropoff_address,
        "departure_time": payload.departure_time,
        "seats_total": payload.seats_total,
        "seats_available": payload.seats_total,
        "women_only": payload.women_only,
        "status": "scheduled",
        "optimized_route": None,
    }

    result = supabase.table("rides").insert(ride_data).execute()
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create ride.",
        )

    ride = result.data[0]
    logger.info("Ride created: %s by driver %s", ride["id"], payload.driver_id)
    return {"ride": ride}


# --------------------------------------------------------------------------- #
#  POST /rides/{ride_id}/join
# --------------------------------------------------------------------------- #

@router.post("/{ride_id}/join", status_code=status.HTTP_201_CREATED)
async def join_ride(ride_id: str, payload: JoinRidePayload):
    """
    Rider joins a scheduled ride.
    Triggers RouteMorph to re-optimise the pickup route and broadcasts
    route_updated via Socket.io.
    """
    # 1. Fetch the ride
    ride_res = supabase.table("rides").select("*").eq("id", ride_id).single().execute()
    ride = ride_res.data
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found.")

    if ride["status"] != "scheduled":
        raise HTTPException(status_code=400, detail="Ride is not available for joining.")

    # 2. Women-only gender gate
    if ride.get("women_only"):
        rider_res = (
            supabase.table("users")
            .select("gender")
            .eq("id", payload.rider_id)
            .single()
            .execute()
        )
        rider = rider_res.data
        if not rider or rider.get("gender") != "female":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Women-only ride: only verified female riders can join.",
            )

    # 3. Seats check
    if ride["seats_available"] <= 0:
        raise HTTPException(status_code=400, detail="No seats available.")

    # 4. Prevent duplicate join
    existing = (
        supabase.table("ride_requests")
        .select("id, status")
        .eq("ride_id", ride_id)
        .eq("rider_id", payload.rider_id)
        .execute()
    )
    active_statuses = {"pending", "accepted"}
    if any(r["status"] in active_statuses for r in (existing.data or [])):
        raise HTTPException(status_code=400, detail="You have already joined this ride.")

    # 5. Insert ride_request
    req_data = {
        "ride_id": ride_id,
        "rider_id": payload.rider_id,
        "pickup_lat": payload.pickup_lat,
        "pickup_lng": payload.pickup_lng,
        "pickup_address": payload.pickup_address,
        "status": "pending",
    }
    req_result = supabase.table("ride_requests").insert(req_data).execute()
    if not req_result.data:
        raise HTTPException(status_code=500, detail="Failed to create ride request.")
    ride_request = req_result.data[0]

    # 6. Decrement seats_available
    supabase.table("rides").update(
        {"seats_available": ride["seats_available"] - 1}
    ).eq("id", ride_id).execute()

    # 7. Run RouteMorph — re-optimise pickup order
    optimized_route = None
    try:
        optimized_route = await run_routemorph(ride_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("RouteMorph failed for ride %s: %s", ride_id, exc)

    logger.info("Rider %s joined ride %s", payload.rider_id, ride_id)
    return {
        "ride_request": ride_request,
        "optimized_route": optimized_route,
    }


# --------------------------------------------------------------------------- #
#  POST /rides/{ride_id}/cancel
# --------------------------------------------------------------------------- #

@router.post("/{ride_id}/cancel")
async def cancel_ride(ride_id: str, driver_id: str):
    """
    Driver cancels a scheduled or active ride.
    If the cancellation is within 30 minutes of departure, all accepted/pending
    riders are automatically reassigned via backup match.
    """
    # 1. Fetch ride
    ride_res = supabase.table("rides").select("*").eq("id", ride_id).single().execute()
    ride = ride_res.data
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found.")

    if ride["driver_id"] != driver_id:
        raise HTTPException(status_code=403, detail="Only the driver can cancel this ride.")

    if ride["status"] in ("completed", "cancelled"):
        raise HTTPException(status_code=400, detail=f"Ride is already {ride['status']}.")

    # 2. Mark ride as cancelled
    now = datetime.now(tz=timezone.utc)
    supabase.table("rides").update({
        "status": "cancelled",
        "cancelled_at": now.isoformat(),
    }).eq("id", ride_id).execute()

    # 3. Check if cancellation is last-minute (within 30 min of departure)
    departure = datetime.fromisoformat(ride["departure_time"].replace("Z", "+00:00"))
    is_last_minute = (departure - now) <= timedelta(minutes=30)

    # 4. Fetch stranded riders (pending or accepted)
    stranded_res = (
        supabase.table("ride_requests")
        .select("rider_id")
        .eq("ride_id", ride_id)
        .in_("status", ["pending", "accepted"])
        .execute()
    )
    stranded_rider_ids = [r["rider_id"] for r in (stranded_res.data or [])]

    # 5. Mark all their requests as cancelled
    if stranded_rider_ids:
        supabase.table("ride_requests").update(
            {"status": "cancelled"}
        ).eq("ride_id", ride_id).in_("status", ["pending", "accepted"]).execute()

    # 6. Emit socket event to all riders in the ride room
    await emit_ride_cancelled(ride_id)

    # 7. Attempt backup match for each stranded rider
    reassignment_summary = {"stranded_count": 0, "reassigned_count": 0}
    if stranded_rider_ids:
        reassignment_summary = reassign_all_stranded(stranded_rider_ids, ride)

    logger.info(
        "Ride %s cancelled. Last-minute: %s. Stranded: %d, Reassigned: %d",
        ride_id,
        is_last_minute,
        reassignment_summary["stranded_count"],
        reassignment_summary["reassigned_count"],
    )

    return {
        "cancelled": True,
        "is_last_minute": is_last_minute,
        **reassignment_summary,
    }


# --------------------------------------------------------------------------- #
#  POST /rides/{ride_id}/start
# --------------------------------------------------------------------------- #

@router.post("/{ride_id}/start")
async def start_ride(ride_id: str, driver_id: str):
    """
    Driver starts the ride — sets status to 'active' and broadcasts
    ride_started event via Socket.io so riders' screens update.
    """
    ride_res = supabase.table("rides").select("*").eq("id", ride_id).single().execute()
    ride = ride_res.data
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found.")

    if ride["driver_id"] != driver_id:
        raise HTTPException(status_code=403, detail="Only the driver can start this ride.")

    if ride["status"] != "scheduled":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot start a ride with status '{ride['status']}'.",
        )

    # Update status
    update_res = (
        supabase.table("rides")
        .update({"status": "active"})
        .eq("id", ride_id)
        .execute()
    )
    updated_ride = (update_res.data or [ride])[0]

    # Notify all riders via Socket.io
    await emit_ride_started(ride_id)

    logger.info("Ride %s started by driver %s", ride_id, driver_id)
    return {"ride": updated_ride}


# --------------------------------------------------------------------------- #
#  POST /rides/{ride_id}/complete  (called by end_ride socket or manually)
# --------------------------------------------------------------------------- #

@router.post("/{ride_id}/complete")
async def complete_ride(ride_id: str, driver_id: str):
    """
    Mark a ride as completed. Updates ride status and all accepted ride_requests.
    Emits ride_completed socket event so Ruvanthika's reliability / dashboard
    logic can react.
    """
    ride_res = supabase.table("rides").select("*").eq("id", ride_id).single().execute()
    ride = ride_res.data
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found.")

    if ride["driver_id"] != driver_id:
        raise HTTPException(status_code=403, detail="Only the driver can complete this ride.")

    if ride["status"] != "active":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot complete a ride with status '{ride['status']}'.",
        )

    now = datetime.now(tz=timezone.utc)
    supabase.table("rides").update({
        "status": "completed",
        "completed_at": now.isoformat(),
    }).eq("id", ride_id).execute()

    # Mark accepted ride_requests as completed
    supabase.table("ride_requests").update(
        {"status": "completed"}
    ).eq("ride_id", ride_id).eq("status", "accepted").execute()

    await emit_ride_completed(ride_id)

    logger.info("Ride %s completed by driver %s", ride_id, driver_id)
    return {"completed": True, "ride_id": ride_id}


# --------------------------------------------------------------------------- #
#  PATCH /rides/{ride_id}/request/{req_id}  — Accept / Reject a rider
# --------------------------------------------------------------------------- #

@router.patch("/{ride_id}/request/{req_id}")
async def update_ride_request(ride_id: str, req_id: str, payload: UpdateRequestPayload):
    """
    Driver accepts or rejects a pending ride request.
    Used by Ruvanthika's Driver Dashboard.
    Accepting a request triggers a fresh RouteMorph optimisation.
    """
    if payload.status not in ("accepted", "rejected"):
        raise HTTPException(status_code=400, detail="Status must be 'accepted' or 'rejected'.")

    req_res = (
        supabase.table("ride_requests")
        .select("*")
        .eq("id", req_id)
        .eq("ride_id", ride_id)
        .single()
        .execute()
    )
    ride_request = req_res.data
    if not ride_request:
        raise HTTPException(status_code=404, detail="Ride request not found.")

    supabase.table("ride_requests").update(
        {"status": payload.status}
    ).eq("id", req_id).execute()

    # Re-run route optimisation when a request is accepted
    if payload.status == "accepted":
        try:
            await run_routemorph(ride_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning("RouteMorph after accept failed: %s", exc)

    # If rejected, free up the seat
    if payload.status == "rejected":
        ride_res = supabase.table("rides").select("seats_available").eq("id", ride_id).single().execute()
        if ride_res.data:
            supabase.table("rides").update(
                {"seats_available": ride_res.data["seats_available"] + 1}
            ).eq("id", ride_id).execute()

    return {"ride_request_id": req_id, "status": payload.status}


# --------------------------------------------------------------------------- #
#  GET /rides/upcoming/{user_id}
# --------------------------------------------------------------------------- #

@router.get("/upcoming/{user_id}")
async def get_upcoming_rides(user_id: str):
    """
    Return upcoming scheduled/active rides for a user (as driver or rider).
    Used by Ruvanthika's User Dashboard and the backup-match polling logic.
    """
    now = datetime.now(tz=timezone.utc).isoformat()

    # Rides where user is the driver
    driver_rides_res = (
        supabase.table("rides")
        .select("*, communities(name)")
        .eq("driver_id", user_id)
        .in_("status", ["scheduled", "active"])
        .gte("departure_time", now)
        .order("departure_time")
        .execute()
    )

    # Rides where user is an accepted/pending rider
    rider_requests_res = (
        supabase.table("ride_requests")
        .select("*, rides(*, communities(name))")
        .eq("rider_id", user_id)
        .in_("status", ["pending", "accepted"])
        .execute()
    )

    rider_rides = []
    for req in (rider_requests_res.data or []):
        ride = req.get("rides")
        if ride and ride.get("status") in ("scheduled", "active"):
            ride["_request_status"] = req["status"]
            rider_rides.append(ride)

    return {
        "driver_rides": driver_rides_res.data or [],
        "rider_rides": rider_rides,
    }

# --------------------------------------------------------------------------- #
#  POST /rides/{ride_id}/location — Driver broadcasts GPS location
# --------------------------------------------------------------------------- #

class LocationPayload(BaseModel):
    lat: float
    lng: float


@router.post("/{ride_id}/location")
async def update_driver_location(ride_id: str, payload: LocationPayload):
    """
    Driver app posts its GPS coordinates every ~3 seconds.
    We emit this via Socket.io to all riders in the ride room.
    Also computes real-time ETA using cached route data.
    """
    from app.sockets.socket_manager import emit_driver_location

    # Optionally compute ETA from Google Maps Distance Matrix API
    eta_text = None
    dist_text = None
    try:
        ride_res = supabase.table("rides").select("dropoff_lat,dropoff_lng,optimized_route").eq("id", ride_id).single().execute()
        if ride_res.data and ride_res.data.get("optimized_route"):
            import httpx, os
            api_key = os.getenv("GOOGLE_MAPS_API_KEY", "")
            if api_key:
                dest_lat = ride_res.data["dropoff_lat"]
                dest_lng = ride_res.data["dropoff_lng"]
                url = (
                    f"https://maps.googleapis.com/maps/api/distancematrix/json"
                    f"?origins={payload.lat},{payload.lng}"
                    f"&destinations={dest_lat},{dest_lng}"
                    f"&mode=driving&key={api_key}"
                )
                async with httpx.AsyncClient(timeout=3) as client:
                    resp = await client.get(url)
                    data = resp.json()
                    el = data["rows"][0]["elements"][0]
                    if el.get("status") == "OK":
                        eta_text = el["duration"]["text"]
                        dist_text = el["distance"]["text"]
    except Exception:
        pass

    await emit_driver_location(ride_id, payload.lat, payload.lng, eta_text, dist_text)
    return {"status": "ok", "eta": eta_text, "distance": dist_text}