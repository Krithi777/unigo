# Calls Google Directions API (optimize:true) with pickup waypoints,
# returns optimized stop order. Used on /rides/create and /rides/{id}/join
"""
route_engine.py — RouteMorph Engine (Phase 1).

Core function: run_routemorph(ride_id)
  1. Fetches the ride + all active ride_requests
  2. Calls OpenRouteService (ORS) Directions API with optimize_waypoints:true
  3. Saves the optimised route JSON back to rides.optimized_route
  4. Emits 'route_updated' via Socket.io to all clients in the ride room
"""

import logging
import os
from typing import Optional

import httpx

from app.db.supabase_client import supabase
from app.sockets.socket_manager import emit_route_update

logger = logging.getLogger(__name__)

ORS_API_KEY = os.getenv("ORS_API_KEY", "")
ORS_DIRECTIONS_URL = "https://api.openrouteservice.org/v2/directions/driving-car/json"


async def run_routemorph(ride_id: str) -> Optional[dict]:
    """
    Re-optimise the pickup order for a ride whenever a rider joins or is accepted.

    Returns the optimized_route dict that was saved to the DB, or None if
    there were no riders yet / the API call failed.

    NOTE on coordinate order:
        Google Maps uses  (lat, lng)
        ORS expects       [lng, lat]   ← reversed
    All conversions are handled below before sending to ORS.
    """
    # ------------------------------------------------------------------ #
    # 1. Fetch ride record
    # ------------------------------------------------------------------ #
    ride_res = supabase.table("rides").select("*").eq("id", ride_id).single().execute()
    ride = ride_res.data
    if not ride:
        logger.warning("RouteMorph: ride %s not found", ride_id)
        return None

    # ------------------------------------------------------------------ #
    # 2. Fetch all active ride_requests
    # ------------------------------------------------------------------ #
    reqs_res = (
        supabase.table("ride_requests")
        .select("pickup_lat, pickup_lng, pickup_address, rider_id")
        .eq("ride_id", ride_id)
        .in_("status", ["pending", "accepted"])
        .execute()
    )
    requests = reqs_res.data or []

    if not requests:
        logger.info("RouteMorph: no riders for ride %s yet — skipping", ride_id)
        return None

    # ------------------------------------------------------------------ #
    # 3. Build ORS coordinates list
    #    ORS format: [[lng, lat], [lng, lat], ...]
    #    Order: driver pickup → rider pickups (to be optimised) → destination
    # ------------------------------------------------------------------ #
    driver_pickup  = [ride["pickup_lng"],  ride["pickup_lat"]]
    destination    = [ride["dropoff_lng"], ride["dropoff_lat"]]
    rider_pickups  = [[r["pickup_lng"], r["pickup_lat"]] for r in requests]

    coordinates = [driver_pickup] + rider_pickups + [destination]

    payload = {
        "coordinates": coordinates,
        "optimize_waypoints": True,
        "instructions": False,          # saves response size; we only need geometry
        "geometry": True,               # returns overview_polyline
        "units": "m",
    }

    headers = {
        "Authorization": ORS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json, application/geo+json",
    }

    # ------------------------------------------------------------------ #
    # 4. Call ORS Directions API
    # ------------------------------------------------------------------ #
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                ORS_DIRECTIONS_URL, json=payload, headers=headers
            )
            response.raise_for_status()
            directions = response.json()
    except httpx.HTTPError as exc:
        logger.error("RouteMorph: ORS API HTTP error: %s", exc)
        return None

    # ORS returns errors inside the JSON body with an "error" key
    if "error" in directions:
        logger.error(
            "RouteMorph: ORS returned error=%s for ride %s",
            directions["error"],
            ride_id,
        )
        return None

    # ------------------------------------------------------------------ #
    # 5. Parse the optimised result
    #
    #    ORS response structure (driving-car/json):
    #    {
    #      "routes": [{
    #        "summary": { "distance": float (m), "duration": float (sec) },
    #        "segments": [ { "distance", "duration", "steps": [...] }, ... ],
    #        "geometry": "<encoded_polyline_string>",   ← same format as Google
    #        "way_points": [0, 2, 1, 3]                ← optimised index order
    #                                                      of the coordinates list
    #      }]
    #    }
    #
    #    way_points[0]  is always the origin (driver pickup)   → skip
    #    way_points[-1] is always the destination              → skip
    #    The middle entries are the re-ordered rider indices (1-based into
    #    coordinates[], so subtract 1 to get the index into `requests`).
    # ------------------------------------------------------------------ #
    route = directions["routes"][0]

    # way_points: e.g. [0, 2, 1, 3] for 2 riders
    # Strip the first (origin) and last (destination) fixed points
    raw_way_points: list[int] = route.get("way_points", [])
    # Inner indices correspond to positions in `coordinates` list.
    # rider pickup coordinates start at index 1, so subtract 1 to map back
    # to the `requests` list.
    waypoint_order: list[int] = [wp - 1 for wp in raw_way_points[1:-1]]

    # Segments map 1-to-1 with each leg of the journey
    segments = route.get("segments", [])
    legs = [
        {
            "distance_text": f"{seg['distance'] / 1000:.1f} km",
            "distance_m": seg["distance"],
            "duration_text": f"{int(seg['duration'] // 60)} min",
            "duration_sec": seg["duration"],
        }
        for seg in segments
    ]

    # Ordered list of pickup stops in the sequence the driver will visit them
    ordered_stops = [
        {
            "index": idx,
            "rider_id": requests[idx]["rider_id"],
            "pickup_lat": requests[idx]["pickup_lat"],
            "pickup_lng": requests[idx]["pickup_lng"],
            "pickup_address": requests[idx].get("pickup_address"),
        }
        for idx in waypoint_order
        if 0 <= idx < len(requests)   # safety guard
    ]

    summary = route.get("summary", {})
    optimized_route = {
        "waypoint_order": waypoint_order,
        "ordered_stops": ordered_stops,
        "legs": legs,
        "overview_polyline": route.get("geometry", ""),   # same encoded format as Google
        "total_distance_m": summary.get("distance", 0),
        "total_duration_sec": summary.get("duration", 0),
    }

    # ------------------------------------------------------------------ #
    # 6. Persist to DB
    # ------------------------------------------------------------------ #
    supabase.table("rides").update(
        {"optimized_route": optimized_route}
    ).eq("id", ride_id).execute()

    # ------------------------------------------------------------------ #
    # 7. Broadcast to ride room via Socket.io
    # ------------------------------------------------------------------ #
    await emit_route_update(ride_id, optimized_route)

    logger.info(
        "RouteMorph complete for ride %s — %d stops, optimised order: %s",
        ride_id,
        len(ordered_stops),
        waypoint_order,
    )
    return optimized_route