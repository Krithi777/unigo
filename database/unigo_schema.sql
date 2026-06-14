-- ============================================================
-- UNIGO — DATABASE SCHEMA (Supabase / PostgreSQL)
-- ============================================================
-- Run in Supabase SQL Editor. Enable uuid extension first.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- COMMUNITIES (TrustCircle)
-- A community = a trusted group sharing a common affiliation:
-- apartment complex, neighborhood, college, workplace, alumni
-- group, or any other verified group.
-- ============================================================
create table communities (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type text check (type in (
    'apartment', 'neighborhood', 'college', 'workplace', 'alumni', 'other'
  )) not null default 'other',

  description text,
  city text,

  invite_code char(6) unique not null,

  -- optional: link a verified domain for auto-verification
  -- e.g. workplace email domain or college domain
  verification_domain text,

  created_by uuid, -- references users(id), set after users table exists
  created_at timestamptz default now()
);

create index idx_communities_invite_code on communities(invite_code);
create index idx_communities_type on communities(type);

-- ============================================================
-- USERS (base profile — every account, rider and/or driver)
-- ============================================================
create table users (
  id uuid primary key default uuid_generate_v4(),
  firebase_uid text unique not null,
  name text not null,
  phone text unique not null,
  gender text check (gender in ('male', 'female', 'other')) not null,

  role text check (role in ('rider', 'driver', 'both')) not null default 'rider',

  reliability_score int default 100,

  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_fcm_token text,

  fcm_token text,

  created_at timestamptz default now()
);

create index idx_users_phone on users(phone);

-- now that users exists, link communities.created_by
alter table communities
  add constraint fk_communities_created_by
  foreign key (created_by) references users(id);

-- ============================================================
-- USER COMMUNITY MEMBERSHIPS (many-to-many)
-- A user can belong to multiple communities
-- (e.g. their apartment complex AND their workplace)
-- ============================================================
create table community_members (
  id uuid primary key default uuid_generate_v4(),
  community_id uuid references communities(id) not null,
  user_id uuid references users(id) not null,

  -- which community is used to filter ride search by default
  is_primary boolean default false,

  joined_at timestamptz default now(),
  unique (community_id, user_id)
);

create index idx_community_members_user on community_members(user_id);
create index idx_community_members_community on community_members(community_id);

-- ============================================================
-- DRIVER PROFILES (extra info only drivers need)
-- ============================================================
create table driver_profiles (
  user_id uuid primary key references users(id),

  license_number text not null,
  license_verified boolean default false,

  vehicle_make text,
  vehicle_model text,
  vehicle_number text not null,
  vehicle_color text,
  vehicle_type text check (vehicle_type in ('car', 'bike', 'auto')) default 'car',
  seats_available_default int default 4,

  is_active boolean default true, -- driver currently accepting rides

  total_rides_completed int default 0,
  total_earnings numeric(10,2) default 0,

  created_at timestamptz default now()
);

-- ============================================================
-- RIDES
-- ============================================================
create table rides (
  id uuid primary key default uuid_generate_v4(),
  driver_id uuid references users(id) not null,
  community_id uuid references communities(id) not null,

  pickup_lat double precision not null,
  pickup_lng double precision not null,
  pickup_address text,

  dropoff_lat double precision not null,
  dropoff_lng double precision not null,
  dropoff_address text,

  departure_time timestamptz not null,

  seats_total int not null default 4,
  seats_available int not null default 4,

  women_only boolean default false,

  status text check (status in ('scheduled', 'active', 'completed', 'cancelled')) default 'scheduled',

  -- RouteMorph: optimized pickup order returned by Google Directions API
  optimized_route jsonb,

  -- driver earnings for this ride (sum of SmartSplit fares once completed)
  total_fare_collected numeric(10,2) default 0,

  created_at timestamptz default now(),
  completed_at timestamptz,
  cancelled_at timestamptz
);

create index idx_rides_driver on rides(driver_id);
create index idx_rides_community on rides(community_id);
create index idx_rides_status on rides(status);
create index idx_rides_departure on rides(departure_time);

-- ============================================================
-- RIDE REQUESTS (riders joining a ride)
-- ============================================================
create table ride_requests (
  id uuid primary key default uuid_generate_v4(),
  ride_id uuid references rides(id) not null,
  rider_id uuid references users(id) not null,

  pickup_lat double precision not null,
  pickup_lng double precision not null,
  pickup_address text,

  status text check (status in ('pending', 'accepted', 'rejected', 'completed', 'no_show', 'cancelled')) default 'pending',

  -- SmartSplit
  fare_share numeric(10,2),
  paid boolean default false,
  razorpay_order_id text,
  razorpay_payment_id text,

  created_at timestamptz default now()
);

create index idx_ride_requests_ride on ride_requests(ride_id);
create index idx_ride_requests_rider on ride_requests(rider_id);
create index idx_ride_requests_status on ride_requests(status);

-- ============================================================
-- DAILY PULSE (morning check-in)
-- ============================================================
create table daily_pulse (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) not null,
  date date not null default current_date,

  commuting boolean not null,
  departure_window text, -- e.g. '8:00-8:30'

  created_at timestamptz default now(),
  unique (user_id, date)
);

create index idx_daily_pulse_date on daily_pulse(date);
create index idx_daily_pulse_user on daily_pulse(user_id);

-- ============================================================
-- EMERGENCY LOGS (SOS)
-- ============================================================
create table emergency_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) not null,
  ride_id uuid references rides(id),

  lat double precision not null,
  lng double precision not null,

  triggered_at timestamptz default now()
);

create index idx_emergency_logs_user on emergency_logs(user_id);

-- ============================================================
-- IMPACT / SAVINGS SUMMARY (riders)
-- ============================================================
create table impact_summary (
  user_id uuid primary key references users(id),
  total_rides int default 0,
  total_saved numeric(10,2) default 0,
  total_co2_saved numeric(10,2) default 0,
  updated_at timestamptz default now()
);

-- ============================================================
-- VIEW: RIDE HISTORY (drivers + riders, unified)
-- ============================================================
-- Driver-side history: rides they hosted
create view driver_ride_history as
select
  r.id as ride_id,
  r.driver_id,
  r.pickup_address,
  r.dropoff_address,
  r.departure_time,
  r.status,
  r.seats_total,
  r.seats_total - r.seats_available as seats_filled,
  r.total_fare_collected,
  r.completed_at,
  r.cancelled_at
from rides r
order by r.departure_time desc;

-- Rider-side history: rides they joined
create view rider_ride_history as
select
  rr.id as ride_request_id,
  rr.rider_id,
  r.id as ride_id,
  r.driver_id,
  r.pickup_address,
  r.dropoff_address,
  r.departure_time,
  rr.status,
  rr.fare_share,
  rr.paid,
  r.completed_at
from ride_requests rr
join rides r on r.id = rr.ride_id
order by r.departure_time desc;

-- ============================================================
-- ROW LEVEL SECURITY (recommended baseline — adjust per auth setup)
-- ============================================================
alter table users enable row level security;
alter table driver_profiles enable row level security;
alter table communities enable row level security;
alter table community_members enable row level security;
alter table rides enable row level security;
alter table ride_requests enable row level security;
alter table daily_pulse enable row level security;
alter table emergency_logs enable row level security;
alter table impact_summary enable row level security;

-- Example baseline policies (refine based on Firebase JWT -> Supabase mapping)
create policy "Users can view their own row" on users
  for select using (true);

create policy "Drivers can view their own profile" on driver_profiles
  for select using (true);

create policy "Community members can view rides in their community" on rides
  for select using (true);

create policy "Community members can view requests for their rides" on ride_requests
  for select using (true);

-- ============================================================
-- HELPER FUNCTION: Haversine distance (used by Guaranteed Backup Match)
-- ============================================================
create or replace function haversine_km(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
) returns double precision as $$
  select 6371 * 2 * asin(
    sqrt(
      sin(radians(lat2 - lat1) / 2) ^ 2 +
      cos(radians(lat1)) * cos(radians(lat2)) *
      sin(radians(lon2 - lon1) / 2) ^ 2
    )
  );
$$ language sql immutable;

-- Example usage: find backup rides within 2km of a stranded rider's dropoff
-- select * from rides r
-- where r.community_id = :community_id
--   and r.status = 'scheduled'
--   and r.seats_available > 0
--   and haversine_km(r.dropoff_lat, r.dropoff_lng, :target_lat, :target_lng) <= 2;

-- ============================================================
-- NOTES
-- ============================================================
-- 1. Sign-up flow:
--    - Insert into `users` (role = rider/driver/both)
--    - If role includes 'driver': also insert into `driver_profiles`
--    - Join/create community: insert into `community_members`
--      (and `communities` if creating new)
--
-- 2. A user can belong to multiple communities (apartment +
--    workplace, etc). `is_primary` flags the default one used
--    for ride search/matching.
--
-- 3. Ride search should filter by community_id matching ANY of
--    the rider's community_members rows, not just one.
--
-- 4. Driver history: query `driver_ride_history` filtered by
--    driver_id. Rider history: query `rider_ride_history`
--    filtered by rider_id.
