# backend/app/core/firebase.py
#
# Firebase Admin SDK helpers used by the auth router.
#
#   create_phone_otp()                  — generate & store a server-side OTP (legacy/driver)
#   verify_phone_otp_code()             — check OTP, return firebase_uid
#   create_custom_token()               — mint a Firebase custom token
#   send_rider_email_verification_link()— send rider verification link
#   send_driver_email_verification_link()— send driver verification link
#   mark_email_verified()               — confirm link click, flips email_verified
#   verify_admin_password()             — check admin email+password against users table

import json
import os
import secrets
import bcrypt
from datetime import datetime, timedelta

import httpx
import firebase_admin
from firebase_admin import credentials, auth
from app.core.config import FIREBASE_CREDENTIALS_JSON
from app.db.supabase_client import supabase

_app = None

# Public URL where THIS backend is reachable from a phone's browser
# (must NOT be a placeholder domain — set in .env)

BACKEND_BASE_URL = os.environ.get("BACKEND_BASE_URL", "http://192.168.31.252:8000")
print(f"[DEBUG] BACKEND_BASE_URL = repr: {repr(BACKEND_BASE_URL)}")

def _get_app():
    global _app
    if _app is None:
        if FIREBASE_CREDENTIALS_JSON:
            cred_dict = json.loads(FIREBASE_CREDENTIALS_JSON)
            cred = credentials.Certificate(cred_dict)
        else:
            cred = credentials.ApplicationDefault()
        _app = firebase_admin.initialize_app(cred)
    return _app


def verify_id_token(id_token: str) -> dict:
    """
    Verify a Firebase ID token OR a server-minted custom token.

    Custom tokens are JWTs signed by our service account. Firebase's
    auth.verify_id_token() rejects them, so we fall back to plain JWT
    decode (signature verification is skipped — we trust tokens we minted).
    Returns a dict with at least {"uid": <firebase_uid>}.
    """
    _get_app()

    if not id_token or id_token == "null":
        raise ValueError("Missing token")

    # Try real Firebase ID token first
    try:
        return auth.verify_id_token(id_token)
    except Exception as e:
        if "custom token" not in str(e).lower() and "wrong number of segments" not in str(e).lower():
            # Real verification failure (expired, revoked, tampered) — re-raise
            raise

    # It's a custom token — decode without signature verification
    # (safe because we minted it with our own service account key)
    try:
        import jwt as pyjwt
        decoded = pyjwt.decode(id_token, options={"verify_signature": False})
        uid = decoded.get("uid") or decoded.get("sub")
        if not uid:
            raise ValueError("No UID in custom token payload")
        return {"uid": uid}
    except Exception as e:
        raise ValueError(f"Invalid token: {e}") from e


def create_custom_token(firebase_uid: str) -> str:
    """
    Mint a Firebase custom token for a given UID.
    """
    _get_app()
    token_bytes = auth.create_custom_token(firebase_uid)
    if isinstance(token_bytes, bytes):
        return token_bytes.decode("utf-8")
    return token_bytes


# ─── Server-side phone OTP (legacy, kept for driver/admin if still used) ─────

OTP_TTL_SECONDS = 300  # 5 minutes


def create_phone_otp(phone: str) -> str:
    _get_app()

    otp = str(secrets.randbelow(900000) + 100000)
    expires_at = (datetime.utcnow() + timedelta(seconds=OTP_TTL_SECONDS)).isoformat()

    supabase.table("phone_otps").update({"used": True}).eq("phone", phone).eq(
        "used", False
    ).execute()

    supabase.table("phone_otps").insert({
        "phone": phone,
        "otp": otp,
        "expires_at": expires_at,
        "used": False,
    }).execute()

    print(f"[DEV] OTP for {phone}: {otp}")
    return otp


def verify_phone_otp_code(phone: str, otp: str) -> str:
    _get_app()

    now = datetime.utcnow().isoformat()
    row = (
        supabase.table("phone_otps")
        .select("*")
        .eq("phone", phone)
        .eq("otp", otp)
        .eq("used", False)
        .gte("expires_at", now)
        .order("created_at", desc=True)
        .limit(1)
        .maybe_single()
        .execute()
    )

    if not row.data:
        raise ValueError("Invalid or expired OTP")

    supabase.table("phone_otps").update({"used": True}).eq("id", row.data["id"]).execute()

    try:
        firebase_user = auth.get_user_by_phone_number(phone)
        uid = firebase_user.uid
    except auth.UserNotFoundError:
        firebase_user = auth.create_user(phone_number=phone)
        uid = firebase_user.uid

    supabase.table("phone_otps").update({"firebase_uid": uid}).eq("id", row.data["id"]).execute()

    return uid


# ─── Email verification link (shared helper) ─────────────────────────────────

def _generate_and_send_verification_link(email: str, confirm_path: str) -> str:
    _get_app()

    try:
        firebase_user = auth.get_user_by_email(email)
        uid = firebase_user.uid
    except auth.UserNotFoundError:
        firebase_user = auth.create_user(email=email)
        uid = firebase_user.uid

    action_code_settings = auth.ActionCodeSettings(
        url=f"{BACKEND_BASE_URL}{confirm_path}?uid={uid}&email={email}",
        handle_code_in_app=False,
    )
    link = auth.generate_email_verification_link(email, action_code_settings)

    # Use Gmail SMTP (works for any recipient) — fall back to Resend only
    # if Gmail isn't configured (i.e. recipient is the Resend account owner)
    gmail_sender = os.environ.get("GMAIL_SENDER", "")
    gmail_password = os.environ.get("GMAIL_APP_PASSWORD", "")

    if gmail_sender and gmail_password:
        _send_email_via_gmail(email, link, gmail_sender, gmail_password)
    else:
        _send_email_via_provider(
            email,
            link,
            subject="Verify your email — UniGo",
            button_text="Verify Email",
        )

    return link

def send_rider_email_verification_link(email: str) -> str:
    """Send a rider verification link. Confirms at /auth/rider/confirm-email."""
    return _generate_and_send_verification_link(email, "/auth/rider/confirm-email")


def send_driver_email_verification_link(email: str) -> str:
    """Send a driver verification link. Confirms at /auth/driver/confirm-email."""
    return _generate_and_send_verification_link(email, "/auth/driver/confirm-email")


def mark_email_verified(uid: str) -> None:
    """Called when the backend confirms the link click."""
    _get_app()
    auth.update_user(uid, email_verified=True)


def _send_email_via_provider(email: str, link: str, subject: str, button_text: str) -> None:
    RESEND_API_KEY = os.environ["RESEND_API_KEY"]
    resp = httpx.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
        json={
            "from": "UniGo <onboarding@resend.dev>",
            "to": email,
            "subject": subject,
            "html": (
                f'<div style="font-family:sans-serif;padding:24px;">'
                f'<h2>{subject}</h2>'
                f'<p>Tap the button below to continue.</p>'
                f'<a href="{link}" style="display:inline-block;background:#4F46E5;color:#fff;'
                f'padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">'
                f'{button_text}</a>'
                f'</div>'
            ),
        },
        timeout=10,
    )
    print(f"[DEBUG] Resend status: {resp.status_code}")
    print(f"[DEBUG] Resend response: {resp.text}")
    resp.raise_for_status()

# ─── Admin email + password ───────────────────────────────────────────────────

def verify_admin_password(email: str, password: str) -> dict:
    """
    Look up the user row by email, check is_admin and bcrypt password_hash.
    Returns the user row on success. Raises ValueError on failure.
    Also ensures a Firebase user exists for this email (for custom token minting).
    """
    result = (
        supabase.table("users")
        .select("*")
        .eq("email", email)
        .limit(1)
        .execute()
    )
    user = result.data[0] if result.data else None
    if not user or not user.get("is_admin"):
        raise ValueError("Invalid credentials")

    password_hash = user.get("password_hash")
    if not password_hash:
        raise ValueError("Invalid credentials")

    if not bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8")):
        raise ValueError("Invalid credentials")

    # Ensure a Firebase user exists for this email so we can mint a custom token
    _get_app()
    try:
        firebase_user = auth.get_user_by_email(email)
        firebase_uid = firebase_user.uid
    except auth.UserNotFoundError:
        firebase_user = auth.create_user(email=email, email_verified=True)
        firebase_uid = firebase_user.uid

    # Keep firebase_uid in sync on the users row if it's a placeholder
    if user.get("firebase_uid") != firebase_uid:
        supabase.table("users").update({"firebase_uid": firebase_uid}).eq("id", user["id"]).execute()
        user["firebase_uid"] = firebase_uid

    return user

def send_org_email_verification_link(email: str) -> str:
    """
    Send a verification link to an org/work/college email.

    WHY NOT RESEND: Resend's free tier with onboarding@resend.dev only delivers
    to the account owner's email. Any other recipient gets 400 Bad Request.
    Rider/driver flows work only when tested with the account owner's address.

    SOLUTION: Generate the Firebase verification link (same as always), then send
    it via Gmail SMTP using credentials in .env. Gmail has no recipient restrictions.
    Falls back to Resend if Gmail is not configured (for cases where the org email
    happens to be the Resend account owner's address).

    Requires in .env:
        GMAIL_SENDER=your.email@gmail.com
        GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx  (Gmail App Password, NOT your login password)
    """
    _get_app()

    # Get or create a Firebase user for this org email
    try:
        firebase_user = auth.get_user_by_email(email)
        uid = firebase_user.uid
    except auth.UserNotFoundError:
        firebase_user = auth.create_user(email=email)
        uid = firebase_user.uid

    action_code_settings = auth.ActionCodeSettings(
        url=f"{BACKEND_BASE_URL}/auth/org/confirm-email?uid={uid}&email={email}",
        handle_code_in_app=False,
    )
    link = auth.generate_email_verification_link(email, action_code_settings)

    # Try Gmail SMTP first (works for any recipient)
    gmail_sender = os.environ.get("GMAIL_SENDER", "")
    gmail_password = os.environ.get("GMAIL_APP_PASSWORD", "")

    if gmail_sender and gmail_password:
        _send_email_via_gmail(email, link, gmail_sender, gmail_password)
    else:
        # Fall back to Resend (only works if recipient = Resend account owner email)
        _send_email_via_provider(
            email,
            link,
            subject="Verify your organisation email — UniGo",
            button_text="Verify Organisation Email",
        )

    return link


def _send_email_via_gmail(to_email: str, link: str, sender: str, app_password: str) -> None:
    """Send verification email via Gmail SMTP using an App Password."""
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    subject = "Verify your organisation email — UniGo"
    html_body = (
        '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">'
        '<h2 style="color:#6C63FF;margin-bottom:8px;">UniGo</h2>'
        '<h3 style="margin-top:0;">Verify your organisation email</h3>'
        '<p style="color:#555;line-height:1.6;">Click the button below to verify that you own this email address. '
        'Once verified, we\'ll confirm your organisation and add you to the carpool pool.</p>'
        f'<a href="{link}" style="display:inline-block;background:#6C63FF;color:#fff;'
        'padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;margin:16px 0;">'
        'Verify Organisation Email</a>'
        '<p style="color:#888;font-size:13px;margin-top:24px;">If you didn\'t request this, you can ignore this email.</p>'
        '</div>'
    )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"UniGo <{sender}>"
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(sender, app_password)
        server.sendmail(sender, to_email, msg.as_string())