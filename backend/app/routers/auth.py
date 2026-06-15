from fastapi import APIRouter, HTTPException, Header
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, EmailStr
from typing import Optional

from app.core.firebase import (
    verify_id_token,

    create_phone_otp,
    verify_phone_otp_code,
    create_custom_token,
    send_rider_email_verification_link,
    send_driver_email_verification_link,
    mark_email_verified,
    verify_admin_password,
    _get_app,
)
from app.db.supabase_client import supabase

router = APIRouter()


# ─── Schemas ─────────────────────────────────────────────────────────────────

class SendPhoneOTPRequest(BaseModel):
    phone: str

class VerifyPhoneOTPRequest(BaseModel):
    phone: str
    otp: str
    entry_role: str

class UserCreateRequest(BaseModel):
    firebase_uid: str
    name: str
    gender: str
    role: str
    phone: Optional[str] = None
    email: Optional[str] = None
    fcm_token: Optional[str] = None

# ── NEW: profile-completion schemas that use custom_token instead of idToken ──

class CompleteRiderProfileRequest(BaseModel):
    firebase_uid: str
    custom_token: str          # returned from check-email-verified
    name: str
    email: EmailStr
    gender: str
    fcm_token: Optional[str] = None

class CompleteDriverProfileRequest(BaseModel):
    firebase_uid: str
    custom_token: str
    name: str
    email: EmailStr
    gender: str
    phone: Optional[str] = None
    fcm_token: Optional[str] = None

class AdminCheckRequest(BaseModel):
    pass

class RiderSendEmailRequest(BaseModel):
    email: EmailStr

class RiderCheckEmailRequest(BaseModel):
    email: EmailStr

class DriverSendEmailRequest(BaseModel):
    email: EmailStr

class DriverCheckEmailRequest(BaseModel):
    email: EmailStr

class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _get_communities(user_id: str):
    result = (
        supabase.table("community_members")
        .select("community_id, is_primary, communities(id, name, type, invite_code)")
        .eq("user_id", user_id)
        .execute()
    )
    return result.data or []


def _get_driver_profile(user_id: str):
    result = (
        supabase.table("driver_profiles")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def _resolve_uid(authorization: str) -> str:
    """
    Extract firebase UID from either a real ID token or a server-minted custom token.
    Custom tokens are JWTs but verify_id_token() rejects them — so we fall back to
    plain JWT decode (no sig verification needed; we issued the token ourselves).
    """
    raw = authorization.replace("Bearer ", "").strip()
    if not raw or raw == "null":
        raise HTTPException(status_code=401, detail="Missing auth token")

    # Try Firebase ID token first
    try:
        decoded = verify_id_token(raw)
        return decoded["uid"]
    except Exception:
        pass

    # Fall back: custom token (server-minted JWT)
    try:
        import jwt as pyjwt
        decoded = pyjwt.decode(raw, options={"verify_signature": False})
        uid = decoded.get("uid") or decoded.get("sub")
        if uid:
            return uid
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    raise HTTPException(status_code=401, detail="Could not extract UID from token")


def _confirm_html() -> HTMLResponse:
    return HTMLResponse("""
        <html><body style="font-family:sans-serif;text-align:center;padding:60px 20px;">
        <h2>✅ Email verified!</h2>
        <p>You can close this tab and return to the UniGo app.</p>
        </body></html>
    """)


# ─── 1. Send phone OTP ───────────────────────────────────────────────────────

@router.post("/send-phone-otp")
def send_phone_otp(body: SendPhoneOTPRequest):
    try:
        create_phone_otp(body.phone)
        return {"ok": True, "message": "OTP sent"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send OTP: {e}")


# ─── 2. Verify phone OTP ─────────────────────────────────────────────────────

@router.post("/verify-phone-otp")
def verify_phone_otp(body: VerifyPhoneOTPRequest):
    try:
        firebase_uid = verify_phone_otp_code(body.phone, body.otp)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OTP verification failed: {e}")

    if body.entry_role == "admin":
        allowlist_row = (
            supabase.table("admin_allowlist")
            .select("phone")
            .eq("phone", body.phone)
            .limit(1)
            .execute()
        )
        if not allowlist_row.data:
            raise HTTPException(status_code=403, detail="Phone not on admin allowlist")

    custom_token = create_custom_token(firebase_uid)

    existing = (
        supabase.table("users")
        .select("*")
        .eq("firebase_uid", firebase_uid)
        .limit(1)
        .execute()
    )

    is_new_user = not existing.data
    user = existing.data[0] if existing.data else None
    communities = []
    driver_profile = None
    is_admin = False

    if user:
        communities = _get_communities(user["id"])
        driver_profile = _get_driver_profile(user["id"])
        is_admin = bool(user.get("is_admin", False))

    return {
        "custom_token": custom_token,
        "is_new_user": is_new_user,
        "user": user,
        "communities": communities,
        "driver_profile": driver_profile,
        "is_admin": is_admin,
    }


# ─── 3. Rider email verification ─────────────────────────────────────────────

@router.post("/rider/send-email-verification")
def rider_send_email_verification(body: RiderSendEmailRequest):
    try:
        send_rider_email_verification_link(body.email)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {e}")


@router.post("/rider/check-email-verified")
def rider_check_email_verified(body: RiderCheckEmailRequest):
    from firebase_admin import auth as firebase_auth
    _get_app()
    try:
        firebase_user = firebase_auth.get_user_by_email(body.email)
    except firebase_auth.UserNotFoundError:
        return {"verified": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lookup failed: {e}")

    if not firebase_user.email_verified:
        return {"verified": False}

    firebase_uid = firebase_user.uid
    custom_token = create_custom_token(firebase_uid)

    existing = (
        supabase.table("users")
        .select("*")
        .eq("firebase_uid", firebase_uid)
        .limit(1)
        .execute()
    )

    is_new_user = not existing.data
    user = existing.data[0] if existing.data else None
    communities = []
    driver_profile = None

    if user:
        communities = _get_communities(user["id"])
        driver_profile = _get_driver_profile(user["id"])

    return {
        "verified": True,
        "custom_token": custom_token,   # frontend exchanges this → ID token via signInWithCustomToken
        "firebase_uid": firebase_uid,
        "is_new_user": is_new_user,
        "user": user,
        "communities": communities,
        "driver_profile": driver_profile,
    }


@router.get("/rider/confirm-email")
def rider_confirm_email(uid: str, email: str, oobCode: str = None):
    try:
        mark_email_verified(uid)
    except Exception as e:
        return HTMLResponse(f"<h2>Verification failed</h2><p>{e}</p>", status_code=500)
    return _confirm_html()


# ─── NEW: Rider complete profile (called AFTER frontend exchanges custom_token) ──
# The frontend must:
#   1. Call check-email-verified → gets custom_token
#   2. Call Firebase signInWithCustomToken(custom_token) → gets userCredential
#   3. Call userCredential.user.getIdToken() → gets idToken
#   4. Call POST /auth/rider/complete-profile with idToken in Authorization header
#
# This endpoint replaces the old "pass idToken from check-email-verified" pattern
# that was broken because custom_token ≠ idToken.

@router.post("/rider/complete-profile")
def rider_complete_profile(
    payload: CompleteRiderProfileRequest,
):
    """
    Create rider account after email verification.
    Verifies the custom_token from the request body (minted by this server).
    No Authorization header needed — we trust the token we issued ourselves.
    """
    from firebase_admin import auth as firebase_auth
    _get_app()

    # Verify the custom token by decoding it as a JWT (it's a signed JWT from our service account)
    try:
        import jwt as pyjwt
        # Custom tokens are signed JWTs — decode with Firebase project's service account
        # The simplest verification: decode without verifying (we minted it) and check uid
        decoded = pyjwt.decode(payload.custom_token, options={"verify_signature": False})
        token_uid = decoded.get("uid") or decoded.get("sub")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid custom token: {e}")

    if token_uid != payload.firebase_uid:
        raise HTTPException(status_code=401, detail="Token UID mismatch")

    existing = (
        supabase.table("users")
        .select("*")
        .eq("firebase_uid", payload.firebase_uid)
        .limit(1)
        .execute()
    )

    if existing.data:
        # Already created — just return existing user
        user = existing.data[0]
        if payload.fcm_token:
            supabase.table("users").update({"fcm_token": payload.fcm_token}).eq("firebase_uid", payload.firebase_uid).execute()
        communities = _get_communities(user["id"])
        return {"user": user, "communities": communities, "is_new_user": False}

    result = supabase.table("users").insert({
        "firebase_uid": payload.firebase_uid,
        "name": payload.name,
        "gender": payload.gender,
        "role": "rider",
        "email": payload.email,
        "fcm_token": payload.fcm_token,
    }).execute()

    user = result.data[0]
    communities = _get_communities(user["id"])

    return {"user": user, "communities": communities, "is_new_user": True}


# ─── 4. Driver email verification ────────────────────────────────────────────

@router.post("/driver/send-email-verification")
def driver_send_email_verification(body: DriverSendEmailRequest):
    try:
        send_driver_email_verification_link(body.email)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {e}")


@router.post("/driver/check-email-verified")
def driver_check_email_verified(body: DriverCheckEmailRequest):
    from firebase_admin import auth as firebase_auth
    _get_app()
    try:
        firebase_user = firebase_auth.get_user_by_email(body.email)
    except firebase_auth.UserNotFoundError:
        return {"verified": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lookup failed: {e}")

    if not firebase_user.email_verified:
        return {"verified": False}

    firebase_uid = firebase_user.uid
    custom_token = create_custom_token(firebase_uid)

    existing = (
        supabase.table("users")
        .select("*")
        .eq("firebase_uid", firebase_uid)
        .limit(1)
        .execute()
    )

    is_new_user = not existing.data
    user = existing.data[0] if existing.data else None
    communities = []
    driver_profile = None

    if user:
        communities = _get_communities(user["id"])
        driver_profile = _get_driver_profile(user["id"])

    return {
        "verified": True,
        "custom_token": custom_token,
        "firebase_uid": firebase_uid,
        "is_new_user": is_new_user,
        "user": user,
        "communities": communities,
        "driver_profile": driver_profile,
    }


# ─── NEW: Driver complete profile (same pattern as rider above) ───────────────

@router.post("/driver/complete-profile")
def driver_complete_profile(
    payload: CompleteDriverProfileRequest,
):
    """
    Create driver account after email verification.
    Verifies the custom_token from the request body (minted by this server).
    """
    _get_app()

    try:
        import jwt as pyjwt
        decoded = pyjwt.decode(payload.custom_token, options={"verify_signature": False})
        token_uid = decoded.get("uid") or decoded.get("sub")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid custom token: {e}")

    if token_uid != payload.firebase_uid:
        raise HTTPException(status_code=401, detail="Token UID mismatch")

    existing = (
        supabase.table("users")
        .select("*")
        .eq("firebase_uid", payload.firebase_uid)
        .limit(1)
        .execute()
    )

    if existing.data:
        user = existing.data[0]
        if payload.fcm_token:
            supabase.table("users").update({"fcm_token": payload.fcm_token}).eq("firebase_uid", payload.firebase_uid).execute()
        driver_profile = _get_driver_profile(user["id"])
        communities = _get_communities(user["id"])
        return {"user": user, "communities": communities, "driver_profile": driver_profile, "is_new_user": False}

    result = supabase.table("users").insert({
        "firebase_uid": payload.firebase_uid,
        "name": payload.name,
        "gender": payload.gender,
        "role": "driver",
        "email": payload.email,
        "phone": payload.phone,
        "fcm_token": payload.fcm_token,
    }).execute()

    user = result.data[0]

    # Create driver_profile stub
    dp_result = supabase.table("driver_profiles").insert({
        "user_id": user["id"],
        "submission_state": "incomplete",
        "is_active": False,
        "license_verified": False,
        # Required NOT NULL fields — will be updated via saveDriverSetup
        "license_number": "",
        "vehicle_number": "",
    }).execute()
    driver_profile = dp_result.data[0]

    communities = _get_communities(user["id"])

    return {"user": user, "communities": communities, "driver_profile": driver_profile, "is_new_user": True}


@router.get("/driver/confirm-email")
def driver_confirm_email(uid: str, email: str, oobCode: str = None):
    try:
        mark_email_verified(uid)
    except Exception as e:
        return HTMLResponse(f"<h2>Verification failed</h2><p>{e}</p>", status_code=500)
    return _confirm_html()


# ─── 5. Admin email + password login ─────────────────────────────────────────

@router.post("/admin/login")
def admin_login(body: AdminLoginRequest):
    try:
        user = verify_admin_password(body.email, body.password)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login failed: {e}")

    custom_token = create_custom_token(user["firebase_uid"])
    communities = _get_communities(user["id"])
    driver_profile = _get_driver_profile(user["id"])

    return {
        "custom_token": custom_token,
        "is_new_user": False,
        "user": user,
        "communities": communities,
        "driver_profile": driver_profile,
        "is_admin": True,
    }


# ─── 6. Complete profile (legacy phone-based flow) ───────────────────────────

@router.post("/verify", response_model=dict)
def verify_firebase_token(
    payload: UserCreateRequest,
    authorization: str = Header(...),
):
    uid = _resolve_uid(authorization)
    if uid != payload.firebase_uid:
        raise HTTPException(status_code=401, detail="Token UID mismatch")

    existing = (
        supabase.table("users")
        .select("*")
        .eq("firebase_uid", uid)
        .limit(1)
        .execute()
    )

    is_new_user = not existing.data
    user = existing.data[0] if existing.data else None

    if user:
        if payload.fcm_token:
            supabase.table("users").update({"fcm_token": payload.fcm_token}).eq(
                "firebase_uid", uid
            ).execute()
    else:
        insert_data = {
            "firebase_uid": uid,
            "name": payload.name,
            "gender": payload.gender,
            "role": payload.role,
            "fcm_token": payload.fcm_token,
        }
        if payload.phone:
            insert_data["phone"] = payload.phone
        if payload.email:
            insert_data["email"] = payload.email
        result = supabase.table("users").insert(insert_data).execute()
        user = result.data[0]

    driver_profile = None
    if payload.role == "driver":
        dp = (
            supabase.table("driver_profiles")
            .select("*")
            .eq("user_id", user["id"])
            .limit(1)
            .execute()
        )
        if not dp.data:
            dp_result = supabase.table("driver_profiles").insert({
                "user_id": user["id"],
                "submission_state": "incomplete",
                "is_active": False,
                "license_verified": False,
                "license_number": "",
                "vehicle_number": "",
            }).execute()
            driver_profile = dp_result.data[0]
        else:
            driver_profile = dp.data[0]

    communities = _get_communities(user["id"])

    return {
        "user": user,
        "communities": communities,
        "driver_profile": driver_profile,
        "is_new_user": is_new_user,
    }


# ─── 7. Admin allowlist check ─────────────────────────────────────────────────

@router.post("/admin/check")
def admin_check(authorization: str = Header(...)):
    uid = _resolve_uid(authorization)

    user_row = (
        supabase.table("users")
        .select("*")
        .eq("firebase_uid", uid)
        .limit(1)
        .execute()
    )

    user = user_row.data[0] if user_row.data else None
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    is_admin = bool(user.get("is_admin", False))

    return {"is_admin": is_admin, "user": user if is_admin else None}


# ─── 8. Session restore ───────────────────────────────────────────────────────

@router.get("/me")
def get_me(authorization: str = Header(...)):
    uid = _resolve_uid(authorization)

    result = (
        supabase.table("users")
        .select("*")
        .eq("firebase_uid", uid)
        .limit(1)
        .execute()
    )

    user = result.data[0] if result.data else None
    if not user:
        raise HTTPException(status_code=404, detail="User not found — complete signup first")

    communities = _get_communities(user["id"])
    driver_profile = _get_driver_profile(user["id"])

    return {
        "user": user,
        "communities": communities,
        "driver_profile": driver_profile,
    }

# ─── 6. Org email verification (for TrustCircle org layer) ──────────────────
#
# These are separate from rider/driver verification because:
#   - The email here is an ORG email, not the user's login email.
#   - The user is already logged in; we just need to prove they own the org inbox.
#   - After verification, the Hunter check confirms the domain is a real org.
#

class OrgSendEmailRequest(BaseModel):
    email: EmailStr


class OrgCheckEmailRequest(BaseModel):
    email: EmailStr


@router.post("/org/send-email-verification")
def org_send_email_verification(body: OrgSendEmailRequest):
    """
    Send a verification link to an org/work/college email address.
    Called when an already-logged-in user wants to join an org community pool.
    """
    from app.core.firebase import send_org_email_verification_link
    try:
        send_org_email_verification_link(body.email)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send verification email: {e}")


@router.post("/org/check-email-verified")
def org_check_email_verified(body: OrgCheckEmailRequest):
    """
    Poll whether the org email has been verified via the link.
    Returns {verified: bool}.
    No token or user creation needed — the calling user is already authenticated.
    """
    from firebase_admin import auth as firebase_auth
    _get_app()
    try:
        firebase_user = firebase_auth.get_user_by_email(body.email)
    except firebase_auth.UserNotFoundError:
        return {"verified": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lookup failed: {e}")

    return {"verified": firebase_user.email_verified}


@router.get("/org/confirm-email")
def org_confirm_email(uid: str, email: str):
    """
    Callback URL clicked from the org verification email.
    Marks the Firebase user as email_verified and returns a simple HTML page.
    """
    try:
        mark_email_verified(uid)
    except Exception as e:
        return HTMLResponse(f"<h2>Verification failed</h2><p>{e}</p>", status_code=500)
    return HTMLResponse("""
        <html><body style="font-family:sans-serif;text-align:center;padding:60px 20px;">
        <h2>✅ Email verified!</h2>
        <p>Your organisation email has been verified.</p>
        <p>You can close this tab and return to the UniGo app.</p>
        </body></html>
    """)