import React from 'react';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl, Alert,
  Modal, SafeAreaView, Platform, Animated,
  KeyboardAvoidingView,
} from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '../../context/AuthContext';

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
);

const GOOGLE_KEY      = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
const MOCK_USER_ID    = 'a1b2c3d4-0000-0000-0000-000000000001';
const BASE_RATE       = 8;   // ₹ per km
const MIN_FARE        = 30;

// Fallback suggestions shown when Google key is absent
// Replace with your city's common locations
const FALLBACK_SUGGESTIONS = [
  'Railway Station',
  'Bus Stand',
  'Airport',
  'City Centre Mall',
  'Hospital',
  'Market',
  'University Campus',
  'Tech Park',
  'Metro Station',
  'Old Town',
];

const AVATAR_BG   = ['#E8F0FE','#E6F4EA','#FEF0E0','#F3E8FD','#FCE8E6','#E1F5EE'];
const AVATAR_TEXT = ['#1A73E8','#188038','#E37400','#7B1FA2','#C5221F','#0F6E56'];
const TRUST_RING  = ['#1A73E8','#188038','#E37400','#7B1FA2','#C5221F','#0F6E56'];

type TimeFilter = 'all' | 'morning' | 'afternoon' | 'evening';

interface RideResult {
  id: string;
  driver_id: string;
  driver_name: string;
  driver_score: number;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_number: string;
  vehicle_color: string;
  pickup_address: string;
  dropoff_address: string;
  departure_time: string;
  seats_total: number;
  seats_available: number;
  women_only: boolean;
  status: string;
  estimated_fare: number;
  already_requested: boolean;
  request_status: string | null;
}

interface Suggestion { id: string; label: string; }

// ── Helpers ────────────────────────────────────────────────────────────────────
function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function formatDeparture(iso: string) {
  const d      = new Date(iso);
  const now    = new Date();
  const diff   = Math.round((d.getTime() - now.getTime()) / 60000);
  const time   = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (diff > 0 && diff <= 60)  return `${time} · in ${diff}m`;
  if (diff > 60 && diff <= 120) return `${time} · in ${Math.round(diff / 60)}h`;
  const today    = new Date();
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString())    return `Today · ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow · ${time}`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ` · ${time}`;
}

function estimateFare(seats: number) {
  return Math.max(MIN_FARE, Math.round((12 * BASE_RATE) / Math.min(seats + 1, 4)));
}

function seatsColor(n: number) {
  return n >= 2 ? '#1A8C3C' : n === 1 ? '#C97200' : '#C5221F';
}
function seatsLabel(n: number) {
  return n === 0 ? 'Full' : n === 1 ? '1 seat' : `${n} seats`;
}
function seatsSubLabel(n: number) {
  return n === 0 ? 'No seats' : n === 1 ? 'Last one!' : 'Available';
}

// ── Google Places autocomplete (pure fetch, no package) ───────────────────────
async function getPlaceSuggestions(input: string): Promise<Suggestion[]> {
  if (!input || input.length < 2) return [];

  if (!GOOGLE_KEY) {
    const q = input.toLowerCase();
    return FALLBACK_SUGGESTIONS
      .filter(s => s.toLowerCase().includes(q))
      .slice(0, 6)
      .map(s => ({ id: s, label: s }));
  }

  try {
    const url =
      `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
      `?input=${encodeURIComponent(input)}` +
      `&components=country:in&language=en` +
      `&key=${GOOGLE_KEY}`;
    const res  = await fetch(url);
    const json = await res.json();
    if (json.status !== 'OK') return [];
    return (json.predictions as any[]).slice(0, 6).map((p: any) => ({
      id:    p.place_id,
      label: p.description,
    }));
  } catch {
    return [];
  }
}

// ── Location Input Component ──────────────────────────────────────────────────
function LocationInput({
  label, value, onChange, placeholder, dotColor, dotFilled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  dotColor: string;
  dotFilled: boolean;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [focused,     setFocused]     = useState(false);
  const debounce = useRef<any>(null);

  const onType = (text: string) => {
    onChange(text);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setSuggestions(await getPlaceSuggestions(text));
    }, 300);
  };

  const pick = (s: Suggestion) => {
    onChange(s.label);
    setSuggestions([]);
    setFocused(false);
  };

  return (
    <View>
      <View style={li.row}>
        <View style={[
          li.dot,
          { borderColor: dotColor },
          dotFilled ? { backgroundColor: dotColor } : { backgroundColor: '#fff' },
        ]} />
        <View style={{ flex: 1 }}>
          <Text style={li.lbl}>{label}</Text>
          <TextInput
            style={li.input}
            value={value}
            onChangeText={onType}
            placeholder={placeholder}
            placeholderTextColor="#BCC8DE"
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => { setFocused(false); }, 200)}
            returnKeyType="search"
          />
        </View>
        {value.length > 0 && (
          <TouchableOpacity onPress={() => { onChange(''); setSuggestions([]); }} style={li.clear}>
            <Text style={li.clearTxt}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {focused && suggestions.length > 0 && (
        <View style={li.dropdown}>
          {suggestions.map((s, i) => (
            <TouchableOpacity
              key={s.id}
              style={[li.item, i === suggestions.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => pick(s)}
            >
              <Text style={li.itemIcon}>📍</Text>
              <Text style={li.itemTxt} numberOfLines={2}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────
function ConfirmModal({
  ride, pickup, onClose, onConfirm, submitting,
}: {
  ride: RideResult | null;
  pickup: string;
  onClose: () => void;
  onConfirm: (r: RideResult) => void;
  submitting: boolean;
}) {
  const anim = useRef(new Animated.Value(700)).current;

  useEffect(() => {
    if (ride) {
      Animated.spring(anim, { toValue: 0, tension: 65, friction: 12, useNativeDriver: true }).start();
    } else {
      anim.setValue(700);
    }
  }, [ride]);

  if (!ride) return null;

  return (
    <Modal visible animationType="none" transparent onRequestClose={onClose}>
      <View style={cm.overlay}>
        <Animated.View style={[cm.sheet, { transform: [{ translateY: anim }] }]}>
          <SafeAreaView style={{ flex: 1 }}>
            <View style={cm.handle} />
            <ScrollView
              style={cm.scroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={cm.title}>Confirm seat request</Text>

              {/* Driver */}
              <View style={cm.driverRow}>
                <View style={[cm.av, { backgroundColor: AVATAR_BG[0] }]}>
                  <Text style={[cm.avTxt, { color: AVATAR_TEXT[0] }]}>{getInitials(ride.driver_name)}</Text>
                  <View style={[cm.ring, { borderColor: TRUST_RING[0] }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={cm.driverName}>{ride.driver_name}</Text>
                  <View style={cm.badgeRow}>
                    <View style={cm.tBadge}><Text style={cm.tBadgeTxt}>TrustCircle ✓</Text></View>
                    <View style={cm.sBadge}><Text style={cm.sBadgeTxt}>⭐ {ride.driver_score}</Text></View>
                  </View>
                </View>
              </View>

              {/* Info rows */}
              <View style={cm.infoCard}>
                {([
                  ['Vehicle',             [ride.vehicle_make, ride.vehicle_model].filter(Boolean).join(' ') || '—'],
                  ['Colour',              ride.vehicle_color || '—'],
                  ['Plate',               ride.vehicle_number],
                  ['Departs',             formatDeparture(ride.departure_time)],
                  ['Seats left after you', String(Math.max(0, ride.seats_available - 1))],
                ] as [string, string][]).map(([label, val], i, arr) => (
                  <View key={label} style={[cm.infoRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                    <Text style={cm.infoLbl}>{label}</Text>
                    <Text style={label === 'Plate' ? [cm.infoVal, cm.plate] : cm.infoVal}>{val}</Text>
                  </View>
                ))}
              </View>

              {/* Route */}
              <View style={cm.routeCard}>
                <View style={cm.rdFrom} />
                <View style={cm.rLine}  />
                <View style={cm.rdTo}   />
                <View style={{ paddingLeft: 28 }}>
                  <Text style={cm.rFrom}>{pickup || 'Your pickup location'}</Text>
                  <View style={{ height: 14 }} />
                  <Text style={cm.rTo}>{ride.dropoff_address}</Text>
                </View>
              </View>

              {/* Fare */}
              <View style={cm.fareCard}>
                <View style={{ flex: 1 }}>
                  <Text style={cm.fareLbl}>Estimated fare (SmartSplit)</Text>
                  <Text style={cm.fareSub}>Final fare calculated after ride by distance</Text>
                </View>
                <Text style={cm.fareAmt}>₹{ride.estimated_fare}</Text>
              </View>

              {/* Safety */}
              <View style={ride.women_only ? cm.womenBanner : cm.childBanner}>
                <Text style={cm.bannerIcon}>{ride.women_only ? '🚺' : '👶'}</Text>
                <View style={{ flex: 1 }}>
                  {ride.women_only ? (
                    <>
                      <Text style={[cm.bannerTitle, { color: '#7B1FA2' }]}>Women-only ride</Text>
                      <Text style={[cm.bannerSub, { color: '#9B4D9B' }]}>
                        Restricted to female riders only. Children under 18 must be
                        accompanied by a female guardian. Unaccompanied minors not permitted.
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={[cm.bannerTitle, { color: '#854D0E' }]}>Travelling with a child?</Text>
                      <Text style={[cm.bannerSub, { color: '#92400E' }]}>
                        Children under 18 must be accompanied by a parent or guardian.
                        Drivers are not responsible for unaccompanied minors.
                      </Text>
                    </>
                  )}
                </View>
              </View>

              <Text style={cm.note}>
                The driver will accept or decline your request. Cancelling after
                acceptance reduces your reliability score by 10 points.
              </Text>

              <View style={cm.btnRow}>
                <TouchableOpacity style={cm.btnCancel} onPress={onClose} disabled={submitting}>
                  <Text style={cm.btnCancelTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[cm.btnConfirm, submitting && { opacity: 0.6 }]}
                  onPress={() => onConfirm(ride)}
                  disabled={submitting}
                >
                  {submitting
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={cm.btnConfirmTxt}>Send request</Text>
                  }
                </TouchableOpacity>
              </View>
              <View style={{ height: 28 }} />
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Ride Card ─────────────────────────────────────────────────────────────────
function RideCard({
  ride, index, onRequest, onInfo,
}: {
  ride: RideResult;
  index: number;
  onRequest: (r: RideResult) => void;
  onInfo: (r: RideResult) => void;
}) {
  const isFull = ride.seats_available === 0;
  const idx    = index % AVATAR_BG.length;

  const reqLabel = ride.already_requested
    ? (ride.request_status === 'pending'  ? 'Pending ⏳'
     : ride.request_status === 'accepted' ? 'Accepted ✓'
     : ride.request_status === 'rejected' ? 'Declined'
     : 'Requested')
    : 'Request seat';

  const reqStyle = [
    rc.reqBtn,
    ride.already_requested
      ? (ride.request_status === 'accepted' ? rc.btnGreen
       : ride.request_status === 'rejected' ? rc.btnGray
       : rc.btnAmber)
      : ride.seats_available === 1 ? rc.btnAmber : null,
  ].filter(Boolean);

  return (
    <View style={[rc.card, isFull && rc.cardFull]}>
      {/* Driver */}
      <View style={rc.top}>
        <View style={[rc.av, { backgroundColor: AVATAR_BG[idx] }]}>
          <Text style={[rc.avTxt, { color: AVATAR_TEXT[idx] }]}>{getInitials(ride.driver_name)}</Text>
          <View style={[rc.ring, { borderColor: TRUST_RING[idx] }]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={rc.name}>{ride.driver_name}</Text>
          <View style={rc.badges}>
            <View style={rc.tBadge}><Text style={rc.tTxt}>TrustCircle</Text></View>
            <View style={rc.sBadge}><Text style={rc.sTxt}>⭐ {ride.driver_score}</Text></View>
            {!!ride.vehicle_make && <View style={rc.vBadge}><Text style={rc.vTxt}>{ride.vehicle_make}</Text></View>}
            {ride.women_only     && <View style={rc.wBadge}><Text style={rc.wTxt}>🚺 Women only</Text></View>}
          </View>
        </View>
      </View>

      {/* Route */}
      <View style={rc.route}>
        <Text style={rc.rFrom} numberOfLines={1}>{ride.pickup_address}</Text>
        <Text style={rc.rArrow}>——›</Text>
        <Text style={rc.rTo}   numberOfLines={1}>{ride.dropoff_address}</Text>
      </View>

      {/* Stats */}
      <View style={rc.stats}>
        <View style={rc.stat}>
          <Text style={rc.statVal}>{formatDeparture(ride.departure_time)}</Text>
          <Text style={rc.statLbl}>DEPARTS</Text>
        </View>
        <View style={rc.stat}>
          <Text style={[rc.statVal, { color: seatsColor(ride.seats_available) }]}>
            {seatsLabel(ride.seats_available)}
          </Text>
          <Text style={rc.statLbl}>{seatsSubLabel(ride.seats_available).toUpperCase()}</Text>
        </View>
        <View style={[rc.stat, { borderRightWidth: 0 }]}>
          <Text style={[rc.statVal, { color: '#1A73E8' }]}>₹{ride.estimated_fare}</Text>
          <Text style={rc.statLbl}>YOUR FARE</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={rc.actions}>
        {isFull ? (
          <View style={rc.fullPill}><Text style={rc.fullTxt}>Ride full — no seats left</Text></View>
        ) : (
          <>
            <TouchableOpacity
              style={reqStyle as any}
              onPress={() => !ride.already_requested && onRequest(ride)}
              activeOpacity={ride.already_requested ? 1 : 0.85}
            >
              <Text style={rc.reqTxt}>{reqLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={rc.infoBtn} onPress={() => onInfo(ride)}>
              <Text style={{ fontSize: 18 }}>ℹ️</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function FindScreen() {
  const { user, communities } = useAuth();
  const MOCK_USER_ID = user?.id ?? 'a1b2c3d4-0000-0000-0000-000000000001';
  const MOCK_COMMUNITY_ID = communities?.[0]?.communities?.id ?? communities?.[0]?.community_id ?? 'c1b2c3d4-0000-0000-0000-000000000001';
  const [pickup,      setPickup]      = useState('');
  const [destination, setDest]        = useState('');
  const [timeFilter,  setTimeFilter]  = useState<TimeFilter>('all');
  const [seatsFilter, setSeatsFilter] = useState(false);
  const [rides,       setRides]       = useState<RideResult[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [searched,    setSearched]    = useState(false);
  const [confirmRide, setConfirmRide] = useState<RideResult | null>(null);
  const [submitting,  setSubmitting]  = useState(false);
  const channelRef = useRef<any>(null);

  // ── Fetch: 3 separate queries, joined in JS ────────────────────────────────
  const fetchRides = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const now = new Date().toISOString();

      // 1. Rides + user (driver) info
      const { data: ridesData, error } = await supabase
        .from('rides')
        .select(`
          id, driver_id,
          pickup_address, dropoff_address,
          departure_time, seats_total, seats_available,
          women_only, status,
          users!rides_driver_id_fkey ( name, reliability_score )
        `)
        .eq('community_id', MOCK_COMMUNITY_ID)
        .in('status', ['scheduled', 'active'])
        .gte('departure_time', now)
        .neq('driver_id', MOCK_USER_ID)
        .order('departure_time', { ascending: true })
        .limit(30);

      if (error) {
        console.error('FindScreen fetch error:', JSON.stringify(error));
        throw new Error(error.message);
      }

      if (!ridesData || ridesData.length === 0) {
        setRides([]);
        setSearched(true);
        return;
      }

      // 2. Driver profiles (separate table — joined via driver_id = user_id)
      const driverIds = [...new Set(ridesData.map((r: any) => r.driver_id))];
      const { data: profiles } = await supabase
        .from('driver_profiles')
        .select('user_id, vehicle_make, vehicle_model, vehicle_number, vehicle_color')
        .in('user_id', driverIds);

      const profileMap: Record<string, any> = {};
      (profiles ?? []).forEach((p: any) => { profileMap[p.user_id] = p; });

      // 3. My existing requests for these rides
      const rideIds = ridesData.map((r: any) => r.id);
      const { data: myReqs } = await supabase
        .from('ride_requests')
        .select('ride_id, status')
        .eq('rider_id', MOCK_USER_ID)
        .in('ride_id', rideIds);

      const reqMap: Record<string, string> = {};
      (myReqs ?? []).forEach((r: any) => { reqMap[r.ride_id] = r.status; });

      // Merge
      const mapped: RideResult[] = ridesData.map((r: any) => {
        const user = Array.isArray(r.users) ? r.users[0] : r.users;
        const prof = profileMap[r.driver_id] ?? {};
        return {
          id:                r.id,
          driver_id:         r.driver_id,
          driver_name:       user?.name              ?? 'Driver',
          driver_score:      user?.reliability_score ?? 100,
          vehicle_make:      prof.vehicle_make       ?? '',
          vehicle_model:     prof.vehicle_model      ?? '',
          vehicle_number:    prof.vehicle_number     ?? '—',
          vehicle_color:     prof.vehicle_color      ?? '',
          pickup_address:    r.pickup_address        ?? '—',
          dropoff_address:   r.dropoff_address       ?? '—',
          departure_time:    r.departure_time,
          seats_total:       r.seats_total           ?? 4,
          seats_available:   r.seats_available       ?? 0,
          women_only:        r.women_only            ?? false,
          status:            r.status,
          estimated_fare:    estimateFare(r.seats_available),
          already_requested: !!reqMap[r.id],
          request_status:    reqMap[r.id]            ?? null,
        };
      });

      setRides(mapped);
      setSearched(true);
    } catch (err: any) {
      Alert.alert(
        'Could not load rides',
        err?.message?.includes('permission denied')
          ? 'Database permissions not set. Run fix_rls_policies.sql in Supabase SQL Editor.'
          : (err?.message ?? 'Unknown error'),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRides();
    channelRef.current = supabase
      .channel('find_screen_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' },
        () => fetchRides(false))
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'ride_requests',
          filter: `rider_id=eq.${MOCK_USER_ID}` },
        () => fetchRides(false))
      .subscribe();
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [fetchRides]);

  // ── Submit request ────────────────────────────────────────────────────────────
  const submitRequest = async (ride: RideResult) => {
    if (!pickup.trim()) {
      Alert.alert('Set pickup', 'Please enter your pickup location first.');
      setConfirmRide(null);
      return;
    }
    setSubmitting(true);
    try {
      const { data: existing } = await supabase
        .from('ride_requests')
        .select('id')
        .eq('ride_id', ride.id)
        .eq('rider_id', MOCK_USER_ID)
        .maybeSingle();

      if (existing) {
        Alert.alert('Already requested', 'You already have a request for this ride.');
        setConfirmRide(null);
        return;
      }

      const { error } = await supabase.from('ride_requests').insert({
        ride_id:        ride.id,
        rider_id:       MOCK_USER_ID,
        pickup_lat:     0,
        pickup_lng:     0,
        pickup_address: pickup.trim(),
        status:         'pending',
        fare_share:     ride.estimated_fare,
      });

      if (error) throw error;

      setConfirmRide(null);
      Alert.alert('Request sent! 🎉',
        `Sent to ${ride.driver_name}. You'll be notified once confirmed.`);
      fetchRides(false);
    } catch (err: any) {
      Alert.alert('Failed', err?.message ?? 'Could not send request.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Filter ───────────────────────────────────────────────────────────────────
  const filtered = rides.filter(ride => {
    if (destination.trim().length > 1) {
      const q = destination.toLowerCase();
      if (!ride.dropoff_address.toLowerCase().includes(q) &&
          !ride.pickup_address.toLowerCase().includes(q)) return false;
    }
    const h = new Date(ride.departure_time).getHours();
    if (timeFilter === 'morning'   && (h < 5  || h >= 12)) return false;
    if (timeFilter === 'afternoon' && (h < 12 || h >= 17)) return false;
    if (timeFilter === 'evening'   && (h < 17 || h >= 23)) return false;
    if (seatsFilter && ride.seats_available < 2) return false;
    return true;
  });

  const count = filtered.filter(r => r.seats_available > 0).length;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={s.screen}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchRides(); }}
              colors={['#1A73E8']} tintColor="#1A73E8" />
          }
        >
          {/* ── Topbar ── */}
          <View style={s.topbar}>
            <View style={s.topRow}>
              <View>
                <Text style={s.topTitle}>🔍 Find a ride</Text>
                <Text style={s.topSub}>Search community carpools</Text>
              </View>
              <View style={s.notif}><Text style={{ fontSize: 16 }}>🔔</Text></View>
            </View>

            {/* Search card */}
            <View style={s.card}>
              {/* Dotted connector line between the two dots */}
              <View style={s.connector} />

              <LocationInput
                label="FROM"
                value={pickup}
                onChange={setPickup}
                placeholder="Enter pickup location"
                dotColor="#1A73E8"
                dotFilled={false}
              />

              <TouchableOpacity
                style={s.swapBtn}
                onPress={() => { const t = pickup; setPickup(destination); setDest(t); }}
                activeOpacity={0.75}
              >
                <Text style={{ fontSize: 16, color: '#1A73E8' }}>⇅</Text>
              </TouchableOpacity>

              <View style={s.divider} />

              <LocationInput
                label="TO"
                value={destination}
                onChange={setDest}
                placeholder="Enter destination"
                dotColor="#EA4335"
                dotFilled
              />

              <View style={s.dtRow}>
                <View style={[s.dtChip, s.dtActive]}>
                  <Text style={s.dtIcon}>📅</Text>
                  <View>
                    <Text style={s.dtMain}>Today</Text>
                    <Text style={s.dtSub}>
                      {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' })}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[s.dtChip, timeFilter !== 'all' && s.dtActive]}
                  onPress={() => setTimeFilter(f => f === 'all' ? 'morning' : 'all')}
                  activeOpacity={0.75}
                >
                  <Text style={s.dtIcon}>🕐</Text>
                  <View>
                    <Text style={[s.dtMain, timeFilter === 'all' && { color: '#8899BB' }]}>
                      {timeFilter === 'all' ? 'Any time'
                        : timeFilter.charAt(0).toUpperCase() + timeFilter.slice(1)}
                    </Text>
                    <Text style={s.dtSub}>Tap to filter</Text>
                  </View>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={s.searchBtn} onPress={() => fetchRides()} activeOpacity={0.85}>
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Text style={{ fontSize: 14 }}>🔍</Text><Text style={s.searchBtnTxt}>Search rides</Text></>
                }
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Body ── */}
          <View style={s.body}>
            {/* Filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 14 }}
              contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
              {(['all','morning','afternoon','evening'] as TimeFilter[]).map(f => (
                <TouchableOpacity key={f} style={[s.chip, timeFilter === f && s.chipOn]}
                  onPress={() => setTimeFilter(f)} activeOpacity={0.75}>
                  <Text style={[s.chipTxt, timeFilter === f && s.chipTxtOn]}>
                    {f === 'all' ? 'All times'
                    : f === 'morning' ? '🌅 Morning'
                    : f === 'afternoon' ? '☀️ Afternoon' : '🌆 Evening'}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[s.chip, seatsFilter && s.chipOn]}
                onPress={() => setSeatsFilter(v => !v)} activeOpacity={0.75}>
                <Text style={[s.chipTxt, seatsFilter && s.chipTxtOn]}>Seats 2+</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Results header */}
            {searched && !loading && (
              <View style={s.resHdr}>
                <Text style={s.resTitle}>Available carpools</Text>
                <View style={s.countPill}>
                  <Text style={s.countTxt}>{count} ride{count !== 1 ? 's' : ''}</Text>
                </View>
              </View>
            )}

            {/* Loader */}
            {loading && (
              <View style={s.loader}>
                <ActivityIndicator size="large" color="#1A73E8" />
                <Text style={s.loaderTxt}>Finding rides in your community…</Text>
              </View>
            )}

            {/* Empty */}
            {!loading && searched && filtered.length === 0 && (
              <View style={s.empty}>
                <Text style={s.emptyIcon}>🚗</Text>
                <Text style={s.emptyTitle}>No rides found</Text>
                <Text style={s.emptySub}>
                  {destination.trim()
                    ? `No rides to "${destination}" right now.\n`
                    : 'No upcoming rides in your community.\n'}
                  Try a different time or pull to refresh.
                </Text>
                <TouchableOpacity style={s.emptyBtn}
                  onPress={() => { setDest(''); setTimeFilter('all'); fetchRides(); }}>
                  <Text style={s.emptyBtnTxt}>Show all rides</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Cards */}
            {!loading && filtered.map((ride, i) => (
              <RideCard
                key={ride.id}
                ride={ride}
                index={i}
                onRequest={r => setConfirmRide(r)}
                onInfo={r => Alert.alert(
                  `${r.driver_name}'s ride`,
                  `Vehicle: ${[r.vehicle_make, r.vehicle_model].filter(Boolean).join(' ') || '—'}\nColour: ${r.vehicle_color || '—'}\nPlate: ${r.vehicle_number}\nScore: ${r.driver_score}/100\nSeats: ${r.seats_available}/${r.seats_total}${r.women_only ? '\n🚺 Women-only ride' : ''}`,
                  [{ text: 'OK' }]
                )}
              />
            ))}
            <View style={{ height: 32 }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmModal
        ride={confirmRide}
        pickup={pickup}
        onClose={() => setConfirmRide(null)}
        onConfirm={submitRequest}
        submitting={submitting}
      />
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: '#F0F4FF' },
  topbar:      { backgroundColor: '#1A1A2E', paddingBottom: 20, paddingTop: Platform.OS === 'ios' ? 54 : 36 },
  topRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, marginBottom: 16 },
  topTitle:    { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  topSub:      { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  notif:       { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },

  card:        { backgroundColor: '#fff', borderRadius: 20, marginHorizontal: 16, padding: 14, elevation: 8, shadowColor: '#1A1A2E', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, position: 'relative' },
  connector:   { position: 'absolute', left: 27, top: 56, height: 32, width: 2, backgroundColor: '#E0E8F8', zIndex: 0 },
  swapBtn:     { alignSelf: 'flex-end', width: 32, height: 32, borderRadius: 16, backgroundColor: '#F0F4FF', borderWidth: 1.5, borderColor: '#D8E2F8', justifyContent: 'center', alignItems: 'center', marginRight: 2, marginVertical: 2 },
  divider:     { height: 1, backgroundColor: '#F2F4F8', marginVertical: 2 },

  dtRow:       { flexDirection: 'row', gap: 8, marginTop: 12 },
  dtChip:      { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#F5F8FF', borderRadius: 12, padding: 9, borderWidth: 1.5, borderColor: 'transparent' },
  dtActive:    { borderColor: '#1A73E8', backgroundColor: '#EBF2FF' },
  dtIcon:      { fontSize: 14 },
  dtMain:      { fontSize: 12, fontWeight: '700', color: '#1A1A2E' },
  dtSub:       { fontSize: 10, color: '#8899BB', marginTop: 1 },

  searchBtn:   { backgroundColor: '#1A73E8', borderRadius: 14, padding: 13, marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  searchBtnTxt:{ fontSize: 14, fontWeight: '700', color: '#fff' },

  body:        { padding: 16, paddingTop: 14 },
  chip:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#DDE5F5' },
  chipOn:      { backgroundColor: '#1A73E8', borderColor: '#1A73E8' },
  chipTxt:     { fontSize: 12, fontWeight: '600', color: '#556' },
  chipTxtOn:   { color: '#fff' },

  resHdr:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  resTitle:    { fontSize: 13, fontWeight: '700', color: '#1A1A2E' },
  countPill:   { backgroundColor: '#EBF2FF', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 },
  countTxt:    { fontSize: 12, fontWeight: '700', color: '#1A73E8' },

  loader:      { alignItems: 'center', paddingVertical: 40 },
  loaderTxt:   { fontSize: 13, color: '#889', marginTop: 12 },

  empty:       { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 24 },
  emptyIcon:   { fontSize: 48, marginBottom: 14 },
  emptyTitle:  { fontSize: 17, fontWeight: 'bold', color: '#1A1A2E', marginBottom: 8 },
  emptySub:    { fontSize: 13, color: '#889', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  emptyBtn:    { backgroundColor: '#1A73E8', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 24 },
  emptyBtnTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },
});

const li = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8 },
  dot:      { width: 11, height: 11, borderRadius: 6, borderWidth: 2.5, marginTop: 4, marginRight: 10, flexShrink: 0 },
  lbl:      { fontSize: 9, fontWeight: '700', color: '#AABDE0', letterSpacing: 0.8, marginBottom: 3 },
  input:    { fontSize: 14, fontWeight: '600', color: '#1A1A2E', padding: 0, flex: 1 },
  clear:    { paddingHorizontal: 6, paddingVertical: 4, marginTop: 12 },
  clearTxt: { fontSize: 12, color: '#BCC8DE' },
  dropdown: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#EEF2FB', marginTop: 4, marginBottom: 4, overflow: 'hidden', elevation: 8, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },
  item:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderBottomWidth: 0.5, borderBottomColor: '#F2F4F8' },
  itemIcon: { fontSize: 13, marginTop: 1 },
  itemTxt:  { fontSize: 13, color: '#1A1A2E', flex: 1, lineHeight: 18 },
});

const rc = StyleSheet.create({
  card:     { backgroundColor: '#fff', borderRadius: 20, marginBottom: 10, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  cardFull: { opacity: 0.5 },
  top:      { flexDirection: 'row', alignItems: 'flex-start', padding: 14, paddingBottom: 12 },
  av:       { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 10, position: 'relative', flexShrink: 0 },
  avTxt:    { fontSize: 14, fontWeight: '700' },
  ring:     { position: 'absolute', top: -2.5, left: -2.5, right: -2.5, bottom: -2.5, borderRadius: 24, borderWidth: 2 },
  name:     { fontSize: 15, fontWeight: '700', color: '#1A1A2E' },
  badges:   { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, flexWrap: 'wrap' },
  tBadge:   { backgroundColor: '#1A1A2E', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 },
  tTxt:     { fontSize: 9, fontWeight: '700', color: '#fff' },
  sBadge:   { backgroundColor: '#E6F4EA', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 },
  sTxt:     { fontSize: 10, fontWeight: '700', color: '#27500A' },
  vBadge:   { backgroundColor: '#F5F7FF', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 },
  vTxt:     { fontSize: 10, color: '#445' },
  wBadge:   { backgroundColor: '#FCE8F3', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 },
  wTxt:     { fontSize: 10, color: '#7B1FA2' },
  route:    { backgroundColor: '#F8FAFF', marginHorizontal: 14, borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  rFrom:    { fontSize: 12, fontWeight: '600', color: '#1A1A2E', flex: 1 },
  rArrow:   { fontSize: 11, color: '#AABDE0', flexShrink: 0 },
  rTo:      { fontSize: 12, fontWeight: '600', color: '#1A1A2E', flex: 1, textAlign: 'right' },
  stats:    { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#F2F4F8', marginTop: 12 },
  stat:     { flex: 1, paddingVertical: 10, alignItems: 'center', borderRightWidth: 1, borderRightColor: '#F2F4F8' },
  statVal:  { fontSize: 12, fontWeight: '700', color: '#1A1A2E', textAlign: 'center' },
  statLbl:  { fontSize: 9, color: '#AABDE0', marginTop: 3, letterSpacing: 0.4, fontWeight: '600' },
  actions:  { padding: 12, paddingTop: 10, flexDirection: 'row', gap: 8, alignItems: 'center' },
  reqBtn:   { flex: 1, backgroundColor: '#1A73E8', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnAmber: { backgroundColor: '#E37400' },
  btnGreen: { backgroundColor: '#1A8C3C' },
  btnGray:  { backgroundColor: '#999' },
  reqTxt:   { fontSize: 13, fontWeight: '700', color: '#fff' },
  infoBtn:  { width: 42, height: 42, borderRadius: 12, backgroundColor: '#F0F4FF', borderWidth: 1.5, borderColor: '#DDE5F5', justifyContent: 'center', alignItems: 'center' },
  fullPill: { flex: 1, backgroundColor: '#FCE8E6', borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  fullTxt:  { fontSize: 12, fontWeight: '600', color: '#7F1D1D' },
});

const cm = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, height: '92%' },
  handle:     { width: 40, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  scroll:     { paddingHorizontal: 20 },
  title:      { fontSize: 20, fontWeight: 'bold', color: '#1A1A2E', paddingTop: 14, marginBottom: 18 },
  driverRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  av:         { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  avTxt:      { fontSize: 15, fontWeight: '700' },
  ring:       { position: 'absolute', top: -3, left: -3, right: -3, bottom: -3, borderRadius: 26, borderWidth: 2 },
  driverName: { fontSize: 16, fontWeight: '700', color: '#1A1A2E' },
  badgeRow:   { flexDirection: 'row', gap: 6, marginTop: 4 },
  tBadge:     { backgroundColor: '#1A1A2E', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  tBadgeTxt:  { fontSize: 10, fontWeight: '700', color: '#fff' },
  sBadge:     { backgroundColor: '#E6F4EA', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  sBadgeTxt:  { fontSize: 11, fontWeight: '700', color: '#27500A' },
  infoCard:   { backgroundColor: '#F8FAFF', borderRadius: 14, marginBottom: 14 },
  infoRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: '#EEF2FB' },
  infoLbl:    { fontSize: 12, color: '#889' },
  infoVal:    { fontSize: 13, fontWeight: '600', color: '#1A1A2E', flex: 1, textAlign: 'right' },
  plate:      { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', backgroundColor: '#F0F4FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  routeCard:  { backgroundColor: '#F8FAFF', borderRadius: 14, padding: 16, marginBottom: 14, position: 'relative' },
  rdFrom:     { position: 'absolute', left: 18, top: 18, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: '#1A73E8', backgroundColor: '#fff' },
  rLine:      { position: 'absolute', left: 22, top: 28, bottom: 28, width: 2, backgroundColor: '#E0E8F8' },
  rdTo:       { position: 'absolute', left: 18, bottom: 18, width: 10, height: 10, borderRadius: 5, backgroundColor: '#EA4335' },
  rFrom:      { fontSize: 13, fontWeight: '600', color: '#1A1A2E' },
  rTo:        { fontSize: 13, fontWeight: '600', color: '#1A1A2E' },
  fareCard:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EBF2FF', borderRadius: 14, padding: 14, marginBottom: 14, gap: 12 },
  fareLbl:    { fontSize: 13, fontWeight: '600', color: '#1A1A2E' },
  fareSub:    { fontSize: 11, color: '#6690CC', marginTop: 3 },
  fareAmt:    { fontSize: 26, fontWeight: 'bold', color: '#1A73E8' },
  womenBanner:{ flexDirection: 'row', gap: 10, backgroundColor: '#FCE8F3', borderRadius: 12, padding: 12, marginBottom: 14 },
  childBanner:{ flexDirection: 'row', gap: 10, backgroundColor: '#FEF0E0', borderRadius: 12, padding: 12, marginBottom: 14 },
  bannerIcon: { fontSize: 22, marginTop: 1 },
  bannerTitle:{ fontSize: 13, fontWeight: '700', marginBottom: 4 },
  bannerSub:  { fontSize: 12, lineHeight: 17 },
  note:       { fontSize: 12, color: '#999', lineHeight: 18, marginBottom: 20, textAlign: 'center' },
  btnRow:     { flexDirection: 'row', gap: 12 },
  btnCancel:  { flex: 1, backgroundColor: '#F0F4FF', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnCancelTxt:  { fontSize: 14, fontWeight: '700', color: '#556' },
  btnConfirm:    { flex: 2, backgroundColor: '#1A73E8', borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  btnConfirmTxt: { fontSize: 14, fontWeight: '700', color: '#fff' },
});