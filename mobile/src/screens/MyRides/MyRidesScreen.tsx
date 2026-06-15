import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  ActivityIndicator, TouchableOpacity, RefreshControl,
  Modal, SafeAreaView, Animated, Easing,
} from 'react-native';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
);

const MONTHLY_GOAL  = 15;
const CO2_PER_RIDE  = 0.8;
const FUEL_PER_KG   = 0.43;

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT: Replace this with the real logged-in user's UUID.
// When Krithika's auth (Firebase) is wired up, pass userId as a prop instead.
// Example: <RidesScreen userId={firebaseUser.uid_mapped_to_supabase} />
// For now, each person can paste their own UUID here for testing.
// ─────────────────────────────────────────────────────────────────────────────
const CURRENT_USER_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

// ── Types ─────────────────────────────────────────────────────────────────────
interface RidesScreenProps {
  userId?: string; // pass real user id when auth is ready
}

interface ActiveRide {
  ride_id: string;
  driver_name: string;
  driver_score: number;
  vehicle_number: string;
  vehicle_make: string;
  pickup_address: string;
  dropoff_address: string;
  fare_share: number;
  departure_time: string;
}

interface RideHistoryItem {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  departure_time: string;
  status: string;
  fare_paid: number | null;
  driver_name: string;
}

interface MonthStats {
  ridesThisMonth: number;
  savedThisMonth: number;
}

interface AllTimeStats {
  totalRides: number;
  totalSaved: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const today     = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const t = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (d.toDateString() === today.toDateString())     return `Today, ${t}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${t}`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + `, ${t}`;
}

function getETA(departureTime: string) {
  const diff = Math.max(0, Math.round((new Date(departureTime).getTime() - Date.now()) / 60000));
  return diff <= 0 ? 'Arriving' : `${diff} min`;
}

function getCO2(rides: number) {
  return Math.round(rides * CO2_PER_RIDE * 10) / 10;
}

function getReliabilityImpact(status: string) {
  if (status === 'completed') return { text: '+0 pts',  good: true  };
  if (status === 'no_show')   return { text: '−15 pts', good: false };
  if (status === 'cancelled') return { text: '−10 pts', good: false };
  return { text: '—', good: true };
}

function getStatusTag(status: string): { label: string; style: 'green' | 'red' | 'amber' | 'blue' } {
  if (status === 'completed') return { label: 'Completed ✓', style: 'green' };
  if (status === 'no_show')   return { label: 'No show ✗',   style: 'red'   };
  if (status === 'cancelled') return { label: 'Cancelled ✗', style: 'red'   };
  if (status === 'accepted')  return { label: 'Accepted',    style: 'blue'  };
  return { label: status, style: 'amber' };
}

// ── Animated counter ──────────────────────────────────────────────────────────
function useCounter(target: number, duration: number, start: boolean) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number | null = null;
    let raf: number;
    const tick = (now: number) => {
      if (!startTime) startTime = now;
      const p = Math.min(1, (now - startTime) / duration);
      setVal(p * target);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, target, duration]);
  return val;
}

// ── Tree component ────────────────────────────────────────────────────────────
const TREE_CONFIGS = [
  { h: 48, color: '#2E7D32' }, { h: 60, color: '#388E3C' },
  { h: 40, color: '#1B5E20' }, { h: 56, color: '#43A047' },
  { h: 64, color: '#2E7D32' }, { h: 44, color: '#33691E' },
  { h: 52, color: '#388E3C' }, { h: 36, color: '#1B5E20' },
  { h: 68, color: '#43A047' }, { h: 48, color: '#2E7D32' },
  { h: 58, color: '#33691E' }, { h: 42, color: '#388E3C' },
  { h: 50, color: '#1B5E20' }, { h: 62, color: '#43A047' },
  { h: 46, color: '#2E7D32' },
];

function AnimatedTree({ height, color, delay }: { height: number; color: string; delay: number }) {
  const scaleY  = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(scaleY,  { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const trunkH  = Math.round(height * 0.28);
  const canopyH = height - trunkH;
  const canopyW = Math.round(height * 0.78);

  return (
    <Animated.View style={{ alignItems: 'center', opacity, transform: [{ scaleY }] }}>
      <View style={{ width: 0, height: 0,
        borderLeftWidth: canopyW * 0.38, borderRightWidth: canopyW * 0.38,
        borderBottomWidth: canopyH * 0.55,
        borderLeftColor: 'transparent', borderRightColor: 'transparent',
        borderBottomColor: color, marginBottom: -3 }} />
      <View style={{ width: 0, height: 0,
        borderLeftWidth: canopyW / 2, borderRightWidth: canopyW / 2,
        borderBottomWidth: canopyH * 0.6,
        borderLeftColor: 'transparent', borderRightColor: 'transparent',
        borderBottomColor: color + 'CC' }} />
      <View style={{ width: 6, height: trunkH, backgroundColor: '#5D4037', borderRadius: 2 }} />
    </Animated.View>
  );
}

// ── Impact Modal ──────────────────────────────────────────────────────────────
function ImpactModal({ visible, onClose, totalRides, totalSaved }: {
  visible: boolean; onClose: () => void; totalRides: number; totalSaved: number;
}) {
  const [animStart, setAnimStart] = useState(false);
  const slideAnim = useRef(new Animated.Value(600)).current;
  const barAnim   = useRef(new Animated.Value(0)).current;

  const co2Total     = getCO2(totalRides);
  const fuelL        = Math.round(co2Total * FUEL_PER_KG * 10) / 10;
  const phoneCharges = Math.round(co2Total * 82);
  const ledHours     = Math.round(co2Total * 10);
  const kmOffset     = Math.round(co2Total * 4.5);
  const treesPlanted = Math.min(totalRides, 15);

  const co2Val   = useCounter(co2Total,      1200, animStart);
  const fuelVal  = useCounter(fuelL,         1400, animStart);
  const phoneVal = useCounter(phoneCharges,  1200, animStart);
  const ledVal   = useCounter(ledHours,      1200, animStart);
  const kmVal    = useCounter(kmOffset,      1200, animStart);

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }).start();
      setTimeout(() => setAnimStart(true), 300);
      Animated.timing(barAnim, {
        toValue: Math.min(1, fuelL / 10), duration: 1400,
        easing: Easing.out(Easing.cubic), useNativeDriver: false, delay: 400,
      }).start();
    } else {
      slideAnim.setValue(600); barAnim.setValue(0); setAnimStart(false);
    }
  }, [visible]);

  const barWidth = barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
      <View style={imp.overlay}>
        <Animated.View style={[imp.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <SafeAreaView style={{ flex: 1, overflow: 'hidden' }}>
            <View style={imp.handle} />
            <ScrollView style={imp.scroll} showsVerticalScrollIndicator={false}>
              <View style={imp.hdr}>
                <View>
                  <Text style={imp.hdrTitle}>🌍 Your impact</Text>
                  <Text style={imp.hdrSub}>{totalRides} rides · all time</Text>
                </View>
                <TouchableOpacity style={imp.closeBtn} onPress={onClose}>
                  <Text style={imp.closeTxt}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={imp.forestCard}>
                <Text style={imp.forestLabel}>YOUR FOREST — 1 RIDE = 1 TREE</Text>
                <View style={imp.forestRow}>
                  {Array.from({ length: treesPlanted }).map((_, i) => {
                    const cfg = TREE_CONFIGS[i % TREE_CONFIGS.length];
                    return <AnimatedTree key={i} height={cfg.h} color={cfg.color} delay={i * 90} />;
                  })}
                </View>
                <View style={imp.ground} />
                <Text style={imp.forestCaption}>{treesPlanted} trees growing 🌱 keep riding to grow your forest</Text>
              </View>

              <View style={imp.statsRow}>
                <View style={imp.statBox}>
                  <Text style={[imp.statNum, { color: '#34A853' }]}>{co2Val.toFixed(1)} kg</Text>
                  <Text style={imp.statLbl}>CO₂ saved</Text>
                  <Text style={imp.statHint}>vs solo cab</Text>
                </View>
                <View style={imp.statBox}>
                  <Text style={imp.statNum}>{totalRides}</Text>
                  <Text style={imp.statLbl}>Total rides</Text>
                  <Text style={imp.statHint}>shared trips</Text>
                </View>
              </View>

              <View style={imp.fuelCard}>
                <View style={imp.fuelTop}>
                  <Text style={imp.fuelTitle}>⛽ Petrol saved</Text>
                  <Text style={imp.fuelNum}>{fuelVal.toFixed(1)} L</Text>
                </View>
                <View style={imp.barBg}>
                  <Animated.View style={[imp.barFill, { width: barWidth }]} />
                </View>
                <Text style={imp.fuelSub}>equivalent to {fuelVal.toFixed(1)} litres of petrol not burned</Text>
              </View>

              <Text style={imp.eqTitle}>THAT'S EQUIVALENT TO...</Text>
              <View style={imp.eqGrid}>
                <View style={imp.eqBox}><Text style={imp.eqIcon}>📱</Text><Text style={imp.eqNum}>{Math.round(phoneVal)}x</Text><Text style={imp.eqLbl}>phone charges</Text></View>
                <View style={imp.eqBox}><Text style={imp.eqIcon}>💡</Text><Text style={imp.eqNum}>{Math.round(ledVal)} hrs</Text><Text style={imp.eqLbl}>LED bulb powered</Text></View>
                <View style={imp.eqBox}><Text style={imp.eqIcon}>🚗</Text><Text style={[imp.eqNum, { color: '#FBBC04' }]}>{Math.round(kmVal)} km</Text><Text style={imp.eqLbl}>car km offset</Text></View>
              </View>

              <View style={imp.pledge}>
                <Text style={imp.pledgeIcon}>🏆</Text>
                <Text style={imp.pledgeTxt}>You're a UniGo Green Rider! Every shared ride helps SRM campus breathe cleaner.</Text>
              </View>
              <View style={{ height: 32 }} />
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── History Modal ─────────────────────────────────────────────────────────────
function HistoryModal({ visible, onClose, history }: {
  visible: boolean; onClose: () => void; history: RideHistoryItem[];
}) {
  const slideAnim = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }).start();
    } else {
      slideAnim.setValue(600);
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
      <View style={hist.overlay}>
        <Animated.View style={[hist.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <SafeAreaView style={{ flex: 1, overflow: 'hidden' }}>
            <View style={hist.handle} />
            <View style={hist.hdr}>
              <Text style={hist.hdrTitle}>🕐 Ride history</Text>
              <TouchableOpacity style={hist.closeBtn} onPress={onClose}>
                <Text style={hist.closeTxt}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={hist.scroll} showsVerticalScrollIndicator={false}>
              {history.length === 0 ? (
                <View style={hist.empty}>
                  <Text style={hist.emptyIcon}>🚗</Text>
                  <Text style={hist.emptyTitle}>No rides yet</Text>
                  <Text style={hist.emptySub}>Your completed rides will appear here</Text>
                </View>
              ) : history.map((item, i) => {
                const tag    = getStatusTag(item.status);
                const impact = getReliabilityImpact(item.status);
                const isGood = item.status === 'completed';
                return (
                  <View key={item.id}
                    style={[hist.item, i === history.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={[hist.icon, isGood ? hist.iconGood : hist.iconBad]}>
                      <Text style={hist.iconTxt}>{isGood ? '🚗' : '✕'}</Text>
                    </View>
                    <View style={hist.info}>
                      <Text style={hist.route} numberOfLines={1}>
                        {item.pickup_address} → {item.dropoff_address}
                      </Text>
                      <Text style={hist.date}>
                        {formatDate(item.departure_time)} · {item.driver_name}
                      </Text>
                      <View style={hist.tags}>
                        <View style={[hist.tag, hist[`tag_${tag.style}` as keyof typeof hist] as any]}>
                          <Text style={[hist.tagTxt, hist[`tagTxt_${tag.style}` as keyof typeof hist] as any]}>
                            {tag.label}
                          </Text>
                        </View>
                        {item.status === 'cancelled' && (
                          <View style={[hist.tag, hist.tag_amber]}>
                            <Text style={[hist.tagTxt, hist.tagTxt_amber]}>Late cancel</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={hist.right}>
                      <Text style={hist.amount}>{item.fare_paid ? `₹${item.fare_paid}` : '₹0'}</Text>
                      <Text style={[hist.impact, impact.good ? hist.impactGood : hist.impactBad]}>
                        {impact.text}
                      </Text>
                    </View>
                  </View>
                );
              })}
              <View style={{ height: 32 }} />
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Active Ride Card ──────────────────────────────────────────────────────────
function ActiveRideCard({ ride }: { ride: ActiveRide }) {
  const [eta, setEta] = useState(getETA(ride.departure_time));
  useEffect(() => {
    const t = setInterval(() => setEta(getETA(ride.departure_time)), 30000);
    return () => clearInterval(t);
  }, [ride.departure_time]);

  return (
    <View style={styles.activeCard}>
      <View style={styles.activeBadge}>
        <View style={styles.activeDot} />
        <Text style={styles.activeBadgeText}>ACTIVE RIDE</Text>
      </View>
      <View style={styles.driverRow}>
        <View style={styles.driverAv}>
          <Text style={styles.driverAvText}>{getInitials(ride.driver_name)}</Text>
        </View>
        <View style={styles.driverInfo}>
          <Text style={styles.driverName}>{ride.driver_name} · Driver</Text>
          <Text style={styles.driverSub}>{ride.vehicle_make} · {ride.vehicle_number}</Text>
        </View>
        <View style={styles.driverScore}>
          <Text style={styles.driverScoreText}>⭐ {ride.driver_score.toFixed(1)}</Text>
        </View>
      </View>
      <Text style={styles.activeRoute}>{ride.pickup_address} → {ride.dropoff_address}</Text>
      <View style={styles.activeStats}>
        <View style={styles.activeStat}>
          <Text style={[styles.activeStatNum, { color: '#34A853' }]}>{eta}</Text>
          <Text style={styles.activeStatLbl}>ETA</Text>
        </View>
        <View style={[styles.activeStat, styles.activeStatBorder]}>
          <Text style={styles.activeStatNum}>₹{ride.fare_share ?? '—'}</Text>
          <Text style={styles.activeStatLbl}>Your share</Text>
        </View>
        <View style={styles.activeStat}>
          <Text style={styles.activeStatNum}>Live</Text>
          <Text style={styles.activeStatLbl}>Tracking</Text>
        </View>
      </View>
    </View>
  );
}

// ── Month Card ────────────────────────────────────────────────────────────────
function MonthCard({ stats }: { stats: MonthStats }) {
  const pct       = Math.min(100, Math.round((stats.ridesThisMonth / MONTHLY_GOAL) * 100));
  const remaining = Math.max(0, MONTHLY_GOAL - stats.ridesThisMonth);
  const monthName = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <View style={styles.monthCard}>
      <View style={styles.monthTop}>
        <View>
          <Text style={styles.monthTitle}>{monthName}</Text>
          <Text style={styles.monthSub}>Your commute this month</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.monthSaved}>₹{stats.savedThisMonth.toLocaleString('en-IN')}</Text>
          <Text style={styles.monthSavedLbl}>saved</Text>
        </View>
      </View>
      <View style={styles.monthStats}>
        <View style={styles.mstat}>
          <Text style={styles.mstatNum}>{stats.ridesThisMonth}</Text>
          <Text style={styles.mstatLbl}>🚗 Rides done</Text>
        </View>
        <View style={styles.mstat}>
          <Text style={[styles.mstatNum, { color: '#188038' }]}>{getCO2(stats.ridesThisMonth)} kg</Text>
          <Text style={styles.mstatLbl}>🌿 CO₂ saved</Text>
        </View>
      </View>
      <View style={styles.goalLabelRow}>
        <Text style={styles.goalLabel}>Monthly goal</Text>
        <Text style={styles.goalVal}>{stats.ridesThisMonth} / {MONTHLY_GOAL} rides</Text>
      </View>
      <View style={styles.goalTrack}>
        <View style={[styles.goalFill, { width: `${pct}%` as any }]} />
      </View>
      <Text style={styles.goalHint}>
        {remaining === 0
          ? '🎉 Goal reached! Amazing month!'
          : `${remaining} more ride${remaining > 1 ? 's' : ''} to hit your goal!`}
      </Text>
    </View>
  );
}

// ── All Time Card ─────────────────────────────────────────────────────────────
function AllTimeCard({ stats }: { stats: AllTimeStats }) {
  return (
    <View style={styles.allTimeCard}>
      <Text style={styles.allTimeTitle}>🏆 All time savings</Text>
      <View style={styles.allTimeRow}>
        <View style={styles.allTimeStat}>
          <Text style={[styles.allTimeNum, { color: '#1A73E8' }]}>
            ₹{stats.totalSaved.toLocaleString('en-IN')}
          </Text>
          <Text style={styles.allTimeLbl}>Total saved</Text>
        </View>
        <View style={[styles.allTimeStat, { borderLeftWidth: 0.5, borderLeftColor: '#E0E0E0' }]}>
          <Text style={styles.allTimeNum}>{stats.totalRides}</Text>
          <Text style={styles.allTimeLbl}>Total rides</Text>
        </View>
      </View>
    </View>
  );
}

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────
export default function RidesScreen({ userId }: RidesScreenProps) {
  // Use passed userId (from auth) or fallback to mock for testing
  const USER_ID = userId ?? CURRENT_USER_ID;

  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [activeRide,  setActiveRide]  = useState<ActiveRide | null>(null);
  const [history,     setHistory]     = useState<RideHistoryItem[]>([]);
  const [monthStats,  setMonthStats]  = useState<MonthStats>({ ridesThisMonth: 0, savedThisMonth: 0 });
  const [allTime,     setAllTime]     = useState<AllTimeStats>({ totalRides: 0, totalSaved: 0 });
  const [showHistory, setShowHistory] = useState(false);
  const [showImpact,  setShowImpact]  = useState(false);
  const [fetchError,  setFetchError]  = useState<string | null>(null);
  const channelRef = useRef<any>(null);

  // ── Fetch everything ────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      setFetchError(null);

      // 1. Active ride — ride_requests table (status=accepted) + rides table (status=scheduled/active)
      const { data: activeReq } = await supabase
        .from('ride_requests')
        .select(`
          id, ride_id, fare_share,
          rides (
            pickup_address, dropoff_address, departure_time, status,
            users:driver_id ( name, reliability_score ),
            driver_profiles:driver_id ( vehicle_number, vehicle_make )
          )
        `)
        .eq('rider_id', USER_ID)
        .eq('status', 'accepted')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeReq) {
        const r = (activeReq as any).rides;
        if (r && ['scheduled', 'active'].includes(r.status ?? '')) {
          setActiveRide({
            ride_id:         activeReq.ride_id,
            driver_name:     r.users?.name ?? 'Driver',
            driver_score:    r.users?.reliability_score ?? 100,
            vehicle_number:  r.driver_profiles?.vehicle_number ?? '—',
            vehicle_make:    r.driver_profiles?.vehicle_make ?? 'Car',
            pickup_address:  r.pickup_address ?? 'Pickup',
            dropoff_address: r.dropoff_address ?? 'Dropoff',
            fare_share:      activeReq.fare_share ?? 0,
            departure_time:  r.departure_time ?? new Date().toISOString(),
          });
        } else {
          setActiveRide(null);
        }
      } else {
        setActiveRide(null);
      }

      // 2. Ride history — directly from ride_requests + rides
      //    (NOT using the view — views don't support real-time)
      const { data: histRows, error: histErr } = await supabase
        .from('ride_requests')
        .select(`
          id, ride_id, status, fare_share, created_at,
          rides (
            pickup_address, dropoff_address, departure_time,
            users:driver_id ( name )
          )
        `)
        .eq('rider_id', USER_ID)
        .in('status', ['completed', 'cancelled', 'no_show'])
        .order('created_at', { ascending: false })
        .limit(100);

      if (histErr) throw new Error(histErr.message);

      const mapped: RideHistoryItem[] = (histRows ?? []).map((r: any) => ({
        id:              r.id,
        pickup_address:  r.rides?.pickup_address  ?? 'Pickup',
        dropoff_address: r.rides?.dropoff_address ?? 'Dropoff',
        departure_time:  r.rides?.departure_time  ?? r.created_at,
        status:          r.status,
        fare_paid:       r.fare_share,
        driver_name:     r.rides?.users?.name ?? 'Driver',
      }));

      setHistory(mapped);

      // 3. Month stats — computed from history
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const completedAll   = mapped.filter(h => h.status === 'completed');
      const completedMonth = completedAll.filter(h => h.departure_time >= startOfMonth);
      const savedMonth     = completedMonth.reduce((s, h) => s + (h.fare_paid ?? 0), 0);

      setMonthStats({
        ridesThisMonth: completedMonth.length,
        savedThisMonth: Math.round(savedMonth),
      });

      // 4. All-time — from impact_summary (most accurate), fallback to computed
      const { data: impact } = await supabase
        .from('impact_summary')
        .select('total_rides, total_saved')
        .eq('user_id', USER_ID)
        .maybeSingle();

      if (impact && impact.total_rides > 0) {
        setAllTime({ totalRides: impact.total_rides, totalSaved: Number(impact.total_saved) });
      } else {
        const totalSaved = completedAll.reduce((s, h) => s + (h.fare_paid ?? 0), 0);
        setAllTime({ totalRides: completedAll.length, totalSaved: Math.round(totalSaved) });
      }

    } catch (err: any) {
      console.error('RidesScreen error:', err);
      setFetchError(err?.message ?? 'Failed to load rides');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [USER_ID]);

  // ── Real-time subscriptions ─────────────────────────────────────────────────
  // We subscribe to ride_requests and impact_summary for this specific user.
  // When Krithika logs in with her userId, her data updates in real-time automatically.
  useEffect(() => {
    fetchAll();

    channelRef.current = supabase
      .channel(`rides_screen_${USER_ID}`)
      // Rider's request status changes (accepted, completed, cancelled, no_show)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ride_requests',
        filter: `rider_id=eq.${USER_ID}`,
      }, (payload) => {
        console.log('ride_request changed:', payload);
        fetchAll();
      })
      // Ride status changes (active, completed, cancelled)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rides',
      }, () => fetchAll())
      // Impact summary updated (e.g. after ride completion)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'impact_summary',
        filter: `user_id=eq.${USER_ID}`,
      }, () => fetchAll())
      .subscribe((status) => {
        console.log('RidesScreen realtime status:', status);
      });

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchAll, USER_ID]);

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1A73E8" />
        <Text style={{ color: '#999', marginTop: 12, fontSize: 13 }}>Loading your rides...</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.screen}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchAll(); }}
            colors={['#1A73E8']}
          />
        }>

        <View style={styles.header}>
          <Text style={styles.title}>🚗 My Rides</Text>
          <Text style={styles.sub}>SRM TrustCircle</Text>
        </View>

        {/* Error banner */}
        {fetchError && (
          <TouchableOpacity
            style={styles.errorBanner}
            onPress={() => { setLoading(true); fetchAll(); }}>
            <Text style={styles.errorText}>⚠️ {fetchError} — tap to retry</Text>
          </TouchableOpacity>
        )}

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.btnHistory} onPress={() => setShowHistory(true)} activeOpacity={0.8}>
            <Text style={styles.btnHistoryIcon}>🕐</Text>
            <Text style={styles.btnHistoryText}>
              Ride history{history.length > 0 ? ` (${history.length})` : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnImpact} onPress={() => setShowImpact(true)} activeOpacity={0.8}>
            <Text style={styles.btnImpactIcon}>🌿</Text>
            <Text style={styles.btnImpactText}>My impact</Text>
          </TouchableOpacity>
        </View>

        {activeRide && <ActiveRideCard ride={activeRide} />}
        <MonthCard stats={monthStats} />
        <AllTimeCard stats={allTime} />
        <View style={{ height: 32 }} />
      </ScrollView>

      <HistoryModal
        visible={showHistory}
        onClose={() => setShowHistory(false)}
        history={history}
      />
      <ImpactModal
        visible={showImpact}
        onClose={() => setShowImpact(false)}
        totalRides={allTime.totalRides}
        totalSaved={allTime.totalSaved}
      />
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: '#F0F4FF', padding: 20, paddingTop: 52 },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F4FF' },
  header:  { marginBottom: 16 },
  title:   { fontSize: 22, fontWeight: 'bold', color: '#1A1A2E' },
  sub:     { fontSize: 13, color: '#666', marginTop: 2 },

  errorBanner: { backgroundColor: '#FCE8E6', borderRadius: 12, padding: 12, marginBottom: 12 },
  errorText:   { color: '#C5221F', fontSize: 13 },

  actionRow:      { flexDirection: 'row', gap: 12, marginBottom: 16 },
  btnHistory:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#1A73E8', borderRadius: 16, paddingVertical: 14 },
  btnHistoryIcon: { fontSize: 16 },
  btnHistoryText: { fontSize: 14, fontWeight: '700', color: '#1A73E8' },
  btnImpact:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1A1A2E', borderRadius: 16, paddingVertical: 14 },
  btnImpactIcon:  { fontSize: 16 },
  btnImpactText:  { fontSize: 14, fontWeight: '700', color: '#fff' },

  activeCard:      { backgroundColor: '#1A1A2E', borderRadius: 20, padding: 20, marginBottom: 16 },
  activeBadge:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(52,168,83,0.2)', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 14 },
  activeDot:       { width: 7, height: 7, borderRadius: 4, backgroundColor: '#34A853' },
  activeBadgeText: { fontSize: 11, color: '#34A853', fontWeight: '700', letterSpacing: 0.5 },
  driverRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  driverAv:        { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E8F0FE', justifyContent: 'center', alignItems: 'center' },
  driverAvText:    { fontSize: 13, fontWeight: 'bold', color: '#1A73E8' },
  driverInfo:      { flex: 1 },
  driverName:      { fontSize: 14, fontWeight: '600', color: '#fff' },
  driverSub:       { fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 1 },
  driverScore:     { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  driverScoreText: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  activeRoute:     { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 16 },
  activeStats:     { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.12)', paddingTop: 14 },
  activeStat:      { flex: 1, alignItems: 'center' },
  activeStatBorder:{ borderLeftWidth: 0.5, borderRightWidth: 0.5, borderColor: 'rgba(255,255,255,0.12)' },
  activeStatNum:   { fontSize: 18, fontWeight: '700', color: '#fff' },
  activeStatLbl:   { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 },

  monthCard:    { backgroundColor: '#fff', borderRadius: 20, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  monthTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  monthTitle:   { fontSize: 16, fontWeight: 'bold', color: '#1A1A2E' },
  monthSub:     { fontSize: 12, color: '#666', marginTop: 2 },
  monthSaved:   { fontSize: 26, fontWeight: 'bold', color: '#1A73E8' },
  monthSavedLbl:{ fontSize: 12, color: '#666', marginTop: 2, textAlign: 'right' },
  monthStats:   { flexDirection: 'row', gap: 10, marginBottom: 16 },
  mstat:        { flex: 1, backgroundColor: '#F5F7FF', borderRadius: 12, padding: 12 },
  mstatNum:     { fontSize: 20, fontWeight: 'bold', color: '#1A1A2E' },
  mstatLbl:     { fontSize: 12, color: '#666', marginTop: 2 },
  goalLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  goalLabel:    { fontSize: 13, color: '#666' },
  goalVal:      { fontSize: 13, fontWeight: '700', color: '#1A73E8' },
  goalTrack:    { backgroundColor: '#E8F0FE', borderRadius: 99, height: 8, overflow: 'hidden' },
  goalFill:     { height: 8, borderRadius: 99, backgroundColor: '#1A73E8' },
  goalHint:     { fontSize: 12, color: '#666', marginTop: 6 },

  allTimeCard:  { backgroundColor: '#fff', borderRadius: 20, padding: 20, marginBottom: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  allTimeTitle: { fontSize: 13, fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },
  allTimeRow:   { flexDirection: 'row' },
  allTimeStat:  { flex: 1, alignItems: 'center' },
  allTimeNum:   { fontSize: 28, fontWeight: 'bold', color: '#1A1A2E' },
  allTimeLbl:   { fontSize: 12, color: '#999', marginTop: 4 },
});

const imp = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: '#0D1B0F', borderTopLeftRadius: 28, borderTopRightRadius: 28, height: '92%' },
  handle:     { width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  scroll:     { paddingHorizontal: 20 },
  hdr:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 12, paddingBottom: 20 },
  hdrTitle:   { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  hdrSub:     { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 3 },
  closeBtn:   { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  closeTxt:   { fontSize: 14, color: 'rgba(255,255,255,0.6)' },
  forestCard:    { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 18, padding: 16, marginBottom: 14 },
  forestLabel:   { fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.8, marginBottom: 14 },
  forestRow:     { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 4, minHeight: 80 },
  ground:        { height: 2, backgroundColor: 'rgba(52,168,83,0.25)', borderRadius: 2, marginTop: 8 },
  forestCaption: { fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 10, textAlign: 'center' },
  statsRow:  { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statBox:   { flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14, padding: 14 },
  statNum:   { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  statLbl:   { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 3 },
  statHint:  { fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 2 },
  fuelCard:  { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14, padding: 16, marginBottom: 14 },
  fuelTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  fuelTitle: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  fuelNum:   { fontSize: 20, fontWeight: 'bold', color: '#FBBC04' },
  barBg:     { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 99, height: 8, overflow: 'hidden' },
  barFill:   { height: 8, borderRadius: 99, backgroundColor: '#FBBC04' },
  fuelSub:   { fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 8 },
  eqTitle: { fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: 0.8, marginBottom: 10 },
  eqGrid:  { flexDirection: 'row', gap: 8, marginBottom: 16 },
  eqBox:   { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 12, alignItems: 'center' },
  eqIcon:  { fontSize: 20, marginBottom: 6 },
  eqNum:   { fontSize: 15, fontWeight: 'bold', color: '#fff' },
  eqLbl:   { fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 3, textAlign: 'center' },
  pledge:    { backgroundColor: 'rgba(52,168,83,0.12)', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pledgeIcon:{ fontSize: 28 },
  pledgeTxt: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 19 },
});

const hist = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:    { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, height: '88%' },
  handle:   { width: 40, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  hdr:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: '#F0F0F0' },
  hdrTitle: { fontSize: 18, fontWeight: 'bold', color: '#1A1A2E' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  closeTxt: { fontSize: 14, color: '#666' },
  scroll:   { paddingHorizontal: 16 },
  empty:      { alignItems: 'center', paddingVertical: 60 },
  emptyIcon:  { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: 'bold', color: '#1A1A2E', marginBottom: 4 },
  emptySub:   { fontSize: 13, color: '#999' },
  item:       { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#F0F0F0' },
  icon:       { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  iconGood:   { backgroundColor: '#E6F4EA' },
  iconBad:    { backgroundColor: '#FCE8E6' },
  iconTxt:    { fontSize: 17 },
  info:       { flex: 1 },
  route:      { fontSize: 14, fontWeight: '600', color: '#1A1A2E' },
  date:       { fontSize: 12, color: '#999', marginTop: 2 },
  tags:       { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  tag:        { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  tag_green:  { backgroundColor: '#E6F4EA' },
  tag_red:    { backgroundColor: '#FCE8E6' },
  tag_blue:   { backgroundColor: '#E8F0FE' },
  tag_amber:  { backgroundColor: '#FEF0E0' },
  tagTxt:         { fontSize: 11 },
  tagTxt_green:   { color: '#27500A' },
  tagTxt_red:     { color: '#7F1D1D' },
  tagTxt_blue:    { color: '#0C447C' },
  tagTxt_amber:   { color: '#633806' },
  right:      { alignItems: 'flex-end', flexShrink: 0 },
  amount:     { fontSize: 14, fontWeight: '700', color: '#1A1A2E' },
  impact:     { fontSize: 11, marginTop: 3 },
  impactGood: { color: '#188038' },
  impactBad:  { color: '#C5221F' },
});