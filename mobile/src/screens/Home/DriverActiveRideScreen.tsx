/**
 * DriverActiveRideScreen.tsx — Driver's live ride management view.
 * Streams driver GPS location via Socket.io every 3 seconds to all riders.
 * Uses PROVIDER_GOOGLE for real maps. Shows passenger list + optimized route.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, SafeAreaView, StatusBar, Alert,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL!;
const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL!;

function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const poly: { latitude: number; longitude: number }[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    poly.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return poly;
}

const C = {
  brand: '#5B2EFF', green: '#16A34A', greenLight: '#DCFCE7',
  red: '#DC2626', amber: '#F59E0B',
  surface: '#fff', text: '#0F172A', textSub: '#64748B', border: '#EAECF0', bg: '#F5F6FA',
};

export default function DriverActiveRideScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { rideId } = route.params ?? {};

  const mapRef = useRef<MapView>(null);
  const socketRef = useRef<any>(null);
  const locationIntervalRef = useRef<any>(null);

  const [ride, setRide] = useState<any>(null);
  const [passengers, setPassengers] = useState<any[]>([]);
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [myLocation, setMyLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [rideStarted, setRideStarted] = useState(false);

  const fetchRide = useCallback(async () => {
    if (!rideId) return;
    const { data: rideData } = await supabase
      .from('rides')
      .select(`*, communities(name)`)
      .eq('id', rideId).single();
    setRide(rideData);
    if (rideData?.optimized_route?.overview_polyline) {
      setRouteCoords(decodePolyline(rideData.optimized_route.overview_polyline));
    }

    const { data: requests } = await supabase
      .from('ride_requests')
      .select(`*, users(name, phone, reliability_score)`)
      .eq('ride_id', rideId)
      .in('status', ['accepted', 'pending']);
    setPassengers(requests ?? []);
    setLoading(false);
  }, [rideId]);

  useEffect(() => { fetchRide(); }, [fetchRide]);

  // Setup socket + start broadcasting location
  useEffect(() => {
    if (!rideId) return;
    let socket: any;
    (async () => {
      try {
        const { io } = await import('socket.io-client');
        socket = io(SOCKET_URL, { transports: ['websocket'] });
        socketRef.current = socket;
        socket.on('connect', () => socket.emit('join_ride_room', { ride_id: rideId }));

        socket.on('route_updated', (data: any) => {
          if (data.ride_id === rideId && data.route?.overview_polyline) {
            setRouteCoords(decodePolyline(data.route.overview_polyline));
          }
        });
      } catch (e) { console.warn('Socket error', e); }
    })();
    return () => {
      try { socket?.disconnect(); } catch {}
    };
  }, [rideId]);

  // Broadcast driver location every 3 seconds when ride is active
  useEffect(() => {
    if (!rideStarted || !rideId) return;
    const broadcastLocation = async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const { latitude, longitude } = loc.coords;
        setMyLocation({ latitude, longitude });
        mapRef.current?.animateToRegion({ latitude, longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 500);
        // Send to backend which broadcasts via Socket.io
        await fetch(`${API_BASE}/rides/${rideId}/location`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: latitude, lng: longitude }),
        }).catch(() => {
          // Fallback: emit directly via socket
          socketRef.current?.emit('driver_location_update', { ride_id: rideId, lat: latitude, lng: longitude });
        });
      } catch (e) { console.warn('Location error', e); }
    };
    locationIntervalRef.current = setInterval(broadcastLocation, 3000);
    broadcastLocation(); // immediate first call
    return () => clearInterval(locationIntervalRef.current);
  }, [rideStarted, rideId]);

  const startRide = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Location permission is needed to start the ride.');
      return;
    }
    await supabase.from('rides').update({ status: 'active' }).eq('id', rideId);
    socketRef.current?.emit('ride_started', { ride_id: rideId });
    setRideStarted(true);
  };

  const completeRide = async () => {
    Alert.alert('Complete Ride', 'Mark this ride as completed?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Complete', onPress: async () => {
        clearInterval(locationIntervalRef.current);
        await supabase.from('rides').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', rideId);
        await supabase.from('ride_requests').update({ status: 'completed' }).eq('ride_id', rideId);
        socketRef.current?.emit('ride_completed', { ride_id: rideId });
        navigation.navigate('Home');
      }},
    ]);
  };

  const cancelRide = async () => {
    Alert.alert('Cancel Ride', 'Cancel this ride? Riders will be notified and backup match will activate.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Cancel Ride', style: 'destructive', onPress: async () => {
        clearInterval(locationIntervalRef.current);
        await supabase.from('rides').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', rideId);
        socketRef.current?.emit('ride_cancelled', { ride_id: rideId });
        // Trigger backup match on backend
        await fetch(`${API_BASE}/rides/${rideId}/cancel`, { method: 'POST' }).catch(() => {});
        navigation.navigate('Home');
      }},
    ]);
  };

  if (loading) return <View style={styles.loader}><ActivityIndicator size="large" color={C.brand} /></View>;

  const initialRegion = {
    latitude: ride?.pickup_lat ?? 10.762,
    longitude: ride?.pickup_lng ?? 78.8194,
    latitudeDelta: 0.05, longitudeDelta: 0.05,
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />

      {/* Map */}
      <MapView ref={mapRef} provider={PROVIDER_GOOGLE} style={styles.map} initialRegion={initialRegion} showsTraffic>
        {myLocation && <Marker coordinate={myLocation} title="You (Driver)" pinColor={C.brand} />}
        {ride?.dropoff_lat && (
          <Marker coordinate={{ latitude: ride.dropoff_lat, longitude: ride.dropoff_lng }} title="Destination" pinColor={C.red} />
        )}
        {passengers.map((p: any) => (
          p.pickup_lat && <Marker key={p.id} coordinate={{ latitude: p.pickup_lat, longitude: p.pickup_lng }} title={p.users?.name} pinColor={C.amber} />
        ))}
        {routeCoords.length > 0 && (
          <Polyline coordinates={routeCoords} strokeColor={C.brand} strokeWidth={4} />
        )}
      </MapView>

      {/* Bottom panel */}
      <SafeAreaView style={styles.panel}>
        <Text style={styles.panelTitle}>
          {ride?.pickup_address ?? 'Pickup'} → {ride?.dropoff_address ?? 'Destination'}
        </Text>
        <Text style={styles.community}>{ride?.communities?.name}</Text>

        {/* Passengers */}
        <Text style={styles.passLabel}>Passengers ({passengers.length})</Text>
        <FlatList
          data={passengers}
          horizontal
          keyExtractor={(p) => p.id}
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 14 }}
          renderItem={({ item }) => (
            <View style={styles.passengerChip}>
              <View style={styles.passengerAvatar}><Text style={styles.passengerAvatarText}>{(item.users?.name ?? 'R')[0]}</Text></View>
              <Text style={styles.passengerName}>{item.users?.name?.split(' ')[0]}</Text>
            </View>
          )}
        />

        {/* Action buttons */}
        <View style={styles.actionRow}>
          {!rideStarted ? (
            <TouchableOpacity style={styles.startBtn} onPress={startRide} activeOpacity={0.85}>
              <Text style={styles.startBtnText}>▶ Start Ride</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.completeBtn} onPress={completeRide} activeOpacity={0.85}>
              <Text style={styles.completeBtnText}>✓ Complete Ride</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.cancelBtn} onPress={cancelRide} activeOpacity={0.85}>
            <Text style={styles.cancelBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  panel: {
    backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 12,
  },
  panelTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 },
  community: { fontSize: 12, color: C.textSub, marginBottom: 14 },
  passLabel: { fontSize: 12, fontWeight: '600', color: C.textSub, marginBottom: 8 },
  passengerChip: { alignItems: 'center', marginRight: 14 },
  passengerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.brand, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  passengerAvatarText: { color: '#fff', fontWeight: '700' },
  passengerName: { fontSize: 11, color: C.textSub },
  actionRow: { flexDirection: 'row', gap: 10 },
  startBtn: { flex: 1, backgroundColor: C.brand, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  startBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  completeBtn: { flex: 1, backgroundColor: C.green, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  completeBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  cancelBtn: { width: 52, backgroundColor: '#FEE2E2', borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  cancelBtnText: { color: C.red, fontWeight: '800', fontSize: 18 },
});
