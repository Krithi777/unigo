/**
 * JoinCommunityScreen — Trust Circle onboarding landing page.
 *
 * Shows three tiles:
 *   Row 1: [Organisation] [Neighbourhood]
 *   Row 2: [TrustCircle / Invite Code] (centred)
 *
 * Each tile navigates to its own dedicated screen.
 */
import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../navigation/types';
import { Colors } from '../../constants/colors';

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'JoinCommunity'>;

const TILES = [
  {
    key: 'OrgVerify' as keyof OnboardingStackParamList,
    emoji: '🎓',
    title: 'Organisation',
    subtitle: 'Verify your work or college email to join your institution\'s pool',
    badge: 'Strongest trust',
    badgeBg: Colors.primaryLight,
    badgeColor: Colors.primary,
    borderColor: Colors.primary,
  },
  {
    key: 'Neighbourhood' as keyof OnboardingStackParamList,
    emoji: '📍',
    title: 'Neighbourhood',
    subtitle: 'Enter your area and confirm with GPS to join your locality pool',
    badge: 'GPS confirmed',
    badgeBg: '#DCFCE7',
    badgeColor: '#166534',
    borderColor: Colors.success,
  },
  {
    key: 'TrustCircle' as keyof OnboardingStackParamList,
    emoji: '👥',
    title: 'TrustCircle',
    subtitle: 'Have an invite code? Join a private circle — or create your own',
    badge: 'Private group',
    badgeBg: '#FEF3C7',
    badgeColor: '#92400E',
    borderColor: Colors.warning,
  },
];

export default function JoinCommunityScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.header}>
          <Text style={s.title}>Join Your Communities</Text>
          <Text style={s.subtitle}>
            Choose who you want to carpool with. Each layer you join expands your
            matching pool. You need at least one to continue.
          </Text>
        </View>

        {/* Row 1: Organisation + Neighbourhood side by side */}
        <View style={s.row}>
          {TILES.slice(0, 2).map((tile) => (
            <TouchableOpacity
              key={tile.key}
              style={[s.tile, { borderColor: tile.borderColor }]}
              onPress={() => navigation.navigate(tile.key as any)}
              activeOpacity={0.82}
            >
              <Text style={s.tileEmoji}>{tile.emoji}</Text>
              <Text style={s.tileTitle}>{tile.title}</Text>
              <Text style={s.tileSub}>{tile.subtitle}</Text>
              <View style={[s.badge, { backgroundColor: tile.badgeBg }]}>
                <Text style={[s.badgeText, { color: tile.badgeColor }]}>{tile.badge}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Row 2: TrustCircle centred */}
        <View style={s.centreRow}>
          <TouchableOpacity
            style={[s.tile, s.tileCentre, { borderColor: TILES[2].borderColor }]}
            onPress={() => navigation.navigate('TrustCircle' as any)}
            activeOpacity={0.82}
          >
            <Text style={s.tileEmoji}>{TILES[2].emoji}</Text>
            <Text style={s.tileTitle}>{TILES[2].title}</Text>
            <Text style={[s.tileSub, { textAlign: 'center' }]}>{TILES[2].subtitle}</Text>
            <View style={[s.badge, { backgroundColor: TILES[2].badgeBg }]}>
              <Text style={[s.badgeText, { color: TILES[2].badgeColor }]}>{TILES[2].badge}</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={s.footnote}>
          You can join multiple communities and add more any time from your Profile.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 20, paddingTop: 32, paddingBottom: 56 },

  header: { marginBottom: 28 },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },

  row: { flexDirection: 'row', gap: 14, marginBottom: 14 },

  tile: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1.5,
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  tileCentre: {
    alignItems: 'center',
    width: '55%',
  },
  centreRow: {
    alignItems: 'center',
    marginBottom: 28,
  },

  tileEmoji: { fontSize: 32, marginBottom: 10 },
  tileTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6 },
  tileSub: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: 14, flex: 1 },

  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },

  footnote: {
    textAlign: 'center', fontSize: 12, color: Colors.textMuted, lineHeight: 17,
  },
});