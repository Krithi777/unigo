/**
 * ProfileScreen.tsx — Redesigned to match UniGo Figma mockups.
 * Real data from Supabase. No mocks.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, StatusBar, ActivityIndicator, Share, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const C = {
  brand: '#5B2EFF', brandLight: '#EDE8FF',
  green: '#12A150', greenLight: '#E6F7ED',
  red: '#E53E3E', redLight: '#FEE2E2',
  bg: '#F5F6FA', surface: '#FFFFFF',
  border: '#EAECF0', text: '#0F172A',
  textSub: '#64748B', textMuted: '#94A3B8',
};

const MENU = [
  { icon: '✏️', label: 'Edit Profile', screen: 'EditProfile' },
  { icon: '💳', label: 'Wallet & Payments', screen: 'Wallet' },
  { icon: '🆘', label: 'Emergency Contacts', screen: 'EmergencyContact' },
  { icon: '🚗', label: 'My Vehicle', screen: 'DriverSetup' },
  { icon: '⚙️', label: 'Settings', screen: 'Settings' },
  { icon: '❓', label: 'Help & Support', screen: 'HelpSupport' },
];

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const [user, setUser] = useState<any>(null);
  const [impact, setImpact] = useState<any>(null);
  const [community, setCommunity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      const communityId = await AsyncStorage.getItem('community_id');
      if (!userId) { setLoading(false); return; }

      const [{ data: userData }, { data: impactData }] = await Promise.all([
        supabase.from('users').select('*').eq('id', userId).single(),
        supabase.from('impact_summary').select('*').eq('user_id', userId).single(),
      ]);
      setUser(userData);
      setImpact(impactData);

      if (communityId) {
        const { data: communityData } = await supabase
          .from('communities').select('name').eq('id', communityId).single();
        setCommunity(communityData);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const handleLogout = async () => {
    await AsyncStorage.multiRemove(['user_id', 'community_id', 'user_gender']);
    navigation.reset({ index: 0, routes: [{ name: 'PhoneEntry' }] });
  };

  const handleInvite = async () => {
    const userId = await AsyncStorage.getItem('user_id');
    await Share.share({ message: `Join me on UniGo — community carpooling! Use my invite code: UNIGO-${(userId ?? '').slice(0, 6).toUpperCase()}` });
  };

  if (loading) return <View style={styles.loader}><ActivityIndicator size="large" color={C.brand} /></View>;

  const score = user?.reliability_score ?? 100;
  const scoreColor = score >= 90 ? C.green : score >= 70 ? '#F59E0B' : C.red;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.topBar}>
          <Text style={styles.communityLabel}>📍 {community?.name ?? 'No community'}</Text>
          <TouchableOpacity onPress={() => {}} style={styles.notifBtn}>
            <Text style={styles.notifIcon}>🔔</Text>
          </TouchableOpacity>
        </View>

        {/* Profile Header Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(user?.name ?? 'U')[0].toUpperCase()}</Text>
            </View>
            <View style={[styles.scoreBadge, { backgroundColor: scoreColor }]}>
              <Text style={styles.scoreText}>{score}%</Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{user?.name ?? '—'}</Text>
            <Text style={styles.memberSince}>Member since {user?.created_at ? new Date(user.created_at).getFullYear() : '—'}</Text>
            {user?.gender === 'female' && (
              <View style={styles.womenBadge}>
                <Text style={styles.womenBadgeText}>♀ WOMEN-ONLY ACTIVE</Text>
              </View>
            )}
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{impact?.total_rides ?? 0}</Text>
            <Text style={styles.statLabel}>Rides</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: '#E8FFF0' }]}>
            <Text style={[styles.statNum, { color: C.green }]}>{impact?.total_co2_saved ?? 0}kg</Text>
            <Text style={styles.statLabel}>CO2 Saved</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: C.brand }]}>₹{impact?.total_saved ?? 0}</Text>
            <Text style={styles.statLabel}>Wallet</Text>
          </View>
        </View>

        {/* Menu */}
        <View style={styles.menuCard}>
          {MENU.map((item, i) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.menuItem, i === MENU.length - 1 && styles.menuItemLast]}
              onPress={() => navigation.navigate(item.screen)}
              activeOpacity={0.7}
            >
              <Text style={styles.menuIcon}>{item.icon}</Text>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Text style={styles.menuChevron}>›</Text>
            </TouchableOpacity>
          ))}

          {/* Logout */}
          <TouchableOpacity style={styles.menuItem} onPress={handleLogout} activeOpacity={0.7}>
            <Text style={styles.menuIcon}>🚪</Text>
            <Text style={[styles.menuLabel, { color: C.red }]}>Logout</Text>
            <Text style={[styles.menuChevron, { color: C.red }]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Invite Banner */}
        <TouchableOpacity style={styles.inviteBanner} onPress={handleInvite} activeOpacity={0.85}>
          <Text style={styles.inviteTitle}>Invite a classmate</Text>
          <Text style={styles.inviteSub}>Get ₹50 for every referral who completes their first ride.</Text>
          <View style={styles.shareBtn}>
            <Text style={styles.shareBtnText}>SHARE LINK</Text>
          </View>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scrollContent: { paddingHorizontal: 20, paddingTop: 12 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  communityLabel: { fontSize: 14, fontWeight: '600', color: C.text },
  notifBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  notifIcon: { fontSize: 16 },

  profileCard: {
    flexDirection: 'row', gap: 16, alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  avatarWrap: { position: 'relative' },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.brand, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: C.green },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 24 },
  scoreBadge: { position: 'absolute', bottom: -2, right: -2, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  scoreText: { color: '#fff', fontWeight: '700', fontSize: 10 },
  userName: { fontSize: 18, fontWeight: '700', color: C.text },
  memberSince: { fontSize: 12, color: C.textMuted, marginTop: 2, marginBottom: 6 },
  womenBadge: { borderWidth: 1.5, borderColor: C.brand, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  womenBadgeText: { color: C.brand, fontSize: 10, fontWeight: '700' },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statBox: { flex: 1, backgroundColor: C.brandLight, borderRadius: 14, padding: 14, alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: '800', color: C.text },
  statLabel: { fontSize: 11, color: C.textSub, marginTop: 3 },

  menuCard: {
    backgroundColor: C.surface, borderRadius: 16, overflow: 'hidden', marginBottom: 16,
    borderWidth: 1, borderColor: C.border,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  menuItemLast: { borderBottomWidth: 0 },
  menuIcon: { fontSize: 20, width: 28 },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: C.text },
  menuChevron: { fontSize: 20, color: C.textMuted, fontWeight: '300' },

  inviteBanner: { backgroundColor: C.brand, borderRadius: 16, padding: 20 },
  inviteTitle: { color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 6 },
  inviteSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 18, marginBottom: 16 },
  shareBtn: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, alignSelf: 'flex-start' },
  shareBtnText: { color: C.brand, fontWeight: '800', fontSize: 13 },
});
