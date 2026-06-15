"""
seed_admin.py — Create the first admin user for UniGo.

Usage:
    python seed_admin.py --email admin@unigo.app --password 12345678
"""

import argparse
import json
import os
import sys
import bcrypt
import traceback

from dotenv import load_dotenv
load_dotenv()

import firebase_admin
from firebase_admin import credentials, auth as firebase_auth
from supabase import create_client
from app.core.config import FIREBASE_CREDENTIALS_JSON


def _get_service_client():
    url = os.environ.get("SUPABASE_URL", "").strip()
    # Try both common env var names for the service role key
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        or os.environ.get("SUPABASE_SERVICE_KEY", "")
        or os.environ.get("SUPABASE_KEY", "")  # fallback to whatever key exists
    ).strip()

    if not url or not key:
        print("❌  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")
        sys.exit(1)

    print(f"    Supabase URL : {url}")
    print(f"    Key prefix   : {key[:30]}...")
    return create_client(url, key)


def _init_firebase():
    if firebase_admin._apps:
        return
    if FIREBASE_CREDENTIALS_JSON:
        cred_dict = json.loads(FIREBASE_CREDENTIALS_JSON)
        cred = credentials.Certificate(cred_dict)
    else:
        cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred)


def seed_admin(email: str, password: str, name: str = "Admin"):
    _init_firebase()
    db = _get_service_client()

    print(f"\n📧  Email : {email}")
    print(f"👤  Name  : {name}\n")

    # 1. Firebase user
    try:
        fb_user = firebase_auth.get_user_by_email(email)
        firebase_uid = fb_user.uid
        print(f"✅  Firebase user already exists : {firebase_uid}")
    except firebase_auth.UserNotFoundError:
        fb_user = firebase_auth.create_user(
            email=email, email_verified=True, display_name=name,
        )
        firebase_uid = fb_user.uid
        print(f"✅  Firebase user created : {firebase_uid}")

    firebase_auth.update_user(firebase_uid, email_verified=True)
    print("✅  Email marked as verified in Firebase")

    # 2. Hash password
    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    print("✅  Password hashed with bcrypt")

    # 3. Check existing — use plain .execute() and check .data list, no maybe_single()
    print("    Checking for existing user in Supabase...")
    by_email = db.table("users").select("id, gender").eq("email", email).limit(1).execute()
    print(f"    by_email result: {by_email}")

    if by_email is None:
        print("\n❌  Supabase returned None for a basic SELECT.")
        print("    This means your key is wrong or RLS is blocking even reads.")
        print("    → Make sure SUPABASE_SERVICE_ROLE_KEY is the 'service_role' secret key")
        print("      (NOT the anon key). Find it in:")
        print("      Supabase Dashboard → Project Settings → API → service_role")
        sys.exit(1)

    existing_rows = by_email.data or []

    if existing_rows:
        user_id = existing_rows[0]["id"]
        db.table("users").update({
            "firebase_uid": firebase_uid,
            "name": name,
            "is_admin": True,
            "password_hash": password_hash,
        }).eq("id", user_id).execute()
        print(f"✅  Existing user updated → is_admin=True  (id: {user_id})")
    else:
        # Also check by firebase_uid
        by_uid = db.table("users").select("id").eq("firebase_uid", firebase_uid).limit(1).execute()
        by_uid_rows = (by_uid.data or []) if by_uid else []

        if by_uid_rows:
            user_id = by_uid_rows[0]["id"]
            db.table("users").update({
                "email": email,
                "name": name,
                "is_admin": True,
                "password_hash": password_hash,
            }).eq("id", user_id).execute()
            print(f"✅  User (by firebase_uid) updated (id: {user_id})")
        else:
            payload = {
                "firebase_uid": firebase_uid,
                "name": name,
                "email": email,
                "gender": "other",
                "role": "rider",
                "is_admin": True,
                "password_hash": password_hash,
            }
            print(f"    Inserting payload: {payload}")
            insert_result = db.table("users").insert(payload).execute()
            print(f"    Raw insert result: {insert_result}")

            if not insert_result or not insert_result.data:
                print("\n❌  Insert returned no data. Most likely causes:")
                print("    1. You're using the ANON key, not service_role key")
                print("       → Supabase Dashboard → Project Settings → API → service_role (secret)")
                print()
                print("    2. RLS is blocking even service role (unusual)")
                print("       → Run this SQL in Supabase SQL editor as a workaround:")
                print()
                print(f"    INSERT INTO public.users")
                print(f"      (firebase_uid, name, email, gender, role, is_admin, password_hash)")
                print(f"    VALUES")
                print(f"      ('{firebase_uid}', '{name}', '{email}', 'other', 'rider', true, '<bcrypt_hash>');")
                print()
                print("    Use this bcrypt hash for the password you entered:")
                print(f"    {password_hash}")
                sys.exit(1)

            user_id = insert_result.data[0]["id"]
            print(f"✅  New admin user created  (id: {user_id})")

    print()
    print("─" * 52)
    print("🎉  Admin seeded successfully!")
    print(f"    firebase_uid : {firebase_uid}")
    print(f"    supabase id  : {user_id}")
    print(f"    email        : {email}")
    print()
    print("Login via:  POST /auth/admin/login")
    print(f'    {{"email": "{email}", "password": "<your password>"}}')
    print("─" * 52)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed a UniGo admin user")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--name", default="Admin")
    args = parser.parse_args()

    if len(args.password) < 8:
        print("❌  Password must be at least 8 characters.")
        sys.exit(1)

    try:
        seed_admin(args.email, args.password, args.name)
    except Exception as e:
        print(f"\n❌  Seeding failed: {e}")
        traceback.print_exc()
        sys.exit(1)