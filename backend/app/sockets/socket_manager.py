"""
socket_manager.py — Socket.io AsyncServer (Phase 1 + Phase 4).

Events handled (server-side):
  join_ride_room          — rider/driver joins a ride's broadcast room
  leave_ride_room         — rider/driver leaves the room
  driver_location_update  — driver streams GPS coords (Phase 4)
  start_ride              — driver taps 'Start Ride' (Phase 4)
  end_ride                — driver taps 'End Ride' (Phase 4)

Exported emit helpers (called from routers/services):
  emit_route_update(ride_id, route_data)   — Phase 1
  emit_driver_location(ride_id, lat, lng)  — Phase 4
  emit_ride_cancelled(ride_id)             — Phase 2
  emit_ride_started(ride_id)               — Phase 4
  emit_ride_completed(ride_id)             — Phase 4
"""

import logging
from datetime import datetime, timezone

import socketio

from app.db.supabase_client import supabase

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
#  Server setup
# --------------------------------------------------------------------------- #

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",           # tighten in production
    logger=False,
    engineio_logger=False,
)

# ASGI app to mount on FastAPI at /socket.io
socket_app = socketio.ASGIApp(sio, socketio_path="socket.io")


def _room(ride_id: str) -> str:
    return f"ride_{ride_id}"


# --------------------------------------------------------------------------- #
#  Connection lifecycle
# --------------------------------------------------------------------------- #

@sio.event
async def connect(sid: str, environ: dict, auth: dict | None = None):
    logger.info("Socket connected: %s", sid)


@sio.event
async def disconnect(sid: str):
    logger.info("Socket disconnected: %s", sid)


# --------------------------------------------------------------------------- #
#  Room management
# --------------------------------------------------------------------------- #

@sio.event
async def join_ride_room(sid: str, data: dict):
    """
    Client emits: { ride_id: "uuid" }
    Server adds the socket to the ride's broadcast room.
    """
    ride_id = data.get("ride_id")
    if not ride_id:
        logger.warning("join_ride_room missing ride_id from %s", sid)
        return

    await sio.enter_room(sid, _room(ride_id))
    logger.info("Socket %s joined room %s", sid, _room(ride_id))
    await sio.emit("room_joined", {"ride_id": ride_id}, to=sid)


@sio.event
async def leave_ride_room(sid: str, data: dict):
    """
    Client emits: { ride_id: "uuid" }
    """
    ride_id = data.get("ride_id")
    if not ride_id:
        return

    await sio.leave_room(sid, _room(ride_id))
    logger.info("Socket %s left room %s", sid, _room(ride_id))


# --------------------------------------------------------------------------- #
#  Phase 4 — Driver location streaming
# --------------------------------------------------------------------------- #

@sio.event
async def driver_location_update(sid: str, data: dict):
    """
    Driver emits every 3 seconds:
      { ride_id: str, lat: float, lng: float, heading?: float }

    Broadcasts location_update to all riders in the ride room.
    """
    ride_id = data.get("ride_id")
    lat = data.get("lat")
    lng = data.get("lng")

    if not all([ride_id, lat is not None, lng is not None]):
        logger.warning("driver_location_update missing fields: %s", data)
        return

    payload = {
        "lat": lat,
        "lng": lng,
        "heading": data.get("heading"),
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
    }
    await sio.emit("location_update", payload, room=_room(ride_id), skip_sid=sid)


# --------------------------------------------------------------------------- #
#  Phase 4 — Ride lifecycle events (via socket, mirroring HTTP endpoints)
# --------------------------------------------------------------------------- #

@sio.event
async def start_ride(sid: str, data: dict):
    """
    Driver emits: { ride_id: str }
    Updates ride status in DB and broadcasts ride_started to the room.
    """
    ride_id = data.get("ride_id")
    if not ride_id:
        return

    try:
        supabase.table("rides").update({"status": "active"}).eq("id", ride_id).execute()
    except Exception as exc:  # noqa: BLE001
        logger.error("start_ride DB update failed: %s", exc)

    await sio.emit("ride_started", {"ride_id": ride_id}, room=_room(ride_id))
    logger.info("Ride %s started via socket", ride_id)


@sio.event
async def end_ride(sid: str, data: dict):
    """
    Driver emits: { ride_id: str }
    Updates ride status to completed in DB and broadcasts ride_completed.
    Ruvanthika's reliability score and dashboard hooks listen for this event.
    """
    ride_id = data.get("ride_id")
    if not ride_id:
        return

    now = datetime.now(tz=timezone.utc).isoformat()
    try:
        supabase.table("rides").update({
            "status": "completed",
            "completed_at": now,
        }).eq("id", ride_id).execute()

        # Mark accepted ride_requests as completed
        supabase.table("ride_requests").update(
            {"status": "completed"}
        ).eq("ride_id", ride_id).eq("status", "accepted").execute()

    except Exception as exc:  # noqa: BLE001
        logger.error("end_ride DB update failed: %s", exc)

    await sio.emit("ride_completed", {"ride_id": ride_id, "completed_at": now}, room=_room(ride_id))
    logger.info("Ride %s completed via socket", ride_id)


# --------------------------------------------------------------------------- #
#  Exported emit helpers — called from routers and services
# --------------------------------------------------------------------------- #

async def emit_route_update(ride_id: str, route_data: dict) -> None:
    """
    Phase 1 — Broadcast updated optimised route to all clients in the ride room.
    Called by run_routemorph() after each join.
    """
    await sio.emit(
        "route_updated",
        {"ride_id": ride_id, "route": route_data},
        room=_room(ride_id),
    )
    logger.debug("route_updated emitted to room %s", _room(ride_id))


async def emit_driver_location(ride_id: str, lat: float, lng: float) -> None:
    """
    Phase 4 — Programmatic location emit (e.g. from HTTP endpoint if needed).
    """
    await sio.emit(
        "location_update",
        {
            "lat": lat,
            "lng": lng,
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        },
        room=_room(ride_id),
    )


async def emit_ride_cancelled(ride_id: str) -> None:
    """
    Phase 2 — Notify all riders that their ride has been cancelled.
    Frontend shows 'Finding a backup...' banner.
    """
    await sio.emit(
        "ride_cancelled",
        {"ride_id": ride_id},
        room=_room(ride_id),
    )
    logger.info("ride_cancelled emitted to room %s", _room(ride_id))


async def emit_ride_started(ride_id: str) -> None:
    """Phase 4 — Notify riders that the driver has started the ride."""
    await sio.emit("ride_started", {"ride_id": ride_id}, room=_room(ride_id))


async def emit_ride_completed(ride_id: str) -> None:
    """Phase 4 — Notify all clients that the ride is complete."""
    await sio.emit(
        "ride_completed",
        {"ride_id": ride_id, "completed_at": datetime.now(tz=timezone.utc).isoformat()},
        room=_room(ride_id),
    )