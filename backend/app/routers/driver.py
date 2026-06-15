"""
Driver router — all endpoints used by the mobile app and admin panel.

Endpoints:
  POST /driver/setup              — save vehicle info (upsert driver_profiles)
  POST /driver/check-vehicle      — check vehicle number format + uniqueness
  POST /driver/upload-document    — upload license / rc / insurance / puc to Supabase Storage
  POST /driver/submit-review      — move driver to pending_review state
  GET  /driver/profile            — get own driver profile + doc URLs
  GET  /driver/today              — today's ride + pending ride_requests
  GET  /driver/history/{id}       — driver ride history

Admin endpoints (registered in admin_router, mounted at /admin in main.py):
  GET  /admin/pending-drivers
  GET  /admin/driver/{user_id}
  POST /admin/review-document
  POST /admin/set-driver-active
"""

import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Header, UploadFile, File, Form
from pydantic import BaseModel

from app.db.supabase_client import supabase
from app.core.firebase import verify_id_token, _get_app

router = APIRouter()
admin_router = APIRouter()

# Supabase Storage bucket — create this bucket in your Supabase dashboard
BUCKET = "driver-docs"


# ─── Auth helpers ─────────────────────────────────────────────────────────────

def _require_user(authorization: str) -> dict:
    """
    Accept either a Firebase ID token or a custom token (JWT minted by our server).
    Custom tokens are issued during email-verify flows and used until the driver
    completes account setup and gets a real ID token.
    """
    raw = authorization.replace("Bearer ", "").strip()
    if not raw or raw == "null":
        raise HTTPException(status_code=401, detail="Missing auth token")

    uid: str | None = None

    # Try Firebase ID token first
    try:
        decoded = verify_id_token(raw)
        uid = decoded["uid"]
    except Exception:
        pass

    # Fall back to custom token (server-minted JWT)
    if uid is None:
        try:
            import jwt as pyjwt
            decoded = pyjwt.decode(raw, options={"verify_signature": False})
            uid = decoded.get("uid") or decoded.get("sub")
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    if not uid:
        raise HTTPException(status_code=401, detail="Could not extract UID from token")

    result = (
        supabase.table("users")
        .select("*")
        .eq("firebase_uid", uid)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    return result.data[0]


def _require_admin(authorization: str) -> dict:
    user = _require_user(authorization)
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")
    return user


def _get_driver_profile(user_id: str) -> Optional[dict]:
    result = (
        supabase.table("driver_profiles")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


# ─── Schemas ──────────────────────────────────────────────────────────────────

class VehicleSetupPayload(BaseModel):
    vehicle_number: Optional[str] = None
    license_number: Optional[str] = None
    vehicle_make: Optional[str] = None
    vehicle_model: Optional[str] = None
    vehicle_color: Optional[str] = None
    vehicle_type: Optional[str] = None
    seats_available_default: Optional[int] = None


class DriverSetupPayload(BaseModel):
    vehicle: Optional[VehicleSetupPayload] = None
    full_name: Optional[str] = None


class CheckVehiclePayload(BaseModel):
    vehicle_number: str


class ReviewDocumentPayload(BaseModel):
    driver_user_id: str
    doc_type: str
    approved: bool
    rejection_note: Optional[str] = None


class SetDriverActivePayload(BaseModel):
    driver_user_id: str
    is_active: bool


# ─── POST /driver/setup ───────────────────────────────────────────────────────

@router.post("/setup")
def driver_setup(payload: DriverSetupPayload, authorization: str = Header(...)):
    user = _require_user(authorization)
    user_id = user["id"]

    update_data: dict = {}
    if payload.vehicle:
        v = payload.vehicle
        if v.vehicle_number is not None:
            update_data["vehicle_number"] = v.vehicle_number.upper().replace(" ", "").replace("-", "")
        if v.license_number is not None:
            update_data["license_number"] = v.license_number.upper()
        if v.vehicle_make is not None:
            update_data["vehicle_make"] = v.vehicle_make
        if v.vehicle_model is not None:
            update_data["vehicle_model"] = v.vehicle_model
        if v.vehicle_color is not None:
            update_data["vehicle_color"] = v.vehicle_color
        if v.vehicle_type is not None:
            update_data["vehicle_type"] = v.vehicle_type
        if v.seats_available_default is not None:
            update_data["seats_available_default"] = v.seats_available_default

    existing = _get_driver_profile(user_id)

    if existing:
        result = (
            supabase.table("driver_profiles")
            .update(update_data)
            .eq("user_id", user_id)
            .execute()
        )
        driver_profile = result.data[0] if result.data else existing
    else:
        insert_data = {
            "user_id": user_id,
            "submission_state": "incomplete",
            "is_active": False,
            "license_verified": False,
            "license_number": update_data.pop("license_number", ""),
            "vehicle_number": update_data.pop("vehicle_number", ""),
            **update_data,
        }
        result = supabase.table("driver_profiles").insert(insert_data).execute()
        driver_profile = result.data[0]

    return {"driver_profile": driver_profile}


# ─── POST /driver/check-vehicle ───────────────────────────────────────────────

@router.post("/check-vehicle")
def check_vehicle(payload: CheckVehiclePayload, authorization: str = Header(...)):
    _require_user(authorization)
    num = payload.vehicle_number.upper().replace(" ", "").replace("-", "")
    result = (
        supabase.table("driver_profiles")
        .select("user_id")
        .eq("vehicle_number", num)
        .limit(1)
        .execute()
    )
    return {"valid": True, "taken": bool(result.data), "vehicle_number": num}


# ─── POST /driver/upload-document ─────────────────────────────────────────────

@router.post("/upload-document")
async def upload_document(
    authorization: str = Header(...),
    doc_type: str = Form(...),
    file: UploadFile = File(...),
):
    VALID_DOC_TYPES = {"license", "rc", "insurance", "puc"}
    if doc_type not in VALID_DOC_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid doc_type. Must be one of: {VALID_DOC_TYPES}")

    user = _require_user(authorization)
    user_id = user["id"]

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10 MB)")

    content_type = file.content_type or "image/jpeg"
    ext_map = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "application/pdf": "pdf",
    }
    ext = ext_map.get(content_type, "jpg")

    storage_path = f"{user_id}/{doc_type}.{ext}"

    try:
        supabase.storage.from_(BUCKET).upload(
            path=storage_path,
            file=contents,
            file_options={"content-type": content_type, "upsert": "true"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {e}")

    try:
        url_result = supabase.storage.from_(BUCKET).get_public_url(storage_path)
        public_url = url_result if isinstance(url_result, str) else url_result.get("publicUrl", "")
    except Exception:
        supabase_url = os.environ.get("SUPABASE_URL", "")
        public_url = f"{supabase_url}/storage/v1/object/public/{BUCKET}/{storage_path}"

    url_col = f"{doc_type}_url"
    existing = _get_driver_profile(user_id)

    if existing:
        supabase.table("driver_profiles").update({url_col: public_url}).eq("user_id", user_id).execute()
    else:
        supabase.table("driver_profiles").insert({
            "user_id": user_id,
            "submission_state": "incomplete",
            "is_active": False,
            "license_verified": False,
            "license_number": "",
            "vehicle_number": "",
            url_col: public_url,
        }).execute()

    driver_profile = _get_driver_profile(user_id)
    return {"driver_profile": driver_profile, "url": public_url}


# ─── POST /driver/submit-review ───────────────────────────────────────────────

@router.post("/submit-review")
def submit_review(authorization: str = Header(...)):
    user = _require_user(authorization)
    user_id = user["id"]

    dp = _get_driver_profile(user_id)
    if not dp:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    missing = [d for d in ["license_url", "rc_url", "insurance_url", "puc_url"] if not dp.get(d)]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing documents: {', '.join(missing)}. Upload all 4 before submitting.",
        )

    result = (
        supabase.table("driver_profiles")
        .update({"submission_state": "pending_review"})
        .eq("user_id", user_id)
        .execute()
    )
    return {"driver_profile": result.data[0] if result.data else dp}


# ─── GET /driver/profile ──────────────────────────────────────────────────────

@router.get("/profile")
def get_driver_profile_route(authorization: str = Header(...)):
    user = _require_user(authorization)
    dp = _get_driver_profile(user["id"])
    if not dp:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    return {"driver_profile": dp, "user": user}


# ─── GET /driver/today ────────────────────────────────────────────────────────

@router.get("/today")
def driver_today(authorization: str = Header(...)):
    user = _require_user(authorization)
    from datetime import date
    today = date.today().isoformat()

    rides = (
        supabase.table("rides")
        .select("*")
        .eq("driver_id", user["id"])
        .gte("departure_time", f"{today}T00:00:00")
        .lte("departure_time", f"{today}T23:59:59")
        .neq("status", "cancelled")
        .order("departure_time")
        .execute()
    )

    ride = rides.data[0] if rides.data else None
    pending_requests = []
    if ride:
        reqs = (
            supabase.table("ride_requests")
            .select("*, users(id, name, phone, gender, reliability_score)")
            .eq("ride_id", ride["id"])
            .eq("status", "pending")
            .execute()
        )
        pending_requests = reqs.data or []

    return {"ride": ride, "pending_requests": pending_requests}


# ─── GET /driver/history/{driver_id} ─────────────────────────────────────────

@router.get("/history/{driver_id}")
def driver_history(driver_id: str, authorization: str = Header(...)):
    _require_user(authorization)
    rides = (
        supabase.table("rides")
        .select("*, ride_requests(id, status, fare_share, rider_id)")
        .eq("driver_id", driver_id)
        .in_("status", ["completed", "cancelled"])
        .order("departure_time", desc=True)
        .limit(50)
        .execute()
    )
    return {"rides": rides.data or []}


# ═══════════════════════════════════════════════════════════════════════════════
# ADMIN ROUTER  (mounted at /admin in main.py)
# ═══════════════════════════════════════════════════════════════════════════════

@admin_router.get("/pending-drivers")
def get_pending_drivers(authorization: str = Header(...)):
    _require_admin(authorization)
    result = (
        supabase.table("driver_profiles")
        .select("*, users(id, name, phone, email)")
        .in_("submission_state", ["pending_review", "action_required"])
        .order("created_at", desc=True)
        .execute()
    )
    drivers = []
    for row in result.data or []:
        user_info = row.pop("users", {}) or {}
        drivers.append({**row, **user_info, "user_id": row["user_id"]})
    return {"drivers": drivers}


@admin_router.get("/driver/{user_id}")
def get_driver_detail(user_id: str, authorization: str = Header(...)):
    _require_admin(authorization)
    result = (
        supabase.table("driver_profiles")
        .select("*, users(id, name, phone, email)")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Driver not found")
    row = result.data[0]
    user_info = row.pop("users", {}) or {}
    return {"driver": {**row, **user_info, "user_id": row["user_id"]}}


@admin_router.post("/review-document")
def review_document(payload: ReviewDocumentPayload, authorization: str = Header(...)):
    _require_admin(authorization)
    if payload.doc_type not in {"license", "rc", "insurance", "puc"}:
        raise HTTPException(status_code=400, detail="Invalid doc_type")

    verified_col = f"{payload.doc_type}_verified"

    dp_result = (
        supabase.table("driver_profiles")
        .select("*")
        .eq("user_id", payload.driver_user_id)
        .limit(1)
        .execute()
    )
    if not dp_result.data:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    dp = dp_result.data[0]
    updated = {**dp, verified_col: payload.approved}
    update_data: dict = {verified_col: payload.approved}

    all_docs = ["license_verified", "rc_verified", "insurance_verified", "puc_verified"]
    if not payload.approved:
        update_data["submission_state"] = "action_required"
    elif all(updated.get(d) for d in all_docs):
        update_data["submission_state"] = "active"
        update_data["is_active"] = True

    result = (
        supabase.table("driver_profiles")
        .update(update_data)
        .eq("user_id", payload.driver_user_id)
        .execute()
    )
    driver_profile = result.data[0] if result.data else None
    return {"driver_profile": driver_profile, "is_active": driver_profile.get("is_active", False) if driver_profile else False}


@admin_router.post("/set-driver-active")
def set_driver_active(payload: SetDriverActivePayload, authorization: str = Header(...)):
    _require_admin(authorization)
    supabase.table("driver_profiles").update({"is_active": payload.is_active}).eq(
        "user_id", payload.driver_user_id
    ).execute()
    return {"ok": True}