# On /rides/{id}/cancel: find nearby ride within 2km (haversine_km),
# same community, seats_available > 0; reassign stranded riders
"""
backup_match.py — Guaranteed Backup Match (Phase 2).

When a driver cancels within 30 min of departure, every stranded rider is
auto-moved to the nearest available ride in the same community.

Key functions:
  haversine_km(lat1, lng1, lat2, lng2) -> float
  find_backup_ride(stranded_rider_id, cancelled_ride)   -> str | None
  reassign_all_stranded(stranded_rider_ids, cancelled_ride) -> dict
"""

import logging
import math
from datetime import datetime, timezone, timedelta
from typing import Optional

from app.db.supabase_client import supabase
from app.services.notifications import send_backup_ride_notification, send_no_backup_notification

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
#  Haversine distance formula
# --------------------------------------------------------------------------- #

EARTH_RADIUS_KM = 6371.0


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Return the great-circle distance (km) between two GPS coordinates.
    Uses the standard haversine formula — no external libraries required.
    """
    rlat1 = math.radians(lat1)
    rlat2 = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlng / 2) ** 2
    )
    c = 2 * math.asin(math.sqrt(a))
    return EARTH_RADIUS_KM * c


# --------------------------------------------------------------------------- #
#  Core backup-match logic
# --------------------------------------------------------------------------- #

MAX_DROPOFF_DISTANCE_KM = 2.0   # rides whose dropoff is within this radius qualify
LOOKAHEAD_HOURS = 2             # only consider rides departing within this window


def find_backup_ride(stranded_rider_id: str, cancelled_ride: dict) -> Optional[str]:
    """
    Find the best available backup ride for a stranded rider.

    Criteria:
      - Same community as the cancelled ride
      - status = 'scheduled' and seats_available > 0
      - departure_time within the next LOOKAHEAD_HOURS hours
      - dropoff within MAX_DROPOFF_DISTANCE_KM of the cancelled ride's dropoff

    On success:
      - Inserts a ride_request with status='accepted' for the stranded rider
      - Decrements backup ride's seats_available by 1
      - Sends an FCM push notification to the stranded rider

    Returns:
      The backup ride_id (str) if successful, None otherwise.
    """
    now = datetime.now(tz=timezone.utc)
    window_end = now + timedelta(hours=LOOKAHEAD_HOURS)

    try:
        # ------------------------------------------------------------------ #
        # 1. Query candidate rides
        # ------------------------------------------------------------------ #
        result = (
            supabase
            .table("rides")
            .select("*, users!rides_driver_id_fkey(name, fcm_token)")
            .eq("community_id", cancelled_ride["community_id"])
            .eq("status", "scheduled")
            .gt("seats_available", 0)
            .gt("departure_time", now.isoformat())
            .lt("departure_time", window_end.isoformat())
            .execute()
        )
        candidates = result.data or []
        logger.info(
            "Backup match: found %d candidate rides for community %s",
            len(candidates),
            cancelled_ride["community_id"],
        )

        # ------------------------------------------------------------------ #
        # 2. Filter by dropoff proximity using haversine
        # ------------------------------------------------------------------ #
        nearby = []
        for ride in candidates:
            dist_km = haversine_km(
                cancelled_ride["dropoff_lat"],
                cancelled_ride["dropoff_lng"],
                ride["dropoff_lat"],
                ride["dropoff_lng"],
            )
            if dist_km <= MAX_DROPOFF_DISTANCE_KM:
                nearby.append((dist_km, ride))

        if not nearby:
            logger.info("No nearby backup rides found within %.1f km.", MAX_DROPOFF_DISTANCE_KM)
            _notify_no_backup(stranded_rider_id)
            return None

        # Pick the closest dropoff
        nearby.sort(key=lambda x: x[0])
        _, best_ride = nearby[0]
        logger.info(
            "Best backup ride: %s (dropoff %.2f km away)",
            best_ride["id"],
            nearby[0][0],
        )

        # ------------------------------------------------------------------ #
        # 3. Get stranded rider's pickup details from original ride_requests
        # ------------------------------------------------------------------ #
        rider_req_result = (
            supabase
            .table("ride_requests")
            .select("pickup_lat, pickup_lng, pickup_address")
            .eq("ride_id", cancelled_ride["id"])
            .eq("rider_id", stranded_rider_id)
            .limit(1)
            .execute()
        )
        rider_req = (rider_req_result.data or [{}])[0]

        # ------------------------------------------------------------------ #
        # 4. Insert new ride_request for the backup ride
        # ------------------------------------------------------------------ #
        supabase.table("ride_requests").insert({
            "ride_id": best_ride["id"],
            "rider_id": stranded_rider_id,
            "pickup_lat": rider_req.get("pickup_lat", cancelled_ride["pickup_lat"]),
            "pickup_lng": rider_req.get("pickup_lng", cancelled_ride["pickup_lng"]),
            "pickup_address": rider_req.get("pickup_address", cancelled_ride.get("pickup_address")),
            "status": "accepted",
        }).execute()

        # ------------------------------------------------------------------ #
        # 5. Decrement seats_available on backup ride
        # ------------------------------------------------------------------ #
        supabase.table("rides").update({
            "seats_available": best_ride["seats_available"] - 1,
        }).eq("id", best_ride["id"]).execute()

        # ------------------------------------------------------------------ #
        # 6. Send FCM push to stranded rider
        # ------------------------------------------------------------------ #
        user_result = (
            supabase
            .table("users")
            .select("fcm_token, name")
            .eq("id", stranded_rider_id)
            .single()
            .execute()
        )
        rider = user_result.data or {}
        fcm_token = rider.get("fcm_token")

        if fcm_token:
            driver_info = best_ride.get("users") or {}
            driver_name = driver_info.get("name", "your new driver")
            departure_str = _format_time(best_ride.get("departure_time", ""))
            send_backup_ride_notification(fcm_token, driver_name, departure_str)

        logger.info(
            "Stranded rider %s reassigned to backup ride %s",
            stranded_rider_id,
            best_ride["id"],
        )
        return best_ride["id"]

    except Exception as exc:  # noqa: BLE001
        logger.error("find_backup_ride failed for rider %s: %s", stranded_rider_id, exc)
        return None


def reassign_all_stranded(stranded_rider_ids: list[str], cancelled_ride: dict) -> dict:
    """
    Attempt backup match for every stranded rider.

    Returns a summary dict:
      {
        "stranded_count": N,
        "reassigned_count": M,
        "no_backup_count": K,
        "assignments": { rider_id: backup_ride_id | None }
      }
    """
    assignments: dict[str, Optional[str]] = {}
    reassigned = 0

    for rider_id in stranded_rider_ids:
        backup_id = find_backup_ride(rider_id, cancelled_ride)
        assignments[rider_id] = backup_id
        if backup_id:
            reassigned += 1

    return {
        "stranded_count": len(stranded_rider_ids),
        "reassigned_count": reassigned,
        "no_backup_count": len(stranded_rider_ids) - reassigned,
        "assignments": assignments,
    }


# --------------------------------------------------------------------------- #
#  Helpers
# --------------------------------------------------------------------------- #

def _notify_no_backup(rider_id: str) -> None:
    """Send 'no backup found' FCM push to a rider (best-effort)."""
    try:
        result = (
            supabase.table("users")
            .select("fcm_token")
            .eq("id", rider_id)
            .single()
            .execute()
        )
        token = (result.data or {}).get("fcm_token")
        if token:
            send_no_backup_notification(token)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not notify rider %s of no backup: %s", rider_id, exc)


def _format_time(iso_str: str) -> str:
    """Return a human-readable time string like '8:30 AM' from an ISO timestamp."""
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.strftime("%-I:%M %p")
    except Exception:  # noqa: BLE001
        return iso_str