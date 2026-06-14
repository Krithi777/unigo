from fastapi import APIRouter
from app.db.supabase_client import supabase

router = APIRouter()

# POST /rides/create        — RouteMorph init, women_only check
# POST /rides/{id}/join      — add ride_request, re-run RouteMorph
# POST /rides/{id}/cancel    — trigger Backup Match

@router.get("/upcoming/{user_id}")
def get_upcoming_rides(user_id: str):
    response = (
        supabase.table("ride_requests")
        .select("*, rides(*)")
        .eq("rider_id", user_id)
        .execute()
    )
    return response.data
