"""
women_ride.py — Phase 3: Women-Only Ride search endpoints.

Endpoints:
  GET /rides/women-only/{community_id}   List women-only scheduled rides
  GET /rides/search/{community_id}       General ride search with optional women_only filter
"""

import logging
import math
from typing import Optional

from fastapi import APIRouter, Query
from app.db.supabase_client import supabase

router = APIRouter()
logger = logging.getLogger(__name__)


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius_km = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    rlat1 = math.radians(lat1)
    rlat2 = math.radians(lat2)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlng / 2) ** 2
    )
    return radius_km * (2 * math.asin(math.sqrt(a)))


def _decorate_rides(rides: list[dict], pickup_lat: Optional[float], pickup_lng: Optional[float]) -> list[dict]:
    decorated = []
    for ride in rides:
        match = 86
        if pickup_lat is not None and pickup_lng is not None:
            pickup_gap = _haversine_km(
                pickup_lat,
                pickup_lng,
                ride.get("pickup_lat") or pickup_lat,
                ride.get("pickup_lng") or pickup_lng,
            )
            match = max(55, min(98, round(98 - pickup_gap * 9)))

        seats_total = ride.get("seats_total") or 1
        seats_left = ride.get("seats_available") or 1
        base_fare = 90 + (seats_total - seats_left) * 30
        if pickup_lat is not None and pickup_lng is not None:
            distance = _haversine_km(
                pickup_lat,
                pickup_lng,
                ride.get("dropoff_lat") or pickup_lat,
                ride.get("dropoff_lng") or pickup_lng,
            )
            base_fare = max(40, round(distance * 7))

        route = ride.get("optimized_route") or {}
        route["match_score"] = match
        ride["optimized_route"] = route
        ride["route_match_percent"] = match
        ride["estimated_fare_per_rider"] = base_fare
        decorated.append(ride)

    decorated.sort(key=lambda r: (-int(r.get("route_match_percent") or 0), r.get("departure_time") or ""))
    return decorated


# --------------------------------------------------------------------------- #
#  GET /rides/women-only/{community_id}
# --------------------------------------------------------------------------- #

@router.get("/women-only/{community_id}")
async def get_women_only_rides(community_id: str):
    """
    Return all scheduled women-only rides in the given community.
    Joins with users table to include driver name + reliability score.
    """
    result = (
        supabase.table("rides")
        .select(
            "id, pickup_address, dropoff_address, departure_time, "
            "seats_available, seats_total, women_only, optimized_route, "
            "users!rides_driver_id_fkey(id, name, reliability_score, gender)"
        )
        .eq("community_id", community_id)
        .eq("women_only", True)
        .eq("status", "scheduled")
        .gt("seats_available", 0)
        .order("departure_time")
        .execute()
    )

    rides = result.data or []
    logger.info(
        "Fetched %d women-only rides for community %s", len(rides), community_id
    )
    return {"rides": rides, "count": len(rides)}


# --------------------------------------------------------------------------- #
#  GET /rides/search/{community_id}
# --------------------------------------------------------------------------- #

@router.get("/search/{community_id}")
async def search_rides(
    community_id: str,
    women_only: Optional[bool] = Query(default=None, description="Filter for women-only rides"),
    destination: Optional[str] = Query(default=None, description="Drop location text typed by rider"),
    pickup_lat: Optional[float] = Query(default=None, description="Rider pickup latitude"),
    pickup_lng: Optional[float] = Query(default=None, description="Rider pickup longitude"),
    limit: int = Query(default=20, ge=1, le=100),
):
    """
    General ride search within a community.
    Optionally filter by women_only=true.
    Returns scheduled rides with seats available, ordered by departure time.
    """
    query = (
        supabase.table("rides")
        .select(
            "id, pickup_lat, pickup_lng, pickup_address, "
            "dropoff_lat, dropoff_lng, dropoff_address, "
            "departure_time, seats_available, seats_total, women_only, "
            "optimized_route, "
            "users!rides_driver_id_fkey(id, name, phone, reliability_score), "
            "driver_profiles(vehicle_make, vehicle_model, vehicle_number, vehicle_color)"
        )
        .eq("community_id", community_id)
        .eq("status", "scheduled")
        .gt("seats_available", 0)
        .order("departure_time")
        .limit(limit)
    )

    if women_only is True:
        query = query.eq("women_only", True)
    elif women_only is False:
        # Explicitly requesting non-women-only rides
        query = query.eq("women_only", False)
    # If women_only is None, return all rides (no filter applied)

    result = query.execute()
    rides = result.data or []

    if destination:
        needle = destination.strip().lower()
        rides = [
            ride for ride in rides
            if needle in (ride.get("dropoff_address") or "").lower()
            or needle in (ride.get("pickup_address") or "").lower()
        ]

    rides = _decorate_rides(rides, pickup_lat, pickup_lng)

    logger.info(
        "Search: %d rides in community %s (women_only=%s, destination=%s)",
        len(rides),
        community_id,
        women_only,
        destination,
    )
    return {"rides": rides, "count": len(rides)}
