/**
 * EntryScreen — first screen shown when no active session exists.
 * Three entry paths: Rider, Driver, Admin.
 */
import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { Colors } from '../../constants/colors';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Entry'>;

export default function EntryScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Logo / Brand */}
        <View style={styles.brand}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>U</Text>
          </View>
          <Text style={styles.appName}>UniGo</Text>
          <Text style={styles.tagline}>Trusted rides within your community</Text>
        </View>

        {/* Path cards */}
        <View style={styles.cards}>
          <TouchableOpacity
            style={[styles.card, styles.cardRider]}
            onPress={() => navigation.navigate('RiderEmailEntry')}
            activeOpacity={0.85}
          >
            <Text style={styles.cardIcon}>🚗</Text>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Continue as Rider</Text>
              <Text style={styles.cardSub}>Find rides in your TrustCircle</Text>
            </View>
            <Text style={styles.cardArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.card, styles.cardDriver]}
            onPress={() => navigation.navigate('DriverPhoneEntry')}
            activeOpacity={0.85}
          >
            <Text style={styles.cardIcon}>🏎️</Text>
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, { color: '#fff' }]}>Continue as Driver</Text>
              <Text style={[styles.cardSub, { color: 'rgba(255,255,255,0.8)' }]}>Offer rides and earn together</Text>
            </View>
            <Text style={[styles.cardArrow, { color: 'rgba(255,255,255,0.7)' }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.card, styles.cardAdmin]}
            onPress={() => navigation.navigate('AdminSignIn')}
            activeOpacity={0.85}
          >
            <Text style={styles.cardIcon}>🔐</Text>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Admin Sign In</Text>
              <Text style={styles.cardSub}>Document review &amp; management</Text>
            </View>
            <Text style={styles.cardArrow}>›</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          By continuing you agree to our{' '}
          <Text style={styles.footerLink}>Terms</Text> &amp;{' '}
          <Text style={styles.footerLink}>Privacy Policy</Text>
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: {
    flex: 1, paddingHorizontal: 24, justifyContent: 'space-between',
    paddingTop: 56, paddingBottom: 32,
  },
  brand: { alignItems: 'center', gap: 8 },
  logoCircle: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center', marginBottom: 4,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35, shadowRadius: 16, elevation: 8,
  },
  logoText: { fontSize: 36, fontWeight: '800', color: '#fff' },
  appName: { fontSize: 32, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5 },
  tagline: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center' },
  cards: { gap: 14 },
  card: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  cardRider: { backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.primary },
  cardDriver: { backgroundColor: Colors.primary },
  cardAdmin: { backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border },
  cardIcon: { fontSize: 28, marginRight: 14 },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  cardSub: { fontSize: 13, color: Colors.textSecondary },
  cardArrow: { fontSize: 22, color: Colors.textMuted, fontWeight: '300' },
  footer: { textAlign: 'center', fontSize: 12, color: Colors.textMuted, lineHeight: 18 },
  footerLink: { color: Colors.primary, fontWeight: '600' },
});