// Socket.io client — route_updated, location_update, sos_triggered events
/**
 * socketService.ts — Socket.io client for UniGo (Phases 1, 2, 4).
 *
 * Manages a single persistent socket connection and exposes
 * typed helpers for every event the app needs.
 *
 * Usage:
 *   import * as SocketService from '@/services/socketService';
 *   SocketService.joinRideRoom(rideId);
 *   SocketService.onRouteUpdated((data) => { ... });
 */

import { io, Socket } from 'socket.io-client';
import Constants from 'expo-constants';

// Read from app.config.js / .env via expo-constants extra
const SOCKET_URL: string =
  (Constants.expoConfig?.extra?.SOCKET_URL as string) ||
  process.env.EXPO_PUBLIC_SOCKET_URL ||
  'http://localhost:8000';

// -------------------------------------------------------------------------- //
//  Types
// -------------------------------------------------------------------------- //

export interface RouteUpdatedPayload {
  ride_id: string;
  route: {
    waypoint_order: number[];
    ordered_stops: Array<{
      index: number;
      rider_id: string;
      pickup_lat: number;
      pickup_lng: number;
      pickup_address?: string;
    }>;
    legs: Array<{
      distance_text: string;
      distance_m: number;
      duration_text: string;
      duration_sec: number;
    }>;
    overview_polyline: string;
    total_distance_m: number;
    total_duration_sec: number;
  };
}

export interface LocationUpdatePayload {
  lat: number;
  lng: number;
  heading?: number;
  timestamp: string;
}

export interface RideEventPayload {
  ride_id: string;
  completed_at?: string;
}

// -------------------------------------------------------------------------- //
//  Singleton socket instance
// -------------------------------------------------------------------------- //

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
      path: '/socket.io',
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.warn('[Socket] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
    });
  }
  return socket;
}

// Ensure socket is initialised early (call once in App root)
export function initSocket(): void {
  getSocket();
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
  socket = null;
}

// -------------------------------------------------------------------------- //
//  Room management
// -------------------------------------------------------------------------- //

export function joinRideRoom(rideId: string): void {
  getSocket().emit('join_ride_room', { ride_id: rideId });
}

export function leaveRideRoom(rideId: string): void {
  getSocket().emit('leave_ride_room', { ride_id: rideId });
}

// -------------------------------------------------------------------------- //
//  Phase 1 — Route updates
// -------------------------------------------------------------------------- //

export function onRouteUpdated(
  callback: (data: RouteUpdatedPayload) => void
): () => void {
  const s = getSocket();
  s.on('route_updated', callback);
  return () => s.off('route_updated', callback);
}

// -------------------------------------------------------------------------- //
//  Phase 2 — Ride cancellation / backup
// -------------------------------------------------------------------------- //

export function onRideCancelled(
  callback: (data: { ride_id: string }) => void
): () => void {
  const s = getSocket();
  s.on('ride_cancelled', callback);
  return () => s.off('ride_cancelled', callback);
}

// -------------------------------------------------------------------------- //
//  Phase 4 — Driver location streaming
// -------------------------------------------------------------------------- //

/**
 * Driver side: emit current GPS position to the ride room.
 * Call this in watchPositionAsync callback, every ~3 seconds.
 */
export function emitDriverLocation(
  rideId: string,
  lat: number,
  lng: number,
  heading?: number
): void {
  getSocket().emit('driver_location_update', {
    ride_id: rideId,
    lat,
    lng,
    heading,
  });
}

/**
 * Rider side: listen for driver location updates.
 * Returns an unsubscribe function — call it in useEffect cleanup.
 */
export function onLocationUpdate(
  callback: (data: LocationUpdatePayload) => void
): () => void {
  const s = getSocket();
  s.on('location_update', callback);
  return () => s.off('location_update', callback);
}

// -------------------------------------------------------------------------- //
//  Phase 4 — Ride lifecycle events
// -------------------------------------------------------------------------- //

/** Driver emits 'start_ride' via socket (alternative to HTTP endpoint). */
export function emitStartRide(rideId: string): void {
  getSocket().emit('start_ride', { ride_id: rideId });
}

/** Driver emits 'end_ride' via socket. */
export function emitEndRide(rideId: string): void {
  getSocket().emit('end_ride', { ride_id: rideId });
}

export function onRideStarted(
  callback: (data: RideEventPayload) => void
): () => void {
  const s = getSocket();
  s.on('ride_started', callback);
  return () => s.off('ride_started', callback);
}

export function onRideCompleted(
  callback: (data: RideEventPayload) => void
): () => void {
  const s = getSocket();
  s.on('ride_completed', callback);
  return () => s.off('ride_completed', callback);
}