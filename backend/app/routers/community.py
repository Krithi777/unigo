"""
Community router — Trust Layer system.

  POST /community/create          — create a TrustCircle (invite-code group)
  POST /community/join            — join a TrustCircle by invite code
  POST /community/join-or-create  — join/create a shared pool (org or locality)
  GET  /community/my              — current user's memberships
  GET  /community/info/{code}     — preview before joining
"""
import os
import re
import random
import string
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, EmailStr

from app.core.firebase import verify_id_token
from app.db.supabase_client import supabase

router = APIRouter()

# ─── Curated institutional domains ───────────────────────────────────────────
# Add new organisations here. Domain matching = automatic org tag, no invite needed.
KNOWN_DOMAINS: dict[str, dict] = {
    # Colleges
    'srmist.edu.in':  {'name': 'SRM Institute of Science and Technology', 'type': 'college'},
    'srm.edu.in':     {'name': 'SRM University', 'type': 'college'},
    'vit.ac.in':      {'name': 'VIT University', 'type': 'college'},
    'annauniv.edu':   {'name': 'Anna University', 'type': 'college'},
    'sastra.edu':     {'name': 'SASTRA University', 'type': 'college'},
    'pec.edu':        {'name': 'Puducherry Engineering College', 'type': 'college'},
    # Workplaces
    'infosys.com':    {'name': 'Infosys', 'type': 'workplace'},
    'wipro.com':      {'name': 'Wipro', 'type': 'workplace'},
    'tcs.com':        {'name': 'Tata Consultancy Services', 'type': 'workplace'},
    'cognizant.com':  {'name': 'Cognizant', 'type': 'workplace'},
    'hcltech.com':    {'name': 'HCL Technologies', 'type': 'workplace'},
    'zoho.com':       {'name': 'Zoho Corporation', 'type': 'workplace'},
    'freshworks.com': {'name': 'Freshworks', 'type': 'workplace'},
}


# ─── Pydantic schemas ─────────────────────────────────────────────────────────

class CommunityCreate(BaseModel):
    name: str
    type: str = 'other'
    description: Optional[str] = None
    city: Optional[str] = None

class CommunityJoin(BaseModel):
    invite_code: str

class JoinOrCreate(BaseModel):
    name: str
    type: str                          # 'college' | 'workplace' | 'neighborhood'
    trust_layer: str                   # 'organisation' | 'locality'
    verification_domain: Optional[str] = None
    locality_confirmed: Optional[bool] = False


# ─── Auth helper ──────────────────────────────────────────────────────────────

def _get_user(authorization: str) -> dict:
    id_token = authorization.replace("Bearer ", "").strip()
    try:
        decoded = verify_id_token(id_token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")
    result = (
        supabase.table("users")
        .select("*")
        .eq("firebase_uid", decoded["uid"])
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    return result.data[0]


def _generate_invite_code(length: int = 6) -> str:
    """Generate a unique uppercase alphanumeric invite code."""
    chars = string.ascii_uppercase + string.digits
    for _ in range(20):  # max attempts
        code = "".join(random.choices(chars, k=length))
        existing = (
            supabase.table("communities")
            .select("id")
            .eq("invite_code", code)
            .limit(1)
            .execute()
        )
        if not existing.data:
            return code
    raise HTTPException(status_code=500, detail="Could not generate unique invite code")


def _add_member(
    community_id: str,
    user_id: str,
    is_primary: bool = False,
    trust_layer: str = 'trustcircle',
    locality_confirmed: bool = False,
):
    supabase.table("community_members").insert({
        "community_id": community_id,
        "user_id": user_id,
        "is_primary": is_primary,
        "trust_layer": trust_layer,
        "locality_confirmed": locality_confirmed,
    }).execute()


def _is_first_community(user_id: str) -> bool:
    """Return True if user has no community memberships yet (makes this one primary)."""
    existing = (
        supabase.table("community_members")
        .select("id")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return len(existing.data) == 0


# ─── POST /community/create ───────────────────────────────────────────────────

@router.post("/create")
def create_community(payload: CommunityCreate, authorization: str = Header(...)):
    """
    Create a private TrustCircle group. The creator gets an invite code to share.
    No domain verification — trust comes from the social invite chain.
    """
    user = _get_user(authorization)
    invite_code = _generate_invite_code()

    result = supabase.table("communities").insert({
        "name": payload.name,
        "type": payload.type,
        "description": payload.description,
        "city": payload.city,
        "invite_code": invite_code,
        "created_by": user["id"],
        "trust_layer": "trustcircle",
    }).execute()
    community = result.data[0]

    is_primary = _is_first_community(user["id"])
    _add_member(community["id"], user["id"], is_primary=is_primary, trust_layer="trustcircle")

    return {"community": community, "invite_code": invite_code}


# ─── POST /community/join ─────────────────────────────────────────────────────

@router.post("/join")
def join_community(payload: CommunityJoin, authorization: str = Header(...)):
    """
    Join a TrustCircle by invite code.
    Anyone with the code can join — the invite chain is the trust signal.
    """
    user = _get_user(authorization)

    community_result = (
        supabase.table("communities")
        .select("*")
        .eq("invite_code", payload.invite_code.upper().strip())
        .limit(1)
        .execute()
    )
    if not community_result.data:
        raise HTTPException(status_code=404, detail="Invalid invite code")

    community = community_result.data[0]

    # Block joining open pools via invite code — they use join-or-create
    if community.get("trust_layer") in ("organisation", "locality"):
        raise HTTPException(
            status_code=400,
            detail="This is an open pool community. Join it through the Organisation or Neighbourhood sections."
        )

    # Duplicate check
    dup = (
        supabase.table("community_members")
        .select("id")
        .eq("community_id", community["id"])
        .eq("user_id", user["id"])
        .limit(1)
        .execute()
    )
    if dup.data:
        raise HTTPException(status_code=409, detail="Already a member of this community")

    is_primary = _is_first_community(user["id"])
    _add_member(community["id"], user["id"], is_primary=is_primary, trust_layer="trustcircle")

    return {"community": community, "is_primary": is_primary}


# ─── POST /community/join-or-create ──────────────────────────────────────────

@router.post("/join-or-create")
def join_or_create(payload: JoinOrCreate, authorization: str = Header(...)):
    """
    Layer 2 (Organisation) and Layer 3 (Neighbourhood) pool joins.

    Organisation: user's verified email domain must match the community's
    verification_domain AND be in our KNOWN_DOMAINS curated list.
    Security: can't be faked without controlling a real institutional inbox.

    Neighbourhood: self-declared, starts as locality_confirmed=False.
    Confirmed passively via GPS data from rides/pulse over time.

    Creates the pool community if it doesn't exist yet.
    """
    user = _get_user(authorization)

    # ── Layer 2: Organisation domain verification ─────────────────────────────
    if payload.trust_layer == "organisation":
        domain = (payload.verification_domain or "").lower()
        user_email: str = user.get("email") or ""
        user_domain = user_email.split("@")[-1].lower() if "@" in user_email else ""

        if not user_domain:
            raise HTTPException(
                status_code=400,
                detail="No verified email on your account. Complete email verification first."
            )

        # Domain must be in curated list
        if domain not in KNOWN_DOMAINS:
            raise HTTPException(
                status_code=403,
                detail=f"@{domain} is not in our verified institutions list. Contact us to add it."
            )

        # User's actual email domain must match requested domain
        if user_domain != domain:
            raise HTTPException(
                status_code=403,
                detail=f"Your email (@{user_domain}) doesn't match the required domain (@{domain})."
            )

        # Ensure payload name matches the canonical name for that domain
        canonical = KNOWN_DOMAINS[domain]
        payload.name = canonical["name"]
        payload.type = canonical["type"]

    # ── Find or create the pool community ────────────────────────────────────
    existing_community = (
        supabase.table("communities")
        .select("*")
        .eq("name", payload.name)
        .eq("type", payload.type)
        .eq("trust_layer", payload.trust_layer)
        .limit(1)
        .execute()
    )

    if existing_community.data:
        community = existing_community.data[0]
        created = False
    else:
        insert_data: dict = {
            "name": payload.name,
            "type": payload.type,
            "invite_code": _generate_invite_code(),  # required by schema; not shared publicly
            "trust_layer": payload.trust_layer,
        }
        if payload.verification_domain:
            insert_data["verification_domain"] = payload.verification_domain
        result = supabase.table("communities").insert(insert_data).execute()
        community = result.data[0]
        created = True

    # ── Duplicate membership check ────────────────────────────────────────────
    dup = (
        supabase.table("community_members")
        .select("id")
        .eq("community_id", community["id"])
        .eq("user_id", user["id"])
        .limit(1)
        .execute()
    )
    if dup.data:
        raise HTTPException(status_code=409, detail="Already a member of this community")

    is_primary = _is_first_community(user["id"])
    locality_confirmed = bool(payload.locality_confirmed) if payload.trust_layer == "locality" else False

    _add_member(
        community["id"], user["id"],
        is_primary=is_primary,
        trust_layer=payload.trust_layer,
        locality_confirmed=locality_confirmed,
    )

    return {"community": community, "created": created, "is_primary": is_primary}


# ─── GET /community/my ────────────────────────────────────────────────────────

@router.get("/my")
def get_my_communities(authorization: str = Header(...)):
    user = _get_user(authorization)
    memberships = (
        supabase.table("community_members")
        .select("community_id, is_primary, joined_at, trust_layer, locality_confirmed, communities(*)")
        .eq("user_id", user["id"])
        .execute()
    )
    return {"communities": memberships.data or []}


# ─── GET /community/info/{invite_code} ───────────────────────────────────────

@router.get("/info/{invite_code}")
def get_community_by_code(invite_code: str):
    result = (
        supabase.table("communities")
        .select("id, name, type, description, city, trust_layer")
        .eq("invite_code", invite_code.upper().strip())
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Community not found")

    community = result.data[0]

    # Don't let open pools be joined via invite code lookup
    if community.get("trust_layer") in ("organisation", "locality"):
        raise HTTPException(
            status_code=400,
            detail="This is an open pool. Join via Organisation or Neighbourhood section."
        )

    count_result = (
        supabase.table("community_members")
        .select("id", count="exact")
        .eq("community_id", community["id"])
        .execute()
    )

    return {"community": community, "member_count": count_result.count}


# ─── GET /community/known-domains ─────────────────────────────────────────────

@router.get("/known-domains")
def get_known_domains():
    """Return the list of verified institutional domains (for frontend display)."""
    return {"domains": KNOWN_DOMAINS}

# ─── POST /community/verify-org-email ─────────────────────────────────────────
#
# Called by OrgVerifyScreen AFTER the user has clicked the verification link in
# their org email inbox (Firebase marks that email as verified).
#
# Flow:
#   1. We look up the Firebase user for this email and confirm it's verified.
#   2. We call Hunter.io /v2/email-verifier to confirm:
#        a. The email is deliverable (not fake).
#        b. The domain is NOT a personal/free provider (webmail).
#   3. If Hunter says it's organisation-like, we also check our KNOWN_DOMAINS
#      curated list for a canonical name; if not known, we infer from the domain.
#   4. Return {valid, org_name, org_type, domain} for the frontend to use.
#
# Hunter API docs: https://hunter.io/api-documentation/v2#email-verifier
#
# NOTE: If HUNTER_API_KEY is not set, we fall back to domain-only heuristics
# (no HTTP call to Hunter) so development works without a key.
#

HUNTER_API_KEY = os.getenv("HUNTER_API_KEY", "")

# Common free/personal email providers — Hunter also flags these, but we do our
# own check as a fast first pass (saves an API call for obvious cases).
_PERSONAL_DOMAINS = {
    'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com',
    'protonmail.com', 'live.com', 'msn.com', 'ymail.com', 'yahoo.in',
    'rediffmail.com', 'aol.com', 'me.com', 'mac.com', 'googlemail.com',
}


class VerifyOrgEmailRequest(BaseModel):
    email: EmailStr


def _infer_org_name(domain: str) -> tuple[str, str]:
    """
    Guess an org name and type from a domain when not in KNOWN_DOMAINS.
    Returns (name, type).
    """
    # Strip www / mail. prefix
    base = re.sub(r'^(www|mail|smtp)\\.', '', domain)
    # Remove TLD parts for the label
    parts = base.split('.')
    label = parts[0].replace('-', ' ').replace('_', ' ').title()

    # Edu domains → college
    if any(base.endswith(s) for s in ('.edu', '.edu.in', '.ac.in', '.ac.uk')):
        return label, 'college'

    # Gov domains → workplace
    if any(base.endswith(s) for s in ('.gov', '.gov.in', '.nic.in')):
        return label, 'workplace'

    # Everything else → workplace
    return label, 'workplace'


@router.post("/verify-org-email")
def verify_org_email(payload: VerifyOrgEmailRequest, authorization: str = Header(...)):
    """
    Verify that an org email address:
      1. Has been verified by the owner (Firebase email_verified flag).
      2. Belongs to a real organisation (not a free/personal inbox) via Hunter.io.

    Returns:
        valid: bool
        org_name: str
        org_type: str  ('college' | 'workplace' | 'other')
        domain: str
        message: str (only when valid=False)
    """
    from firebase_admin import auth as firebase_auth
    from app.core.firebase import _get_app

    user = _get_user(authorization)
    email = payload.email.strip().lower()
    domain = email.split('@')[1]

    # ── Fast reject: personal domains ─────────────────────────────────────────
    if domain in _PERSONAL_DOMAINS:
        return {
            "valid": False,
            "org_name": "",
            "org_type": "",
            "domain": domain,
            "message": f"@{domain} is a personal email provider. Please use your work or college email.",
        }

    # ── Step 1: confirm Firebase says email_verified ──────────────────────────
    _get_app()
    try:
        fb_user = firebase_auth.get_user_by_email(email)
    except firebase_auth.UserNotFoundError:
        return {
            "valid": False,
            "org_name": "",
            "org_type": "",
            "domain": domain,
            "message": "Email not found. Please go back and complete the verification step.",
        }

    if not fb_user.email_verified:
        return {
            "valid": False,
            "org_name": "",
            "org_type": "",
            "domain": domain,
            "message": "Email not yet verified. Please click the verification link in your inbox first.",
        }

    # ── Step 2: Hunter.io domain check ────────────────────────────────────────
    hunter_webmail = False  # True = Hunter says it's a personal/free provider

    if HUNTER_API_KEY:
        try:
            resp = httpx.get(
                "https://api.hunter.io/v2/email-verifier",
                params={"email": email, "api_key": HUNTER_API_KEY},
                timeout=10,
            )
            if resp.status_code == 200:
                data = resp.json().get("data", {})
                # Hunter result fields:
                #   result: "deliverable" | "undeliverable" | "risky" | "unknown"
                #   webmail: true if it's a personal inbox (gmail etc.)
                #   disposable: true if it's a throwaway email
                result = data.get("result", "unknown")
                hunter_webmail = bool(data.get("webmail", False))
                disposable = bool(data.get("disposable", False))

                if disposable:
                    return {
                        "valid": False,
                        "org_name": "",
                        "org_type": "",
                        "domain": domain,
                        "message": "This appears to be a disposable email address. Please use a permanent work or college email.",
                    }

                if hunter_webmail:
                    return {
                        "valid": False,
                        "org_name": "",
                        "org_type": "",
                        "domain": domain,
                        "message": f"@{domain} is a personal/free email provider. Please use your official organisation email.",
                    }

                if result == "undeliverable":
                    return {
                        "valid": False,
                        "org_name": "",
                        "org_type": "",
                        "domain": domain,
                        "message": "This email address does not appear to exist. Please check and try again.",
                    }
        except Exception:
            # Hunter call failed (network error, quota exceeded, etc.) — proceed
            # with domain-only heuristics rather than blocking the user.
            pass
    else:
        # No Hunter key — skip API call, proceed with domain heuristics.
        pass

    # ── Step 3: Resolve org name from KNOWN_DOMAINS or infer from domain ──────
    if domain in KNOWN_DOMAINS:
        canonical = KNOWN_DOMAINS[domain]
        org_name = canonical["name"]
        org_type = canonical["type"]
    else:
        org_name, org_type = _infer_org_name(domain)

    return {
        "valid": True,
        "org_name": org_name,
        "org_type": org_type,
        "domain": domain,
    }