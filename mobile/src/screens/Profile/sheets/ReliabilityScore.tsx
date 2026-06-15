import React from 'react';
import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, useWindowDimensions, StatusBar,
  ActivityIndicator,
} from 'react-native';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
);

const MOCK_USER_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

interface Props {
  onBack: () => void;
  userName?: string;
  userId?: string;
}

interface ScoreData {
  score: number;
  totalRides: number;
  thisMonth: number;
  cancellations: number;
  noShows: number;
  reportsCount: number;
  onTimeRate: number;
  completionRate: number;
  historyScores: number[];
}

function getTier(score: number) {
  if (score >= 95) return { label: 'Platinum', color: '#27500A', bg: '#E6F4EA', emoji: '💎' };
  if (score >= 80) return { label: 'Gold',     color: '#9A7500', bg: '#FFFDE7', emoji: '🥇' };
  if (score >= 60) return { label: 'Silver',   color: '#185FA5', bg: '#E8F0FE', emoji: '🥈' };
  return              { label: 'Restricted',   color: '#C5221F', bg: '#FCE8E6', emoji: '⚠️' };
}

const tiers = [
  { label: 'Restricted', range: '<60',   color: '#C5221F', bg: '#FCE8E6' },
  { label: 'Silver',     range: '60–79', color: '#185FA5', bg: '#E8F0FE' },
  { label: 'Gold',       range: '80–94', color: '#9A7500', bg: '#FFFDE7' },
  { label: 'Platinum',   range: '95+',   color: '#27500A', bg: '#E6F4EA' },
];

// Tips that always show — permanent guidance
const IMPROVEMENT_TIPS = [
  {
    icon: '⏰',
    title: 'Cancel at least 2 hours early',
    sub: 'Late cancels (within 30 min of departure) cost 10 pts each.',
    color: '#FEF0E0',
  },
  {
    icon: '📍',
    title: 'Be at pickup 5 mins early',
    sub: 'No-shows are the biggest score killer — 15 pts per miss.',
    color: '#FCE8E6',
  },
  {
    icon: '🚗',
    title: 'Complete 5 rides this month',
    sub: 'Consistent rides boost your completion rate and score.',
    color: '#E8F0FE',
  },
  {
    icon: '🤝',
    title: 'Keep your community happy',
    sub: 'Emergency reports from co-riders cost 20 pts and trigger a review.',
    color: '#F3E8FD',
  },
  {
    icon: '💎',
    title: 'Hit Platinum for priority matching',
    sub: 'Platinum riders (95+) get first access to available rides.',
    color: '#E6F4EA',
  },
];

export default function ReliabilityScore({ onBack, userName = 'Ruvanthika', userId = MOCK_USER_ID }: Props) {
  useWindowDimensions();
  const [data, setData] = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchScoreData = useCallback(async () => {
    try {
      // 1. reliability_score from users
      const { data: userRow } = await supabase
        .from('users')
        .select('reliability_score')
        .eq('id', userId)
        .single();

      const score = userRow?.reliability_score ?? 100;

      // 2. ride_requests for this rider
      const { data: allRequests } = await supabase
        .from('ride_requests')
        .select('status, created_at')
        .eq('rider_id', userId);

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const totalRides    = allRequests?.filter(r => r.status === 'completed').length ?? 0;
      const thisMonth     = allRequests?.filter(r =>
        r.status === 'completed' && r.created_at >= startOfMonth
      ).length ?? 0;
      const cancellations = allRequests?.filter(r => r.status === 'cancelled').length ?? 0;
      const noShows       = allRequests?.filter(r => r.status === 'no_show').length ?? 0;

      // 3. emergency_logs (reports filed against user)
      const { count: reportsCount } = await supabase
        .from('emergency_logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);

      // 4. Derived metrics
      const completedOrNoShow = totalRides + noShows;
      const onTimeRate = completedOrNoShow > 0
        ? Math.round((totalRides / completedOrNoShow) * 100)
        : 100;
      const completionRate = (totalRides + cancellations) > 0
        ? Math.round((totalRides / (totalRides + cancellations)) * 100)
        : 100;

      // 5. Score history trend (30 days simulated from live score)
      const historyScores = Array.from({ length: 30 }, (_, i) => {
        const daysAgo = 29 - i;
        const base = Math.max(60, score - Math.floor(daysAgo * 0.15));
        const jitter = Math.floor(Math.random() * 3) - 1;
        return Math.min(100, Math.max(60, base + jitter));
      });
      historyScores[29] = score;

      setData({ score, totalRides, thisMonth, cancellations, noShows,
        reportsCount: reportsCount ?? 0, onTimeRate, completionRate, historyScores });
      setLastUpdated(new Date());
    } catch (err) {
      console.error('ReliabilityScore fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchScoreData();

    const userChannel = supabase
      .channel('rs_user_score')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${userId}` },
        () => fetchScoreData())
      .subscribe();

    const rideChannel = supabase
      .channel('rs_ride_requests')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'ride_requests', filter: `rider_id=eq.${userId}` },
        () => fetchScoreData())
      .subscribe();

    const emergencyChannel = supabase
      .channel('rs_emergency_logs')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'emergency_logs', filter: `user_id=eq.${userId}` },
        () => fetchScoreData())
      .subscribe();

    return () => {
      supabase.removeChannel(userChannel);
      supabase.removeChannel(rideChannel);
      supabase.removeChannel(emergencyChannel);
    };
  }, [fetchScoreData]);

  if (loading || !data) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#1A73E8" />
        <Text style={styles.loadingText}>Loading your score…</Text>
      </View>
    );
  }

  const tier = getTier(data.score);
  const chartBars = data.historyScores.filter((_, i) => i % 3 === 0);
  const ptsToNext = data.score < 80 ? 80 - data.score : data.score < 95 ? 95 - data.score : 0;
  const nextTierLabel = data.score < 60 ? 'Silver' : data.score < 80 ? 'Silver' : data.score < 95 ? 'Platinum' : null;

  const breakdown = [
    { label: 'On-time rate',         value: data.onTimeRate,   color: data.onTimeRate   >= 90 ? '#188038' : '#E37400' },
    { label: 'Ride completion',      value: data.completionRate, color: data.completionRate >= 90 ? '#188038' : '#E37400' },
    { label: 'No cancellations',     value: Math.max(0, 100 - data.cancellations * 10), color: data.cancellations === 0 ? '#188038' : '#E37400' },
    { label: 'Community verified',   value: 100,               color: '#1A73E8' },
    { label: 'No emergency reports', value: data.reportsCount === 0 ? 100 : Math.max(0, 100 - data.reportsCount * 20), color: data.reportsCount === 0 ? '#188038' : '#C5221F' },
  ];

  const formatUpdated = (d: Date) => {
    const h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
    const period = h >= 12 ? 'PM' : 'AM';
    const dh = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `Updated ${dh}:${m} ${period}`;
  };

  return (
    <ScrollView style={styles.screen} showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 48 }}>
      <StatusBar barStyle="light-content" />

      {/* ── Hero ── */}
      <View style={styles.heroSection}>
        <View style={styles.navRow}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>Trust Score</Text>
          <View style={styles.liveDotWrap}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>

        <Text style={styles.userName}>{userName}</Text>
        <Text style={styles.userSubtitle}>SRM TrustCircle · Rider</Text>

        <View style={styles.ringWrap}>
          <View style={styles.ringOuter}>
            <View style={styles.ringInner}>
              <Text style={styles.scoreNumber}>{data.score}</Text>
              <Text style={styles.scoreMax}>/100</Text>
            </View>
          </View>
        </View>

        <View style={[styles.tierPill, { backgroundColor: tier.bg }]}>
          <Text style={[styles.tierPillText, { color: tier.color }]}>
            {tier.emoji}  {tier.label} Rider
          </Text>
        </View>

        {lastUpdated && (
          <Text style={styles.rankText}>{formatUpdated(lastUpdated)}</Text>
        )}

        <View style={styles.tierRow}>
          {tiers.map(t => (
            <View key={t.label} style={[
              styles.tierBox, { backgroundColor: t.bg },
              t.label === tier.label && styles.tierBoxActive,
            ]}>
              <Text style={[styles.tierRange, { color: t.color }]}>{t.range}</Text>
              <Text style={[styles.tierLabel, { color: t.color }]}>{t.label}</Text>
              {t.label === tier.label && <Text style={[styles.tierYou, { color: t.color }]}>← you</Text>}
            </View>
          ))}
        </View>
      </View>

      {/* ── Body ── */}
      <View style={styles.body}>

        {/* Score Breakdown */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Score breakdown</Text>
          {breakdown.map(item => (
            <View key={item.label} style={styles.barItem}>
              <View style={styles.barLabelRow}>
                <Text style={styles.barLabel}>{item.label}</Text>
                <Text style={[styles.barValue, { color: item.color }]}>{item.value}%</Text>
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${item.value}%` as any, backgroundColor: item.color }]} />
              </View>
            </View>
          ))}
        </View>

        {/* Score History */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Score history · last 30 days</Text>
          <View style={styles.chartArea}>
            {chartBars.map((s, i) => {
              const heightPct = Math.max(((s - 60) / 40) * 100, 6);
              const isLatest  = i === chartBars.length - 1;
              return (
                <View key={i} style={styles.chartBarWrap}>
                  <View style={[styles.chartBar, {
                    height: `${heightPct}%` as any,
                    backgroundColor: isLatest ? '#1A73E8' : '#B5D4F4',
                  }]} />
                </View>
              );
            })}
          </View>
          <View style={styles.chartLabels}>
            <Text style={styles.chartLabel}>30 days ago</Text>
            <Text style={[styles.chartLabel, { color: '#1A73E8', fontWeight: '600' }]}>
              Today · {data.score}
            </Text>
          </View>
        </View>

        {/* What's pulling your score down */}
        <View style={styles.card}>
          <View style={styles.insightHeader}>
            <Text style={styles.insightHeaderIcon}>💡</Text>
            <Text style={styles.cardTitle}>What's pulling your score down</Text>
          </View>

          {data.cancellations === 0 && data.noShows === 0 && data.reportsCount === 0 ? (
            <View style={styles.allGoodBox}>
              <Text style={styles.allGoodText}>✅ Nothing! You're on track.</Text>
              <Text style={styles.allGoodSub}>Keep completing rides to maintain your score.</Text>
            </View>
          ) : (
            <>
              {data.cancellations > 0 && (
                <View style={styles.insightItem}>
                  <View style={[styles.insightDot, { backgroundColor: '#FEF0E0' }]}>
                    <Text style={styles.insightDotIcon}>✕</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.insightTitle}>{data.cancellations} cancellation{data.cancellations > 1 ? 's' : ''} total</Text>
                    <Text style={styles.insightSub}>Late cancels (within 30 min) cost 10 pts each</Text>
                  </View>
                </View>
              )}
              {data.noShows > 0 && (
                <View style={styles.insightItem}>
                  <View style={[styles.insightDot, { backgroundColor: '#FCE8E6' }]}>
                    <Text style={styles.insightDotIcon}>⚠️</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.insightTitle}>{data.noShows} no-show{data.noShows > 1 ? 's' : ''} recorded</Text>
                    <Text style={styles.insightSub}>No-shows cost 15 pts each</Text>
                  </View>
                </View>
              )}
              {data.reportsCount > 0 && (
                <View style={[styles.insightItem, { borderBottomWidth: 0 }]}>
                  <View style={[styles.insightDot, { backgroundColor: '#FCE8E6' }]}>
                    <Text style={styles.insightDotIcon}>🚩</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.insightTitle}>{data.reportsCount} emergency report{data.reportsCount > 1 ? 's' : ''} filed</Text>
                    <Text style={styles.insightSub}>Reports trigger a review of your account</Text>
                  </View>
                </View>
              )}
            </>
          )}

          {nextTierLabel && ptsToNext > 0 ? (
            <View style={styles.tipBox}>
              <Text style={styles.tipTitle}>
                {tier.label === 'Gold' ? '💎' : '🥇'} Tip to reach {nextTierLabel}
              </Text>
              <Text style={styles.tipSub}>
                {ptsToNext} more point{ptsToNext > 1 ? 's' : ''} needed. Complete rides on time!
              </Text>
            </View>
          ) : !nextTierLabel ? (
            <View style={[styles.tipBox, { backgroundColor: '#E6F4EA' }]}>
              <Text style={[styles.tipTitle, { color: '#188038' }]}>💎 You're Platinum!</Text>
              <Text style={[styles.tipSub, { color: '#27500A' }]}>Maintain your score by completing rides on time.</Text>
            </View>
          ) : null}
        </View>

        {/* ── HOW TO IMPROVE — always visible ── */}
        <View style={styles.card}>
          <View style={styles.insightHeader}>
            <Text style={styles.insightHeaderIcon}>🚀</Text>
            <Text style={styles.cardTitle}>How to improve your score</Text>
          </View>
          <Text style={styles.improveSub}>
            These habits keep your score high and unlock better rides.
          </Text>
          {IMPROVEMENT_TIPS.map((tip, i) => (
            <View
              key={i}
              style={[
                styles.improveItem,
                i === IMPROVEMENT_TIPS.length - 1 && { borderBottomWidth: 0 },
              ]}>
              <View style={[styles.improveIcon, { backgroundColor: tip.color }]}>
                <Text style={styles.improveIconText}>{tip.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.improveTitle}>{tip.title}</Text>
                <Text style={styles.improveSub2}>{tip.sub}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {[
            { label: 'Total rides',   value: String(data.totalRides),    color: '#1A1A2E' },
            { label: 'This month',    value: String(data.thisMonth),      color: '#1A1A2E' },
            { label: 'Cancellations', value: String(data.cancellations),  color: data.cancellations > 0 ? '#E37400' : '#188038' },
            { label: 'Reports filed', value: String(data.reportsCount),   color: data.reportsCount > 0 ? '#C5221F' : '#188038' },
          ].map(s => (
            <View key={s.label} style={styles.statBox}>
              <Text style={styles.statLabel}>{s.label}</Text>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            </View>
          ))}
        </View>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: '#F0F4FF' },
  loadingWrap:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1A1A2E' },
  loadingText:  { color: '#7A96C4', marginTop: 14, fontSize: 14, fontWeight: '500' },

  heroSection: {
    backgroundColor: '#1A1A2E', paddingTop: 56, paddingBottom: 28,
    paddingHorizontal: 20, alignItems: 'center',
  },
  navRow:    { flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 20 },
  backBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  backArrow: { fontSize: 20, color: '#fff', fontWeight: '600' },
  navTitle:  { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5, textTransform: 'uppercase' },

  liveDotWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 46 },
  liveDot:     { width: 7, height: 7, borderRadius: 4, backgroundColor: '#34D058' },
  liveText:    { fontSize: 9, color: '#34D058', fontWeight: '800', letterSpacing: 0.8 },

  userName:    { fontSize: 30, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.4, marginBottom: 4, textAlign: 'center' },
  userSubtitle:{ fontSize: 13, color: '#7A96C4', fontWeight: '500', marginBottom: 22, textAlign: 'center' },

  ringWrap:  { marginBottom: 16 },
  ringOuter: { width: 108, height: 108, borderRadius: 54, borderWidth: 4, borderColor: '#1A73E8', justifyContent: 'center', alignItems: 'center', shadowColor: '#1A73E8', shadowOpacity: 0.4, shadowRadius: 16, elevation: 8 },
  ringInner: { alignItems: 'center' },
  scoreNumber: { fontSize: 34, fontWeight: '900', color: '#FFFFFF', lineHeight: 38 },
  scoreMax:    { fontSize: 12, color: '#5A7BAA', fontWeight: '600', marginTop: -2 },

  tierPill:     { borderRadius: 99, paddingHorizontal: 18, paddingVertical: 7, marginBottom: 6 },
  tierPillText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  rankText:     { fontSize: 12, color: '#5A7BAA', marginBottom: 20, fontWeight: '500' },

  tierRow:      { flexDirection: 'row', gap: 6, width: '100%' },
  tierBox:      { flex: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 4, alignItems: 'center' },
  tierBoxActive:{ borderWidth: 1.5, borderColor: '#FFD700' },
  tierRange:    { fontSize: 9, fontWeight: '700', marginBottom: 2 },
  tierLabel:    { fontSize: 9, fontWeight: '600' },
  tierYou:      { fontSize: 8, marginTop: 2, fontWeight: '700' },

  body: { padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 18, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#1A1A2E', marginBottom: 14, letterSpacing: 0.2 },

  barItem:     { marginBottom: 12 },
  barLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  barLabel:    { fontSize: 13, color: '#3A3A4A', fontWeight: '500' },
  barValue:    { fontSize: 13, fontWeight: '700' },
  barTrack:    { backgroundColor: '#EAECEF', borderRadius: 6, height: 8, overflow: 'hidden' },
  barFill:     { height: 8, borderRadius: 6 },

  chartArea:    { flexDirection: 'row', alignItems: 'flex-end', height: 64, gap: 4, marginBottom: 8 },
  chartBarWrap: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  chartBar:     { borderRadius: 4, width: '100%' },
  chartLabels:  { flexDirection: 'row', justifyContent: 'space-between' },
  chartLabel:   { fontSize: 11, color: '#999' },

  insightHeader:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  insightHeaderIcon: { fontSize: 17 },
  insightItem:       { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#F0F0F0', alignItems: 'flex-start' },
  insightDot:        { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  insightDotIcon:    { fontSize: 14 },
  insightTitle:      { fontSize: 13, color: '#1A1A2E', fontWeight: '700', marginBottom: 3 },
  insightSub:        { fontSize: 12, color: '#888', lineHeight: 16 },

  allGoodBox:  { alignItems: 'center', paddingVertical: 16 },
  allGoodText: { fontSize: 15, fontWeight: '700', color: '#188038', marginBottom: 4 },
  allGoodSub:  { fontSize: 12, color: '#888', textAlign: 'center' },

  tipBox:   { backgroundColor: '#FFFDE7', borderRadius: 12, padding: 14, marginTop: 14 },
  tipTitle: { fontSize: 13, fontWeight: '800', color: '#9A7500', marginBottom: 4 },
  tipSub:   { fontSize: 12, color: '#27500A', lineHeight: 17 },

  // How to improve styles
  improveSub:   { fontSize: 12, color: '#888', marginBottom: 14, marginTop: -8, lineHeight: 17 },
  improveItem:  { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#F0F0F0', alignItems: 'flex-start' },
  improveIcon:  { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  improveIconText: { fontSize: 18 },
  improveTitle: { fontSize: 13, fontWeight: '700', color: '#1A1A2E', marginBottom: 3 },
  improveSub2:  { fontSize: 12, color: '#888', lineHeight: 16 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  statBox:   { flex: 1, minWidth: '45%', backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  statLabel: { fontSize: 11, color: '#888', fontWeight: '500', marginBottom: 6 },
  statValue: { fontSize: 26, fontWeight: '900', lineHeight: 30 },
});