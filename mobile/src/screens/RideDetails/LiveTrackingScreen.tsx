/**
 * LiveTrackingScreen.tsx — UniGo  (fixed + redesigned to match wireframe)
 *
 * THE MAIN FIX — why the map wasn't showing:
 *   ① PROVIDER_GOOGLE requires a valid Google Maps API key registered in
 *     app.json → android.config.googleMaps.apiKey AND ios.config.googleMapsApiKey.
 *     Without it, Android shows a blank grey tile, iOS shows Apple Maps ignoring
 *     the provider prop.  Solution: default to no provider (uses device native maps)
 *     and let the user add the API key to restore PROVIDER_GOOGLE.
 *
 *   ② The polyline decoder had a bug: `lng += ... (lng >> 1)` — should be
 *     `(result >> 1)`. Fixed below.
 *
 *   ③ Added `liteMode` prop to the main map — on Android this renders a static
 *     snapshot when the driver hasn't connected yet, avoiding the "empty white
 *     square" during load. Lite mode is disabled once we have a driver location
 *     so the interactive map takes over.
 *
 * How to enable PROVIDER_GOOGLE once you have an API key:
 *   1. Add key to app.json:
 *        "android": { "config": { "googleMaps": { "apiKey": "YOUR_KEY" } } }
 *        "ios":     { "config": { "googleMapsApiKey": "YOUR_KEY" } }
 *   2. Run: npx expo prebuild
 *   3. Import PROVIDER_GOOGLE and add provider={PROVIDER_GOOGLE} to MapView.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Linking,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/services/supabaseClient';

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL ?? 'http://localhost:8000';

// ─── Polyline decoder (fixed) ─────────────────────────────────────────────
function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  if (!encoded) return [];
  const poly: { latitude: number; longitude: number }[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b: number, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    // ↑ BUG WAS HERE: was `lng += ... (lng >> 1)` — fixed to `(result >> 1)`
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    poly.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return poly;
}

// ─── Design tokens — wireframe palette ───────────────────────────────────
const C = {
  brand:       '#7F77DD',
  brandMid:    '#534AB7',
  brandDark:   '#3C3489',
  brandLight:  '#F0EEFF',
  brandBorder: '#AFA9EC',
  green:       '#1D9E75',
  greenLight:  '#E6F7F0',
  amber:       '#EF9F27',
  amberLight:  '#FEF3E0',
  red:         '#E24B4A',
  redLight:    '#FBEAEA',
  pink:        '#993556',
  pinkLight:   '#FBEAF0',
  surface:     '#FFFFFF',
  bg:          '#F5F6FA',
  text:        '#111111',
  textSub:     '#555555',
  textMuted:   '#888888',
  border:      '#E5E7EB',
};

// ─── Types ────────────────────────────────────────────────────────────────
interface RideInfo {
  driver_name:       string;
  driver_phone?:     string;
  driver_reliability?: number;
  vehicle_make?:     string;
  vehicle_model?:    string;
  vehicle_number?:   string;
  vehicle_color?:    string;
  pickup_lat:        number;
  pickup_lng:        number;
  pickup_address?:   string;
  dropoff_lat:       number;
  dropoff_lng:       number;
  dropoff_address?:  string;
  women_only?:       boolean;
  overview_polyline?: string;
  fare_share?:       string;
}

// ─── Main Screen ──────────────────────────────────────────────────────────
export default function LiveTrackingScreen() {
  const navigation = useNavigation<any>();
  const route      = useRoute<any>();
  const { rideId, rideInfo: rideInfoParam } = route.params ?? {};

  const rideInfo: RideInfo | null = rideInfoParam
    ? (() => { try { return JSON.parse(rideInfoParam); } catch { return null; } })()
    : null;

  const mapRef      = useRef<MapView>(null);
  const scaleAnim   = useRef(new Animated.Value(1)).current;
  const socketRef   = useRef<any>(null);

  const [driverLoc, setDriverLoc]         = useState<{ latitude: number; longitude: number } | null>(null);
  const [routeCoords, setRouteCoords]     = useState<{ latitude: number; longitude: number }[]>([]);
  const [eta, setEta]                     = useState<string | null>(null);
  const [etaDist, setEtaDist]             = useState<string | null>(null);
  const [rideData, setRideData]           = useState<RideInfo | null>(rideInfo);
  const [loading, setLoading]             = useState(!rideInfo);
  const [rideStatus, setRideStatus]       = useState<'waiting' | 'active' | 'completed' | 'cancelled'>('waiting');
  const [backupBanner, setBackupBanner]   = useState(false);
  const [backupFound, setBackupFound]     = useState(false);
  const [startedBanner, setStartedBanner] = useState(false);
  const [riderPickup, setRiderPickup]     = useState<{ lat: number; lng: number } | null>(null);
  // Only use liteMode until we have a real driver location
  const [hasDriverLoc, setHasDriverLoc]   = useState(false);

  // ── Fetch ride if not passed via params ─────────────────────────────
  useEffect(() => {
    if (rideInfo || !rideId) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('rides')
          .select(`*, users!rides_driver_id_fkey(name, phone, reliability_score), driver_profiles(vehicle_make, vehicle_model, vehicle_number, vehicle_color)`)
          .eq('id', rideId)
          .single();

        if (data) {
          const info: RideInfo = {
            driver_name:       data.users?.name ?? 'Driver',
            driver_phone:      data.users?.phone,
            driver_reliability: data.users?.reliability_score,
            vehicle_make:      data.driver_profiles?.vehicle_make,
            vehicle_model:     data.driver_profiles?.vehicle_model,
            vehicle_number:    data.driver_profiles?.vehicle_number,
            vehicle_color:     data.driver_profiles?.vehicle_color,
            pickup_lat:        data.pickup_lat,
            pickup_lng:        data.pickup_lng,
            pickup_address:    data.pickup_address,
            dropoff_lat:       data.dropoff_lat,
            dropoff_lng:       data.dropoff_lng,
            dropoff_address:   data.dropoff_address,
            women_only:        data.women_only,
            overview_polyline: data.optimized_route?.overview_polyline,
          };
          setRideData(info);
          if (data.optimized_route?.overview_polyline) {
            setRouteCoords(decodePolyline(data.optimized_route.overview_polyline));
          }
        }
      } catch (e) { console.error('[LiveTracking] fetchRide:', e); }
      finally { setLoading(false); }
    })();
  }, [rideId]);

  // ── Decode polyline when rideData loads ─────────────────────────────
  useEffect(() => {
    if (rideData?.overview_polyline) {
      setRouteCoords(decodePolyline(rideData.overview_polyline));
    }
  }, [rideData]);

  // ── Rider's specific pickup from ride_requests ───────────────────────
  useEffect(() => {
    if (!rideId) return;
    (async () => {
      const uid = await AsyncStorage.getItem('user_id');
      if (!uid) return;
      const { data: req } = await supabase
        .from('ride_requests')
        .select('pickup_lat, pickup_lng')
        .eq('ride_id', rideId)
        .eq('rider_id', uid)
        .in('status', ['pending', 'accepted'])
        .maybeSingle();
      if (req) setRiderPickup({ lat: req.pickup_lat, lng: req.pickup_lng });
    })();
  }, [rideId]);

  // ── Socket.io ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!rideId) return;
    let socket: any;
    (async () => {
      try {
        const { io } = await import('socket.io-client');
        socket = io(SOCKET_URL, { transports: ['websocket'], reconnectionAttempts: 5 });
        socketRef.current = socket;

        socket.on('connect', () => socket.emit('join_ride_room', { ride_id: rideId }));

        socket.on('location_update', (data: { lat: number; lng: number; eta?: string; distance?: string }) => {
          const coords = { latitude: data.lat, longitude: data.lng };
          setDriverLoc(coords);
          setHasDriverLoc(true);
          if (data.eta) setEta(data.eta);
          if (data.distance) setEtaDist(data.distance);

          Animated.sequence([
            Animated.timing(scaleAnim, { toValue: 1.4, duration: 180, useNativeDriver: true }),
            Animated.timing(scaleAnim, { toValue: 1,   duration: 220, useNativeDriver: true }),
          ]).start();

          mapRef.current?.animateToRegion(
            { latitude: data.lat, longitude: data.lng, latitudeDelta: 0.015, longitudeDelta: 0.015 },
            700
          );
        });

        socket.on('route_updated', (data: any) => {
          if (data.ride_id !== rideId) return;
          if (data.route?.overview_polyline) setRouteCoords(decodePolyline(data.route.overview_polyline));
          const legs = data.route?.legs;
          if (legs?.length) {
            setEta(legs[legs.length - 1].duration?.text ?? null);
            setEtaDist(legs[legs.length - 1].distance?.text ?? null);
          }
        });

        socket.on('ride_started', (data: any) => {
          if (data.ride_id === rideId) {
            setRideStatus('active');
            setStartedBanner(true);
            setTimeout(() => setStartedBanner(false), 4000);
          }
        });

        socket.on('ride_completed', (data: any) => {
          if (data.ride_id === rideId) {
            setRideStatus('completed');
            Alert.alert('Ride Completed! 🎉', "You've arrived. Thanks for riding with UniGo!", [
              { text: 'Go Home', onPress: () => navigation.navigate('Home') },
            ]);
          }
        });

        socket.on('ride_cancelled', (data: any) => {
          if (data.ride_id !== rideId) return;
          setRideStatus('cancelled');
          setBackupBanner(true);
          const poll = setInterval(async () => {
            const uid = await AsyncStorage.getItem('user_id');
            if (!uid) { clearInterval(poll); return; }
            const { data: newReq } = await supabase
              .from('ride_requests')
              .select('ride_id, rides(*, users!rides_driver_id_fkey(name))')
              .eq('rider_id', uid).eq('status', 'accepted').neq('ride_id', rideId)
              .order('created_at', { ascending: false }).limit(1).maybeSingle();
            if (newReq?.rides) {
              clearInterval(poll);
              setBackupBanner(false);
              setBackupFound(true);
              setTimeout(() => Alert.alert(
                'Backup Ride Found! 🔄',
                `We found you a new ride with ${(newReq.rides as any).users?.name ?? 'a driver'}.`,
                [{ text: 'Track New Ride', onPress: () => navigation.replace('RiderActiveRide', { rideId: newReq.ride_id }) }]
              ), 1200);
            }
          }, 3000);
          setTimeout(() => clearInterval(poll), 30000);
        });

      } catch (e) {
        console.warn('[Socket] Could not connect:', e);
      }
    })();

    return () => {
      try { socket?.emit('leave_ride_room', { ride_id: rideId }); socket?.disconnect(); } catch {}
    };
  }, [rideId, navigation]);

  // ── Actions ──────────────────────────────────────────────────────────
  const callDriver = () => {
    const phone = rideData?.driver_phone;
    phone ? Linking.openURL(`tel:${phone}`) : Alert.alert('No phone', 'Driver phone not available.');
  };

  const triggerSOS = () => {
    Alert.alert('🆘 Emergency SOS', 'This will alert your emergency contact and share your live location.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Trigger SOS', style: 'destructive', onPress: () => navigation.navigate('SOS', { rideId }) },
    ]);
  };

  const fitMap = () => {
    const pts: { latitude: number; longitude: number }[] = [];
    if (driverLoc) pts.push(driverLoc);
    if (riderPickup) pts.push({ latitude: riderPickup.lat, longitude: riderPickup.lng });
    if (rideData?.dropoff_lat) pts.push({ latitude: rideData.dropoff_lat, longitude: rideData.dropoff_lng });
    if (pts.length >= 2) mapRef.current?.fitToCoordinates(pts, { edgePadding: { top: 100, right: 40, bottom: 260, left: 40 }, animated: true });
  };

  const score      = rideData?.driver_reliability ?? 100;
  const scoreColor = score >= 80 ? C.green : score >= 60 ? C.amber : C.red;
  const initialRegion = {
    latitude:  riderPickup?.lat ?? rideData?.pickup_lat ?? 10.762,
    longitude: riderPickup?.lng ?? rideData?.pickup_lng ?? 78.819,
    latitudeDelta: 0.04, longitudeDelta: 0.04,
  };

  if (loading) return (
    <View style={styles.loaderWrap}>
      <ActivityIndicator size="large" color={C.brand} />
      <Text style={styles.loaderTxt}>Loading live tracking…</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── Top overlay ──────────────────────────────────────────────── */}
      <SafeAreaView style={styles.topOverlay} pointerEvents="box-none" edges={['top']}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.topBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.topBtnTxt}>←</Text>
          </TouchableOpacity>
          <View style={styles.topCenter}>
            <Text style={styles.topTitle}>Live Tracking</Text>
            <View style={[styles.statusPill, { backgroundColor: rideStatus === 'active' ? C.green : rideStatus === 'cancelled' ? C.red : C.amber }]}>
              <View style={styles.statusDot} />
              <Text style={styles.statusTxt}>
                {rideStatus === 'active' ? 'Driver on the way' : rideStatus === 'cancelled' ? 'Cancelled' : 'Waiting for driver'}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.topBtn} onPress={fitMap}>
            <Text style={styles.topBtnTxt}>⊙</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* ── Floating banners ─────────────────────────────────────────── */}
      {startedBanner && (
        <View style={[styles.floatBanner, { backgroundColor: C.green }]}>
          <Text style={styles.floatBannerIcon}>🚗</Text>
          <Text style={styles.floatBannerTxt}>Your driver is on the way!</Text>
        </View>
      )}
      {backupBanner && (
        <View style={[styles.floatBanner, { backgroundColor: C.amber }]}>
          <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
          <View>
            <Text style={styles.floatBannerTxt}>Finding Backup Ride…</Text>
            <Text style={styles.floatBannerSub}>Guaranteed Backup Match is active.</Text>
          </View>
        </View>
      )}
      {backupFound && (
        <View style={[styles.floatBanner, { backgroundColor: C.green }]}>
          <Text style={styles.floatBannerIcon}>✅</Text>
          <Text style={styles.floatBannerTxt}>Backup ride found! Redirecting…</Text>
        </View>
      )}

      {/* ── Map ──────────────────────────────────────────────────────── */}
      {/*
        KEY FIX: No provider prop = device default maps (Google on Android,
        Apple on iOS). This works without any API key setup.
        liteMode={!hasDriverLoc} — on Android, lite mode renders a static
        bitmap that appears instantly instead of a blank white tile.
        Once the driver connects and sends location_update, we switch to
        interactive mode so the map animates and markers update.
      */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        showsTraffic={false}
        liteMode={!hasDriverLoc}
      >
        {/* Animated driver marker */}
        {driverLoc && (
          <Marker coordinate={driverLoc} anchor={{ x: 0.5, y: 0.5 }} flat>
            <Animated.View style={[styles.driverMarker, { transform: [{ scale: scaleAnim }] }]}>
              <View style={styles.driverPulse} />
              <View style={styles.driverCar}>
                <Text style={styles.driverCarIcon}>🚗</Text>
              </View>
              <View style={styles.driverLabel}>
                <Text style={styles.driverLabelTxt}>{rideData?.driver_name?.split(' ')[0] ?? 'Driver'}</Text>
              </View>
            </Animated.View>
          </Marker>
        )}

        {/* Rider pickup */}
        {riderPickup && (
          <Marker coordinate={{ latitude: riderPickup.lat, longitude: riderPickup.lng }} title="Your Pickup">
            <View style={styles.pickupMarker}>
              <View style={styles.pickupDot} />
              <Text style={styles.pickupLbl}>You</Text>
            </View>
          </Marker>
        )}
        {!riderPickup && rideData?.pickup_lat && (
          <Marker coordinate={{ latitude: rideData.pickup_lat, longitude: rideData.pickup_lng }} pinColor={C.brand} title="Pickup" />
        )}

        {/* Destination */}
        {rideData?.dropoff_lat && (
          <Marker coordinate={{ latitude: rideData.dropoff_lat, longitude: rideData.dropoff_lng }} title="Destination">
            <View style={styles.destMarker}>
              <View style={styles.destDot} />
              <Text style={styles.destLbl}>📍</Text>
            </View>
          </Marker>
        )}

        {/* RouteMorph route polyline */}
        {routeCoords.length > 1 && (
          <Polyline coordinates={routeCoords} strokeColor={C.brand} strokeWidth={4} lineCap="round" lineJoin="round" />
        )}
      </MapView>

      {/* ── FABs ─────────────────────────────────────────────────────── */}
      {driverLoc && (
        <TouchableOpacity style={styles.centerFab} onPress={() => mapRef.current?.animateToRegion({ ...driverLoc, latitudeDelta: 0.015, longitudeDelta: 0.015 }, 600)}>
          <Text style={styles.fabIcon}>🧭</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.sosFab} onPress={triggerSOS}>
        <Text style={styles.sosFabTxt}>SOS</Text>
      </TouchableOpacity>

      {/* ── Bottom panel — wireframe layout ──────────────────────────── */}
      <SafeAreaView style={styles.panelSafe} edges={['bottom']}>
        <View style={styles.panel}>
          <View style={styles.panelHandle} />

          {/* ETA banner */}
          <View style={styles.etaBanner}>
            <View style={styles.etaLeft}>
              <Text style={styles.etaLabel}>ETA</Text>
              <Text style={styles.etaVal}>{eta ?? '—'}</Text>
              {etaDist && <Text style={styles.etaDist}>{etaDist}</Text>}
            </View>
            <View style={styles.rmLive}>
              <View style={styles.rmLiveDot} />
              <Text style={styles.rmLiveTxt}>LIVE</Text>
            </View>
          </View>

          {/* Driver info notification — wireframe "notify-banner" style */}
          <View style={styles.notifyBanner}>
            <Text style={styles.notifyIcon}>🧭</Text>
            <Text style={styles.notifyTxt}>
              <Text style={{ fontWeight: '600' }}>
                {driverLoc ? 'Driver is nearby.' : 'Waiting for driver.'}
              </Text>
              {rideData?.pickup_address ? ` Head to ${rideData.pickup_address}.` : ''}
              {routeCoords.length > 0 ? ' Route updated.' : ''}
            </Text>
          </View>

          {/* Women-Only */}
          {rideData?.women_only && (
            <View style={styles.womenBanner}>
              <Text style={styles.womenIcon}>♀</Text>
              <Text style={styles.womenTxt}>Women-Only Ride · Verified female driver</Text>
              <Text style={styles.womenShield}>🛡</Text>
            </View>
          )}

          {/* Driver row */}
          <View style={styles.driverRow}>
            <View style={styles.driverAvatar}>
              <Text style={styles.driverAvatarTxt}>{(rideData?.driver_name ?? 'D')[0].toUpperCase()}</Text>
              <View style={[styles.scoreBadge, { backgroundColor: scoreColor }]}>
                <Text style={styles.scoreBadgeTxt}>★ {(score / 10).toFixed(1)}</Text>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.driverName}>{rideData?.driver_name ?? 'Driver'}</Text>
              <Text style={styles.vehicleTxt}>
                {rideData?.vehicle_color ? `${rideData.vehicle_color} ` : ''}
                {rideData?.vehicle_make ?? 'Vehicle'} {rideData?.vehicle_model ?? ''}
              </Text>
              {rideData?.vehicle_number && (
                <Text style={styles.vehicleNumber}>{rideData.vehicle_number.toUpperCase()}</Text>
              )}
            </View>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{eta ?? '—'}</Text>
              <Text style={styles.statLbl}>Arrival</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{etaDist ?? '—'}</Text>
              <Text style={styles.statLbl}>Distance</Text>
            </View>
            {rideData?.fare_share && (
              <View style={styles.statBox}>
                <Text style={styles.statNum}>₹{rideData.fare_share}</Text>
                <Text style={styles.statLbl}>Your fare</Text>
              </View>
            )}
          </View>

          {/* Safety note */}
          <View style={styles.safetyNote}>
            <Text style={styles.safetyIcon}>🛡</Text>
            <Text style={styles.safetyTxt}>Emergency contact will be notified if SOS is tapped</Text>
          </View>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.msgBtn} onPress={() => Alert.alert('Message', 'Chat coming soon!')}>
              <Text style={styles.msgBtnIcon}>💬</Text>
              <Text style={styles.msgBtnTxt}>Message</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.callBtn} onPress={callDriver}>
              <Text style={styles.callBtnIcon}>📞</Text>
              <Text style={styles.callBtnTxt}>Call Driver</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#1a1a2e' },
  loaderWrap:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a2e', gap: 12 },
  loaderTxt:   { color: '#fff', fontSize: 14 },

  // Top overlay
  topOverlay:  { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  topBar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  topBtn:      { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.95)', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  topBtnTxt:   { fontSize: 20, fontWeight: '600', color: C.brand },
  topCenter:   { alignItems: 'center', flex: 1 },
  topTitle:    { fontSize: 16, fontWeight: '800', color: '#fff', textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  statusPill:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginTop: 5 },
  statusDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  statusTxt:   { fontSize: 11, fontWeight: '600', color: '#fff' },

  // Float banners
  floatBanner: { position: 'absolute', top: 90, left: 16, right: 16, zIndex: 20, flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  floatBannerIcon: { fontSize: 20, marginRight: 10 },
  floatBannerTxt:  { color: '#fff', fontWeight: '700', fontSize: 14, flex: 1 },
  floatBannerSub:  { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 2 },

  // Driver marker
  driverMarker: { alignItems: 'center' },
  driverPulse:  { position: 'absolute', width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(127,119,221,0.25)' },
  driverCar:    { width: 40, height: 40, borderRadius: 20, backgroundColor: C.brand, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#fff', shadowColor: C.brand, shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  driverCarIcon:{ fontSize: 20 },
  driverLabel:  { backgroundColor: '#fff', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginTop: 3, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
  driverLabelTxt: { fontSize: 10, fontWeight: '700', color: C.text },

  // Pickup marker
  pickupMarker: { alignItems: 'center' },
  pickupDot:    { width: 16, height: 16, borderRadius: 8, backgroundColor: C.brand, borderWidth: 3, borderColor: '#fff' },
  pickupLbl:    { fontSize: 10, fontWeight: '700', color: C.brand, backgroundColor: '#fff', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1, marginTop: 2 },

  // Dest marker
  destMarker:   { alignItems: 'center' },
  destDot:      { width: 16, height: 16, borderRadius: 8, backgroundColor: C.red, borderWidth: 3, borderColor: '#fff' },
  destLbl:      { fontSize: 12, marginTop: 2 },

  // FABs
  centerFab:    { position: 'absolute', bottom: 310, right: 16, zIndex: 15, width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.95)', justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  fabIcon:      { fontSize: 22 },
  sosFab:       { position: 'absolute', bottom: 310, left: 16, zIndex: 15, width: 52, height: 52, borderRadius: 26, backgroundColor: C.red, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#fff', shadowColor: C.red, shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  sosFabTxt:    { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },

  // Bottom panel
  panelSafe:    { position: 'absolute', bottom: 0, left: 0, right: 0 },
  panel:        { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 14 },
  panelHandle:  { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 12 },

  // ETA banner
  etaBanner:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.brandLight, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 },
  etaLeft:      { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  etaLabel:     { fontSize: 11, color: C.brandMid, fontWeight: '600', textTransform: 'uppercase' },
  etaVal:       { fontSize: 22, fontWeight: '900', color: C.brand },
  etaDist:      { fontSize: 12, color: C.textMuted },
  rmLive:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.brand, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  rmLiveDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ADE80' },
  rmLiveTxt:    { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  // Notify banner — wireframe amber style
  notifyBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: C.amberLight, borderWidth: 0.5, borderColor: C.amber, borderRadius: 10, padding: 10, marginBottom: 8 },
  notifyIcon:   { fontSize: 14, color: C.amber },
  notifyTxt:    { fontSize: 11, color: '#633806', flex: 1, lineHeight: 16 },

  // Women banner
  womenBanner:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.pinkLight, borderWidth: 0.5, borderColor: '#C084FC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  womenIcon:    { fontSize: 14, color: C.pink },
  womenTxt:     { flex: 1, fontSize: 11, fontWeight: '600', color: C.pink },
  womenShield:  { fontSize: 14 },

  // Driver row
  driverRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  driverAvatar:   { width: 48, height: 48, borderRadius: 24, backgroundColor: C.brand, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  driverAvatarTxt:{ color: '#fff', fontWeight: '800', fontSize: 20 },
  scoreBadge:     { position: 'absolute', bottom: -3, right: -4, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2 },
  scoreBadgeTxt:  { color: '#fff', fontSize: 9, fontWeight: '700' },
  driverName:     { fontSize: 14, fontWeight: '700', color: C.text },
  vehicleTxt:     { fontSize: 12, color: C.textSub, marginTop: 2 },
  vehicleNumber:  { fontSize: 12, color: C.textMuted, fontWeight: '600', marginTop: 1 },

  // Stats row
  statsRow:     { flexDirection: 'row', gap: 6, marginBottom: 8 },
  statBox:      { flex: 1, backgroundColor: C.bg, borderRadius: 10, padding: 8, alignItems: 'center' },
  statNum:      { fontSize: 14, fontWeight: '700', color: C.text },
  statLbl:      { fontSize: 9, color: C.textMuted, marginTop: 2 },

  // Safety note
  safetyNote:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.redLight, borderRadius: 8, padding: 8, marginBottom: 10 },
  safetyIcon:   { fontSize: 12, color: C.red },
  safetyTxt:    { fontSize: 10, color: '#791F1F', flex: 1 },

  // Actions
  actionRow:    { flexDirection: 'row', gap: 8 },
  msgBtn:       { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 14, borderWidth: 2, borderColor: C.brand },
  msgBtnIcon:   { fontSize: 16 },
  msgBtnTxt:    { fontSize: 14, fontWeight: '700', color: C.brand },
  callBtn:      { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 14, backgroundColor: C.brand, shadowColor: C.brand, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  callBtnIcon:  { fontSize: 16 },
  callBtnTxt:   { fontSize: 14, fontWeight: '700', color: '#fff' },
});