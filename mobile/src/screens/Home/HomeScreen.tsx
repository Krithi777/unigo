/**
 * HomeScreen.tsx — UniGo
 * Place at: src/screens/Home/HomeScreen.tsx
 *
 * Matches wireframe screen 4 (Daily commute flow — rider, Home + Daily Pulse)
 * ─────────────────────────────────────────────────────────────────────────────
 * Layout (top → bottom):
 *   • Status bar / safe area
 *   • Top bar  : "Good morning, {name}" + location + avatar
 *   • Daily Pulse card: "Are you commuting today?" Yes / Not today
 *   • Quick actions grid: Find a ride | Offer a ride
 *   • Stats row: Rides shared | CO₂ saved | ₹ saved
 *   • Upcoming ride card (if any)
 *   • Scroll area ends
 *
 * Wireframe colour palette:
 *   brand    #7F77DD / #534AB7 / #3C3489
 *   green    #1D9E75
 *   amber    #EF9F27
 *   red      #E24B4A
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/services/supabaseClient';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  brand:       '#7F77DD',
  brandMid:    '#534AB7',
  brandDark:   '#3C3489',
  brandLight:  '#F9F7FF',
  brandBorder: '#AFA9EC',
  green:       '#1D9E75',
  greenLight:  '#E6F7F0',
  greenBorder: '#9FE1CB',
  greenDark:   '#085041',
  amber:       '#EF9F27',
  amberLight:  '#FAEEDA',
  red:         '#E24B4A',
  pink:        '#D45379',
  bg:          '#F5F6FA',
  surface:     '#FFFFFF',
  border:      '#E5E7EB',
  borderLight: '#F0F0F0',
  text:        '#111111',
  textSub:     '#555555',
  textMuted:   '#888888',
};

type PulseAnswer = 'yes' | 'no' | null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function initials(name: string): string {
  return (name ?? 'U')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const navigation = useNavigation<any>();

  const [user, setUser]               = useState<any>(null);
  const [impact, setImpact]           = useState<any>(null);
  const [upcomingRide, setUpcomingRide] = useState<any>(null);
  const [pulseAnswer, setPulseAnswer] = useState<PulseAnswer>(null);
  const [pulseAlreadySet, setPulseAlreadySet] = useState(false);
  const [pulseSubmitting, setPulseSubmitting] = useState(false);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);

  // ── fetch data ──────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const userId      = await AsyncStorage.getItem('user_id');
      const communityId = await AsyncStorage.getItem('community_id');
      if (!userId) { setLoading(false); return; }

      // User profile
      const { data: userData } = await supabase
        .from('users').select('*').eq('id', userId).single();
      setUser(userData);

      // Daily pulse — already submitted today?
      const today = new Date().toISOString().split('T')[0];
      const { data: pulseData } = await supabase
        .from('daily_pulse')
        .select('commuting')
        .eq('user_id', userId)
        .eq('date', today)
        .maybeSingle();
      if (pulseData) {
        setPulseAlreadySet(true);
        setPulseAnswer(pulseData.commuting ? 'yes' : 'no');
      }

      // Impact summary
      const { data: impactData } = await supabase
        .from('impact_summary').select('*').eq('user_id', userId).maybeSingle();
      setImpact(impactData);

      // Upcoming ride request
      if (communityId) {
        const { data: requests } = await supabase
          .from('ride_requests')
          .select(`
            *,
            rides(
              *,
              users!rides_driver_id_fkey(name, reliability_score),
              driver_profiles(vehicle_make, vehicle_model, vehicle_number)
            )
          `)
          .eq('rider_id', userId)
          .in('status', ['pending', 'confirmed'])
          .order('created_at', { ascending: false })
          .limit(1);
        if (requests && requests.length > 0) {
          setUpcomingRide(requests[0]);
        }
      }
    } catch (e) {
      console.warn('[HomeScreen] fetchData error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  // ── pulse submit ─────────────────────────────────────────────────────────────
  async function submitPulse(answer: 'yes' | 'no') {
    if (pulseAlreadySet || pulseSubmitting) return;
    setPulseAnswer(answer);
    setPulseSubmitting(true);
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (userId) {
        const today = new Date().toISOString().split('T')[0];
        await supabase.from('daily_pulse').upsert(
          { user_id: userId, date: today, commuting: answer === 'yes' },
          { onConflict: 'user_id,date' },
        );
        setPulseAlreadySet(true);
      }
      if (answer === 'yes') {
        navigation.navigate('FindRide');
      }
    } catch (e) {
      console.warn('[Pulse] submit error', e);
    } finally {
      setPulseSubmitting(false);
    }
  }

  // ── render helpers ───────────────────────────────────────────────────────────
  const userName   = user?.name ?? 'there';
  const ridesShared = impact?.total_rides        ?? 0;
  const co2Saved   = impact?.total_co2_kg        ?? 0;
  const moneySaved = impact?.total_savings_inr   ?? 0;

  const now      = new Date();
  const timeStr  = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const locLabel = user?.community_name ?? 'Your community';

  if (loading) {
    return (
      <SafeAreaView style={styles.centerFlex}>
        <ActivityIndicator size="large" color={C.brand} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.surface} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── Top bar ──────────────────────────────────────────────────────── */}
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            <Text style={styles.greeting}>{getGreeting()}, {userName.split(' ')[0]}</Text>
            <Text style={styles.greetingSub}>📍 {locLabel} · {timeStr}</Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(userName)}</Text>
          </View>
        </View>

        {/* ── Daily Pulse card ─────────────────────────────────────────────── */}
        {pulseAlreadySet ? (
          <View style={styles.pulseCard}>
            <Text style={styles.pulseAnswered}>
              {pulseAnswer === 'yes'
                ? '✅ You\'re commuting today! Check the rides below.'
                : '😴 Not commuting today. See you tomorrow!'}
            </Text>
          </View>
        ) : (
          <View style={styles.pulseCard}>
            <Text style={styles.pulseQ}>Are you commuting today?</Text>
            <View style={styles.pulseBtns}>
              <TouchableOpacity
                style={styles.pulseYes}
                onPress={() => submitPulse('yes')}
                disabled={pulseSubmitting}
                activeOpacity={0.8}
              >
                {pulseSubmitting && pulseAnswer === 'yes'
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.pulseYesTxt}>Yes, I am</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.pulseNo}
                onPress={() => submitPulse('no')}
                disabled={pulseSubmitting}
                activeOpacity={0.8}
              >
                <Text style={styles.pulseNoTxt}>Not today</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Section: Quick actions ─────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Quick actions</Text>
        <View style={styles.quickGrid}>
          <TouchableOpacity
            style={[styles.quickCard, styles.quickCardBrand]}
            onPress={() => navigation.navigate('FindRide')}
            activeOpacity={0.85}
          >
            <Text style={styles.quickIcon}>🔍</Text>
            <Text style={styles.quickTitle}>Find a ride</Text>
            <Text style={styles.quickSub}>See who's going your way</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickCard, styles.quickCardGreen]}
            onPress={() => navigation.navigate('CreateRide')}
            activeOpacity={0.85}
          >
            <Text style={styles.quickIcon}>🚗</Text>
            <Text style={styles.quickTitle}>Offer a ride</Text>
            <Text style={styles.quickSub}>Pick up community members</Text>
          </TouchableOpacity>
        </View>

        {/* ── Stats row ────────────────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: C.brandMid }]}>{ridesShared}</Text>
            <Text style={styles.statLab}>Rides shared</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: C.green }]}>
              {co2Saved.toFixed(1)} kg
            </Text>
            <Text style={styles.statLab}>CO₂ saved</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: C.text }]}>
              ₹{moneySaved.toLocaleString('en-IN')}
            </Text>
            <Text style={styles.statLab}>Saved</Text>
          </View>
        </View>

        {/* ── Upcoming ride card ────────────────────────────────────────────── */}
        {upcomingRide?.rides && (
          <>
            <Text style={styles.sectionTitle}>Your upcoming ride</Text>
            <TouchableOpacity
              style={styles.upcomingCard}
              onPress={() =>
                navigation.navigate('RiderActiveRide', {
                  rideId: upcomingRide.ride_id,
                })
              }
              activeOpacity={0.85}
            >
              <View style={styles.upRow}>
                <View style={styles.upDriver}>
                  <View style={styles.upAvatar}>
                    <Text style={styles.upAvatarTxt}>
                      {initials(upcomingRide.rides.users?.name ?? 'D')}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.upName}>
                      {upcomingRide.rides.users?.name ?? 'Driver'}
                    </Text>
                    <Text style={styles.upMeta}>
                      ★ {upcomingRide.rides.users?.reliability_score ?? '—'}% reliability
                    </Text>
                  </View>
                </View>
                <View style={styles.upStatusBadge}>
                  <Text style={styles.upStatusTxt}>
                    {upcomingRide.status === 'confirmed' ? 'Confirmed' : 'Pending'}
                  </Text>
                </View>
              </View>

              <View style={styles.upRoute}>
                <View style={styles.routeDotGreen} />
                <Text style={styles.upAddr} numberOfLines={1}>
                  {upcomingRide.rides.origin_address ?? 'Pickup'}
                </Text>
              </View>
              <View style={[styles.upRoute, { marginTop: 4 }]}>
                <View style={styles.routeDotRed} />
                <Text style={styles.upAddr} numberOfLines={1}>
                  {upcomingRide.rides.destination_address ?? 'Destination'}
                </Text>
              </View>

              <View style={styles.upMeta2}>
                <Text style={styles.upMetaChip}>
                  🕐 {upcomingRide.rides.departure_time
                    ? new Date(upcomingRide.rides.departure_time).toLocaleTimeString('en-IN', {
                        hour: '2-digit', minute: '2-digit',
                      })
                    : '—'}
                </Text>
                {upcomingRide.rides.women_only && (
                  <Text style={styles.womenChip}>🚺 Women only</Text>
                )}
              </View>

              <View style={styles.trackBtn}>
                <Text style={styles.trackBtnTxt}>Track live →</Text>
              </View>
            </TouchableOpacity>
          </>
        )}

        {/* ── Guaranteed Backup Match info banner ───────────────────────────── */}
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerIcon}>🛡️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoBannerTitle}>Guaranteed Backup Match</Text>
            <Text style={styles.infoBannerSub}>
              If your driver cancels, UniGo instantly finds you the next best match —
              no stranded rides.
            </Text>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  centerFlex: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: C.borderLight,
    backgroundColor: C.surface,
  },
  topBarLeft: { flex: 1 },
  greeting: { fontSize: 15, fontWeight: '600', color: C.text },
  greetingSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  // Daily Pulse
  pulseCard: {
    margin: 12,
    backgroundColor: C.brandLight,
    borderWidth: 1,
    borderColor: C.brandBorder,
    borderRadius: 14,
    padding: 14,
  },
  pulseQ: { fontSize: 13, fontWeight: '600', color: C.brandDark, marginBottom: 10 },
  pulseBtns: { flexDirection: 'row', gap: 8 },
  pulseYes: {
    flex: 1,
    backgroundColor: C.brand,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  pulseYesTxt: { color: '#fff', fontWeight: '600', fontSize: 13 },
  pulseNo: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.brandBorder,
  },
  pulseNoTxt: { color: C.brandMid, fontWeight: '600', fontSize: 13 },
  pulseAnswered: { fontSize: 13, color: C.brandMid, fontWeight: '500', textAlign: 'center' },

  // Section title
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text,
    marginTop: 8,
    marginBottom: 6,
    paddingHorizontal: 16,
  },

  // Quick actions
  quickGrid: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 8,
  },
  quickCard: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    borderWidth: 0.5,
  },
  quickCardBrand: {
    backgroundColor: C.brandLight,
    borderColor: C.brandBorder,
  },
  quickCardGreen: {
    backgroundColor: C.greenLight,
    borderColor: C.greenBorder,
  },
  quickIcon: { fontSize: 22, marginBottom: 6 },
  quickTitle: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 2 },
  quickSub: { fontSize: 11, color: C.textMuted },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#F4F4F8',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statNum: { fontSize: 16, fontWeight: '700' },
  statLab: { fontSize: 10, color: C.textMuted, marginTop: 2, textAlign: 'center' },

  // Upcoming ride card
  upcomingCard: {
    marginHorizontal: 12,
    marginBottom: 10,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.brand,
    padding: 14,
  },
  upRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  upDriver: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  upAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.brandBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  upAvatarTxt: { color: C.brandDark, fontWeight: '700', fontSize: 11 },
  upName: { fontSize: 13, fontWeight: '600', color: C.text },
  upMeta: { fontSize: 11, color: C.textMuted, marginTop: 1 },
  upStatusBadge: {
    backgroundColor: C.greenLight,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  upStatusTxt: { color: C.green, fontSize: 11, fontWeight: '600' },
  upRoute: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  routeDotGreen: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green },
  routeDotRed:   { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D85A30' },
  upAddr: { fontSize: 12, color: C.textSub, flex: 1 },
  upMeta2: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  upMetaChip: { fontSize: 11, color: C.textSub },
  womenChip: {
    fontSize: 11,
    color: '#993556',
    backgroundColor: '#FBEAF0',
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontWeight: '600',
  },
  trackBtn: {
    marginTop: 10,
    backgroundColor: C.brand,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  trackBtnTxt: { color: '#fff', fontWeight: '600', fontSize: 13 },

  // Info banner
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 12,
    marginTop: 6,
    backgroundColor: C.amberLight,
    borderWidth: 0.5,
    borderColor: '#FAC775',
    borderRadius: 12,
    padding: 12,
  },
  infoBannerIcon: { fontSize: 20, marginTop: 1 },
  infoBannerTitle: { fontSize: 12, fontWeight: '700', color: '#633806', marginBottom: 2 },
  infoBannerSub: { fontSize: 11, color: '#854F0B', lineHeight: 16 },
});