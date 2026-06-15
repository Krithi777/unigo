/**
 * RiderActiveRideScreen.tsx — Phase 4.
 *
 * Rider's live tracking view:
 *   - Animated driver marker that moves as location_update events arrive
 *   - Rider's own pickup pin (static)
 *   - Destination pin
 *   - Route polyline (from RouteMorph overview_polyline)
 *   - Bottom panel: driver name, vehicle, ETA
 *   - SOS button (top-right) → triggers emergency flow
 *   - Handles ride_cancelled → shows backup-finding banner
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
} from 'react-native-maps';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import * as SocketService from '@/services/socketService';
import { decodePolyline } from '@/utils/decodePolyline';

interface RideInfo {
  driver_name: string;
  vehicle_make?: string;
  vehicle_color?: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  overview_polyline?: string;
}

type RiderActiveRideParams = {
  RiderActiveRide: { rideId: string; rideInfo?: string };
};

export default function RiderActiveRideScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RiderActiveRideParams, 'RiderActiveRide'>>();
  const { rideId, rideInfo: rideInfoParam } = route.params ?? {};

  const [rideInfo] = useState<RideInfo | null>(() => {
    try { return rideInfoParam ? JSON.parse(rideInfoParam) : null; } catch { return null; }
  });

  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [eta, setEta] = useState<string | null>(null);
  const [rideStatus, setRideStatus] = useState<'waiting' | 'active' | 'completed' | 'cancelled'>('waiting');
  const [backupBanner, setBackupBanner] = useState(false);

  const markerAnim = useRef(new Animated.Value(0)).current;
  const mapRef = useRef<MapView>(null);

  // Init route polyline from props
  useEffect(() => {
    if (rideInfo?.overview_polyline) {
      setRouteCoords(decodePolyline(rideInfo.overview_polyline));
    }
  }, [rideInfo]);

  // Join socket room + subscribe to events
  useEffect(() => {
    if (!rideId) return;
    SocketService.joinRideRoom(rideId);

    const unsubs = [
      SocketService.onLocationUpdate((data) => {
        setDriverLocation({ lat: data.lat, lng: data.lng });
        Animated.sequence([
          Animated.timing(markerAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(markerAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start();
        mapRef.current?.animateToRegion({
          latitude: data.lat,
          longitude: data.lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }, 800);
      }),

      SocketService.onRouteUpdated((data) => {
        if (data.ride_id !== rideId) return;
        setRouteCoords(decodePolyline(data.route.overview_polyline));
        const legs = data.route.legs;
        if (legs.length > 0) {
          const lastLeg = legs[legs.length - 1];
          setEta(lastLeg.duration_text);
        }
      }),

      SocketService.onRideStarted((data) => {
        if (data.ride_id === rideId) setRideStatus('active');
      }),

      SocketService.onRideCompleted((data) => {
        if (data.ride_id === rideId) {
          setRideStatus('completed');
          navigation.navigate('Home', { rideCompleted: '1' });
        }
      }),

      SocketService.onRideCancelled((data) => {
        if (data.ride_id === rideId) {
          setRideStatus('cancelled');
          setBackupBanner(true);
        }
      }),
    ];

    return () => {
      unsubs.forEach((fn) => fn());
      SocketService.leaveRideRoom(rideId);
    };
  }, [rideId, markerAnim, navigation]);

  const markerScale = markerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.3],
  });

  const mapRegion = {
    latitude: rideInfo?.pickup_lat ?? 13.0827,
    longitude: rideInfo?.pickup_lng ?? 80.2707,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  return (
    <View style={styles.container}>
      {/* Backup finding banner */}
      {backupBanner && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            🔄 Your driver cancelled. Finding you a backup ride…
          </Text>
        </View>
      )}

      {/* SOS button */}
      <TouchableOpacity
        style={styles.sosBtn}
        onPress={() => navigation.navigate('SOS', { rideId })}
      >
        <Text style={styles.sosBtnText}>🆘 SOS</Text>
      </TouchableOpacity>

      {/* Map */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={mapRegion}
      >
        {driverLocation && (
          <Marker
            coordinate={{ latitude: driverLocation.lat, longitude: driverLocation.lng }}
            title="Your Driver"
          >
            <Animated.View style={[styles.driverDot, { transform: [{ scale: markerScale }] }]}>
              <Text style={styles.carEmoji}>🚗</Text>
            </Animated.View>
          </Marker>
        )}

        {rideInfo && (
          <Marker
            coordinate={{ latitude: rideInfo.pickup_lat, longitude: rideInfo.pickup_lng }}
            title="Your Pickup"
            pinColor="#F59E0B"
          />
        )}

        {rideInfo && (
          <Marker
            coordinate={{ latitude: rideInfo.dropoff_lat, longitude: rideInfo.dropoff_lng }}
            title="Destination"
            pinColor="#16A34A"
          />
        )}

        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor="#6C47FF"
            strokeWidth={4}
          />
        )}
      </MapView>

      {/* Bottom info panel */}
      <View style={styles.panel}>
        <View style={styles.statusRow}>
          <Text style={styles.statusDot}>
            {rideStatus === 'waiting' ? '🟡' : rideStatus === 'active' ? '🟢' : '⚪'}
          </Text>
          <Text style={styles.statusText}>
            {rideStatus === 'waiting'
              ? 'Waiting for driver to start'
              : rideStatus === 'active'
              ? 'Driver is on the way!'
              : 'Ride ended'}
          </Text>
        </View>

        {rideInfo && (
          <Text style={styles.driverInfo}>
            {rideInfo.driver_name}
            {rideInfo.vehicle_color ? ` · ${rideInfo.vehicle_color}` : ''}
            {rideInfo.vehicle_make ? ` ${rideInfo.vehicle_make}` : ''}
          </Text>
        )}

        {eta && (
          <Text style={styles.etaText}>ETA to destination: {eta}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: '#F59E0B',
    padding: 14,
    alignItems: 'center',
  },
  bannerText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  sosBtn: {
    position: 'absolute',
    top: 56,
    right: 16,
    zIndex: 10,
    backgroundColor: '#DC2626',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#DC2626',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  sosBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  driverDot: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  carEmoji: { fontSize: 24 },

  panel: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  statusDot: { fontSize: 16 },
  statusText: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  driverInfo: { color: '#64748B', fontSize: 14, marginBottom: 4 },
  etaText: { color: '#6C47FF', fontWeight: '700', fontSize: 15 },
});