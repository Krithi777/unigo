# UniGo Backend (FastAPI)

## Tech Stack
- FastAPI
- Supabase (Postgres) via service_role key
- Firebase Admin SDK (verify OTP tokens)
- Socket.io (python-socketio) for live tracking, route updates, SOS
- Google Maps Directions/Distance Matrix API (RouteMorph, SmartSplit)
- Razorpay (UPI payments)

## Run locally
```
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Endpoint groups
- `/auth` — Firebase OTP verify, user upsert
- `/community` — join/create TrustCircle
- `/rides` — create, join, cancel (RouteMorph, Backup Match, Women-Only)
- `/pulse` — daily check-in
- `/emergency` — SOS trigger
- `/payments` — Razorpay order create/verify (SmartSplit)
- `/dashboard` — impact stats
- `/driver` — driver dashboard, history
- `/users` — profile, emergency contact, reliability
