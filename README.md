# UniGo — Monorepo

Community-powered carpooling app. Team Nightingale.

## Structure
```
unigo/
├── mobile/     # Expo (React Native + TypeScript) frontend
├── backend/    # FastAPI backend
└── database/   # Supabase SQL schema
```

## Tech Stack
- Frontend: Expo (React Native) + TypeScript, React Navigation
- Backend: FastAPI + python-socketio
- Database: Supabase (Postgres)
- Auth: Firebase Phone Auth (OTP)
- Realtime: Socket.io (live tracking, route updates, SOS)
- Maps: Google Maps Directions & Distance Matrix API
- Payments: Razorpay (UPI) — SmartSplit Autopilot
- Push: Firebase Cloud Messaging (FCM)

## Getting Started

### 1. Database
Run `database/unigo_schema.sql` in the Supabase SQL Editor (see project setup notes).

### 2. Backend
```
cd backend
cp .env.example .env   # fill in Supabase, Firebase, Maps, Razorpay keys
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### 3. Mobile
```
cd mobile
cp .env.example .env   # fill in API_BASE_URL, SOCKET_URL, Firebase, Maps keys
npm install
npx expo start
```

## Team Task Split (36 hours)
- **Sahana M** (Technical Lead): RouteMorph Engine, Backup Match, Women-Only Ride, Live Map Tracking
- **Krithika P** (Product Design & Integration): Sign Up & Verify, Join Trust Cycle, Emergency Alert, SmartSplit Autopilot
- **Ruvanthika P** (Backend Lead): Daily Pulse, Reliability Score, Emergency Contact, Impact Dashboard, Driver/User Dashboard
