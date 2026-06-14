# UniGo Mobile App

Community-powered carpooling app — React Native (Expo) frontend.

## Tech Stack (per Handoff Guide)
- Frontend: Expo (React Native) + TypeScript
- Navigation: React Navigation (bottom tabs + stacks)
- Auth: Firebase Phone Auth (OTP)
- Backend: FastAPI (separate repo/service)
- Database: Supabase (Postgres)
- Realtime: Socket.io (live tracking, SOS, route updates)
- Maps: Google Maps / react-native-maps + Directions & Distance Matrix API
- Payments: Razorpay (UPI) — SmartSplit Autopilot
- Push Notifications: Firebase Cloud Messaging (FCM)

## Structure
- `src/screens` — one folder per feature area (Auth, Onboarding, Home, FindRide, MyRides, RideDetails, Profile, Emergency, Dashboard)
- `src/components` — shared & feature-specific UI components
- `src/navigation` — Root, Auth, and Tab navigators
- `src/services` — API clients (FastAPI, Firebase, Supabase, Socket.io, Razorpay, FCM, location)
- `src/hooks`, `src/context`, `src/store` — state management
- `src/utils`, `src/constants`, `src/types` — shared helpers, theme, type defs
- `src/assets` — images, icons, fonts

## Screen ↔ Tab Mapping (from prototype)
- Home tab → HomeScreen (Daily Pulse, stats, quick actions, upcoming ride, carbon banner)
- Find Ride tab → FindRideScreen (route search, map preview, nearby matches)
- SOS tab (center) → SOSScreen (Emergency Alert)
- My Rides tab → MyRidesScreen (upcoming + past rides)
- Profile tab → ProfileScreen (account menu, settings, logout)
