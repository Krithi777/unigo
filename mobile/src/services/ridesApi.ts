import Constants from 'expo-constants';

const BASE_URL: string =
  (Constants.expoConfig?.extra?.API_BASE_URL as string) ||
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  'http://localhost:8000';

export interface CreateRidePayload {
  driver_id: string;
  community_id: string;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address?: string;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_address?: string;
  departure_time: string;
  seats_total: number;
  women_only: boolean;
}

export interface JoinRidePayload {
  rider_id: string;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address?: string;
}

export interface DriverSummary {
  id?: string;
  name?: string;
  phone?: string;
  reliability_score?: number;
  gender?: string;
}

export interface DriverProfileSummary {
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_number?: string;
  vehicle_color?: string;
}

export interface OptimizedRoute {
  overview_polyline?: string;
  total_distance_m?: number;
  total_duration_sec?: number;
  match_score?: number;
  legs?: Array<{
    distance_text?: string;
    duration_text?: string;
    distance_m?: number;
    duration_sec?: number;
  }>;
}

export interface Ride {
  id: string;
  driver_id?: string;
  community_id?: string;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address?: string;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_address?: string;
  departure_time: string;
  seats_total: number;
  seats_available: number;
  women_only: boolean;
  status?: 'scheduled' | 'active' | 'completed' | 'cancelled';
  optimized_route?: OptimizedRoute | null;
  route_match_percent?: number;
  estimated_fare_per_rider?: number;
  users?: DriverSummary;
  driver_profiles?: DriverProfileSummary | null;
}

export interface RideRequest {
  id: string;
  ride_id: string;
  rider_id: string;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address?: string;
  status: string;
  fare_share?: number;
  paid: boolean;
}

export interface SearchRidesParams {
  community_id: string;
  destination?: string;
  pickup_lat?: number;
  pickup_lng?: number;
  women_only?: boolean;
  limit?: number;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    const error = new Error(body?.detail || `HTTP ${res.status}`) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }

  return res.json() as Promise<T>;
}

export async function createRide(payload: CreateRidePayload): Promise<{ ride: Ride }> {
  return apiFetch('/rides/create', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function joinRide(
  rideId: string,
  payload: JoinRidePayload,
): Promise<{ ride_request: RideRequest; optimized_route: OptimizedRoute | null }> {
  return apiFetch(`/rides/${rideId}/join`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function searchRides(params: SearchRidesParams): Promise<Ride[]> {
  const qs = new URLSearchParams();
  if (params.destination?.trim()) qs.set('destination', params.destination.trim());
  if (params.pickup_lat != null) qs.set('pickup_lat', String(params.pickup_lat));
  if (params.pickup_lng != null) qs.set('pickup_lng', String(params.pickup_lng));
  if (params.women_only != null) qs.set('women_only', String(params.women_only));
  if (params.limit != null) qs.set('limit', String(params.limit));

  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const result = await apiFetch<{ rides: Ride[]; count: number }>(
    `/rides/search/${params.community_id}${suffix}`,
  );
  return result.rides ?? [];
}

export async function getWomenOnlyRides(
  communityId: string,
  params: Omit<SearchRidesParams, 'community_id' | 'women_only'> = {},
): Promise<Ride[]> {
  return searchRides({ community_id: communityId, ...params, women_only: true });
}

export async function cancelRide(
  rideId: string,
  driverId: string,
): Promise<{
  cancelled: boolean;
  is_last_minute: boolean;
  stranded_count: number;
  reassigned_count: number;
}> {
  return apiFetch(`/rides/${rideId}/cancel?driver_id=${driverId}`, { method: 'POST' });
}

export async function startRide(rideId: string, driverId: string): Promise<{ ride: Ride }> {
  return apiFetch(`/rides/${rideId}/start?driver_id=${driverId}`, { method: 'POST' });
}

export async function completeRide(
  rideId: string,
  driverId: string,
): Promise<{ completed: boolean; ride_id: string }> {
  return apiFetch(`/rides/${rideId}/complete?driver_id=${driverId}`, { method: 'POST' });
}

export async function updateRideRequest(
  rideId: string,
  reqId: string,
  newStatus: 'accepted' | 'rejected',
): Promise<{ ride_request_id: string; status: string }> {
  return apiFetch(`/rides/${rideId}/request/${reqId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: newStatus }),
  });
}

export async function getUpcomingRides(
  userId: string,
): Promise<{ driver_rides: Ride[]; rider_rides: Ride[] }> {
  return apiFetch(`/rides/upcoming/${userId}`);
}
