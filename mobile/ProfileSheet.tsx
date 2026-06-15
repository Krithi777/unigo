import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, ScrollView
} from 'react-native';
import ReliabilityScore from './ReliabilityScore';
import EmergencyContact from './EmergencyContact';

interface Props {
  visible: boolean;
  onClose: () => void;
  userName?: string;
}

export default function ProfileSheet({ visible, onClose, userName = 'Ruvanthika' }: Props) {
  const [showScore, setShowScore] = useState(false);
  const [showEmergency, setShowEmergency] = useState(false);

  const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  if (showScore) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
        <ReliabilityScore
          onBack={() => setShowScore(false)}
          userName={userName}
        />
      </Modal>
    );
  }

  if (showEmergency) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
        <EmergencyContact onBack={() => setShowEmergency(false)} />
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />

      <View style={styles.sheet}>
        {/* Handle bar */}
        <View style={styles.handle} />

        {/* ── Hero section ── */}
        <View style={styles.heroBanner}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>
          <Text style={styles.heroName}>{userName}</Text>
          <View style={styles.roleRow}>
            <View style={styles.rolePill}>
              <Text style={styles.rolePillText}>🧑‍💼 Rider</Text>
            </View>
          </View>
        </View>

        {/* ── Score Banner ── */}
        <TouchableOpacity style={styles.scoreBanner} onPress={() => setShowScore(true)} activeOpacity={0.85}>
          <View style={styles.scoreBannerLeft}>
            <Text style={styles.scoreLabelTop}>RELIABILITY SCORE</Text>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreNumber}>92</Text>
              <Text style={styles.scoreMax}>/100</Text>
            </View>
            <View style={styles.tierBadge}>
              <Text style={styles.tierEmoji}>🥇</Text>
              <Text style={styles.tierText}>Gold Rider · Top 8%</Text>
            </View>
          </View>

          {/* Mini bar chart preview */}
          <View style={styles.scoreBannerRight}>
            <View style={styles.miniChart}>
              {[70, 78, 72, 82, 85, 88, 90, 92].map((v, i) => (
                <View key={i} style={styles.miniBarWrap}>
                  <View style={[
                    styles.miniBar,
                    {
                      height: `${((v - 60) / 40) * 100}%`,
                      backgroundColor: i === 7 ? '#1A73E8' : '#BDDAFF',
                    }
                  ]} />
                </View>
              ))}
            </View>
            <View style={styles.tapHintRow}>
              <Text style={styles.tapHintText}>Full report</Text>
              <Text style={styles.chevron}>›</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* ── Menu ── */}
        <View style={styles.menu}>
          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
            <View style={styles.menuIconWrap}>
              <Text style={styles.menuIcon}>👤</Text>
            </View>
            <Text style={styles.menuLabel}>Edit profile</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.7}
            onPress={() => setShowEmergency(true)}>
            <View style={styles.menuIconWrap}>
              <Text style={styles.menuIcon}>📞</Text>
            </View>
            <Text style={styles.menuLabel}>Emergency contact</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
            <View style={styles.menuIconWrap}>
              <Text style={styles.menuIcon}>🕐</Text>
            </View>
            <Text style={styles.menuLabel}>My ride history</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} activeOpacity={0.7}>
            <View style={styles.menuIconWrap}>
              <Text style={styles.menuIcon}>🚩</Text>
            </View>
            <Text style={[styles.menuLabel, { color: '#E24B4A' }]}>Report an issue</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* ── Logout ── */}
        <TouchableOpacity style={styles.logoutBtn} onPress={onClose} activeOpacity={0.8}>
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>

        <View style={{ height: 24 }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#DDE3EE',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 0,
  },
  heroBanner: {
    backgroundColor: '#1A1A2E',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 22,
    paddingHorizontal: 20,
  },
  avatarRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2.5,
    borderColor: '#1A73E8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#1A73E8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  heroName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
    marginBottom: 10,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  rolePill: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  rolePillText: {
    fontSize: 12,
    color: '#C8D8F8',
    fontWeight: '500',
  },
  scoreBanner: {
    backgroundColor: '#EEF4FF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C8DCFF',
  },
  scoreBannerLeft: {
    flex: 1,
  },
  scoreLabelTop: {
    fontSize: 9,
    color: '#4A7DC4',
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  scoreNumber: {
    fontSize: 36,
    fontWeight: '900',
    color: '#1A73E8',
    lineHeight: 40,
  },
  scoreMax: {
    fontSize: 14,
    color: '#7CA8E0',
    fontWeight: '500',
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  tierEmoji: {
    fontSize: 14,
  },
  tierText: {
    fontSize: 12,
    color: '#9A7500',
    fontWeight: '700',
  },
  scoreBannerRight: {
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
  },
  miniChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 36,
    gap: 3,
  },
  miniBarWrap: {
    width: 6,
    height: 36,
    justifyContent: 'flex-end',
  },
  miniBar: {
    width: 6,
    borderRadius: 2,
  },
  tapHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  tapHintText: {
    fontSize: 10,
    color: '#1A73E8',
    fontWeight: '600',
  },
  chevron: {
    fontSize: 16,
    color: '#1A73E8',
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#F8FAFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8EEFF',
    overflow: 'hidden',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRightWidth: 1,
    borderRightColor: '#E8EEFF',
  },
  statIcon: { fontSize: 18, marginBottom: 3 },
  statValue: { fontSize: 15, fontWeight: '800', color: '#1A1A2E' },
  statLabel: { fontSize: 10, color: '#888', marginTop: 2, fontWeight: '500' },
  menu: {
    backgroundColor: '#F8F9FA',
    borderRadius: 18,
    marginHorizontal: 16,
    marginTop: 14,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#EAEAEA',
  },
  menuIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  menuIcon: { fontSize: 16 },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: '500' },
  menuArrow: { fontSize: 20, color: '#CCC' },
  logoutBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    alignItems: 'center',
    backgroundColor: '#FFF0F0',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FFDDDD',
  },
  logoutText: { fontSize: 14, color: '#E24B4A', fontWeight: '700' },
});