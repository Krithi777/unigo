/**
 * ProfileScreen — Profile tab screen.
 * Shows avatar, reliability score banner, and menu items.
 * Emergency contact and reliability score open as full-screen Modals.
 * 
 * Source: ProfileSheet.tsx from unigo1, adapted to work as a tab screen
 * (not a Modal itself).
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, ScrollView, SafeAreaView,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import ReliabilityScore from './sheets/ReliabilityScore';
import EmergencyContact from './sheets/EmergencyContact';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [showScore, setShowScore] = useState(false);
  const [showEmergency, setShowEmergency] = useState(false);

  const userName = user?.name ?? 'Rider';
  const initials = userName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.heroBanner}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>
          <Text style={styles.heroName}>{userName}</Text>
          <View style={styles.roleRow}>
            <View style={styles.rolePill}>
              <Text style={styles.rolePillText}>🧑‍💼 {user?.role ?? 'Rider'}</Text>
            </View>
          </View>
        </View>

        {/* Score Banner */}
        <TouchableOpacity style={styles.scoreBanner} onPress={() => setShowScore(true)} activeOpacity={0.85}>
          <View style={styles.scoreBannerLeft}>
            <Text style={styles.scoreLabelTop}>RELIABILITY SCORE</Text>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreNumber}>{user?.reliability_score ?? 100}</Text>
              <Text style={styles.scoreMax}>/100</Text>
            </View>
            <View style={styles.tierBadge}>
              <Text style={styles.tierEmoji}>🥇</Text>
              <Text style={styles.tierText}>Gold Rider</Text>
            </View>
          </View>
          <View style={styles.scoreBannerRight}>
            <View style={styles.miniChart}>
              {[70, 78, 72, 82, 85, 88, 90, user?.reliability_score ?? 92].map((v, i) => (
                <View key={i} style={styles.miniBarWrap}>
                  <View style={[styles.miniBar, { height: `${((v - 60) / 40) * 100}%` as any, backgroundColor: i === 7 ? '#6C63FF' : '#C8BEFF' }]} />
                </View>
              ))}
            </View>
            <View style={styles.tapHintRow}>
              <Text style={styles.tapHintText}>Full report</Text>
              <Text style={styles.chevron}>›</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Menu */}
        <View style={styles.menu}>
          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
            <View style={styles.menuIconWrap}><Text style={styles.menuIcon}>👤</Text></View>
            <Text style={styles.menuLabel}>Edit profile</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => setShowEmergency(true)}>
            <View style={styles.menuIconWrap}><Text style={styles.menuIcon}>📞</Text></View>
            <Text style={styles.menuLabel}>Emergency contact</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
            <View style={styles.menuIconWrap}><Text style={styles.menuIcon}>🕐</Text></View>
            <Text style={styles.menuLabel}>My ride history</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} activeOpacity={0.7}>
            <View style={styles.menuIconWrap}><Text style={styles.menuIcon}>🚩</Text></View>
            <Text style={[styles.menuLabel, { color: '#E24B4A' }]}>Report an issue</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={signOut} activeOpacity={0.8}>
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Reliability Score Modal */}
      <Modal visible={showScore} animationType="slide" presentationStyle="pageSheet">
        <ReliabilityScore onBack={() => setShowScore(false)} userName={userName} userId={user?.id} />
      </Modal>

      {/* Emergency Contact Modal */}
      <Modal visible={showEmergency} animationType="slide" presentationStyle="pageSheet">
        <EmergencyContact onBack={() => setShowEmergency(false)} />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#F0F4FF' },
  scroll: { flex: 1 },
  heroBanner: {
    backgroundColor: '#1A1A2E', alignItems: 'center',
    paddingTop: 32, paddingBottom: 22, paddingHorizontal: 20,
  },
  avatarRing: { width: 72, height: 72, borderRadius: 36, borderWidth: 2.5, borderColor: '#6C63FF', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatar:     { width: 62, height: 62, borderRadius: 31, backgroundColor: '#6C63FF', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  heroName:   { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: 0.3, marginBottom: 10 },
  roleRow:    { flexDirection: 'row' },
  rolePill:   { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  rolePillText: { fontSize: 12, color: '#C8D8F8', fontWeight: '500' },

  scoreBanner:      { backgroundColor: '#EEF4FF', marginHorizontal: 16, marginTop: 16, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#C8DCFF' },
  scoreBannerLeft:  { flex: 1 },
  scoreLabelTop:    { fontSize: 9, color: '#4A7DC4', fontWeight: '800', letterSpacing: 1.2, marginBottom: 4 },
  scoreRow:         { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  scoreNumber:      { fontSize: 36, fontWeight: '900', color: '#6C63FF', lineHeight: 40 },
  scoreMax:         { fontSize: 14, color: '#7CA8E0', fontWeight: '500' },
  tierBadge:        { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  tierEmoji:        { fontSize: 14 },
  tierText:         { fontSize: 12, color: '#9A7500', fontWeight: '700' },
  scoreBannerRight: { alignItems: 'center', gap: 8, paddingLeft: 12 },
  miniChart:        { flexDirection: 'row', alignItems: 'flex-end', height: 36, gap: 3 },
  miniBarWrap:      { width: 6, height: 36, justifyContent: 'flex-end' },
  miniBar:          { width: 6, borderRadius: 2 },
  tapHintRow:       { flexDirection: 'row', alignItems: 'center', gap: 2 },
  tapHintText:      { fontSize: 10, color: '#6C63FF', fontWeight: '600' },
  chevron:          { fontSize: 16, color: '#6C63FF', fontWeight: '700' },

  menu:         { backgroundColor: '#F8F9FA', borderRadius: 18, marginHorizontal: 16, marginTop: 14, overflow: 'hidden' },
  menuItem:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14, gap: 12, borderBottomWidth: 0.5, borderBottomColor: '#EAEAEA' },
  menuIconWrap: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  menuIcon:     { fontSize: 16 },
  menuLabel:    { flex: 1, fontSize: 14, fontWeight: '500', color: '#1A1A2E' },
  menuArrow:    { fontSize: 20, color: '#CCC' },

  logoutBtn:  { marginHorizontal: 16, marginTop: 12, padding: 14, alignItems: 'center', backgroundColor: '#FFF0F0', borderRadius: 14, borderWidth: 1, borderColor: '#FFDDDD' },
  logoutText: { fontSize: 14, color: '#E24B4A', fontWeight: '700' },
});
