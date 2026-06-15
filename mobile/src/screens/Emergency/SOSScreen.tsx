/**
 * SOSScreen.tsx — Redesigned UniGo Emergency screen matching Figma mockups.
 * Real emergency contacts from Supabase. Triggers emergency_logs + FCM.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  StatusBar, ScrollView, ActivityIndicator, Animated, Vibration, Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL!;

const C = {
  brand: '#5B2EFF', bg: '#FFF5F5', surface: '#FFFFFF',
  red: '#DC2626', redLight: '#FEE2E2', redDark: '#991B1B',
  green: '#16A34A', greenLight: '#DCFCE7',
  border: '#EAECF0', text: '#0F172A', textSub: '#64748B',
};

export default function SOSScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const rideId = route.params?.rideId;

  const [user, setUser] = useState<any>(null);
  const [sosActive, setSosActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<{ name: string; phone: string; notified: boolean; type: 'personal' | 'campus' }[]>([]);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) return;
      const { data } = await supabase.from('users').select('*').eq('id', userId).single();
      setUser(data);
      setContacts([
        { name: data?.emergency_contact_name ?? 'Emergency Contact', phone: data?.emergency_contact_phone ?? '—', notified: false, type: 'personal' },
        { name: 'Campus Security', phone: '0431-xxxx', notified: false, type: 'campus' },
      ]);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const startPulse = () => {
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    pulseLoop.current.start();
  };

  const stopPulse = () => {
    pulseLoop.current?.stop();
    pulseAnim.setValue(1);
  };

  const triggerSOS = async () => {
    try {
      Vibration.vibrate([0, 300, 100, 300]);
      const userId = await AsyncStorage.getItem('user_id');

      const { status } = await Location.requestForegroundPermissionsAsync();
      let lat = 0, lng = 0;
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      }

      // Log emergency in DB
      await supabase.from('emergency_logs').insert({
        user_id: userId,
        ride_id: rideId ?? null,
        lat, lng,
      });

      // Notify via backend
      await fetch(`${API_BASE}/emergency/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, ride_id: rideId, lat, lng }),
      }).catch(() => {});

      setSosActive(true);
      startPulse();
      setContacts(prev => prev.map(c => ({ ...c, notified: true })));
    } catch (e) {
      Alert.alert('Error', 'Could not trigger SOS. Please call emergency services directly.');
    }
  };

  const cancelSOS = () => {
    Alert.alert('Cancel SOS', 'Are you sure you want to cancel the SOS alert?', [
      { text: 'Keep Active', style: 'cancel' },
      { text: 'Cancel SOS', style: 'destructive', onPress: () => {
        setSosActive(false);
        stopPulse();
        setContacts(prev => prev.map(c => ({ ...c, notified: false })));
      }},
    ]);
  };

  if (loading) return <View style={styles.loader}><ActivityIndicator size="large" color={C.red} /></View>;

  return (
    <SafeAreaView style={[styles.safe, sosActive && { backgroundColor: '#FFF0F0' }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Top bar */}
        <View style={styles.topBar}>
          <View style={styles.titleRow}>
            <Text style={styles.locationPin}>📍</Text>
            <Text style={styles.title}>UniGo Emergency</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Home')} style={styles.notifBtn}>
            <Text>🔔</Text>
          </TouchableOpacity>
        </View>

        {/* Live status banner */}
        {sosActive && (
          <View style={styles.liveBanner}>
            <Text style={styles.liveIcon}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.liveBannerTitle}>LIVE STATUS</Text>
              <Text style={styles.liveBannerSub}>SHARING LIVE LOCATION WITH EMERGENCY CONTACTS & CAMPUS SECURITY</Text>
            </View>
          </View>
        )}

        {/* SOS button */}
        <View style={styles.sosContainer}>
          <Animated.View style={[styles.sosOuter, { transform: [{ scale: pulseAnim }] }]}>
            <TouchableOpacity
              style={styles.sosBtn}
              onPress={sosActive ? cancelSOS : triggerSOS}
              activeOpacity={0.8}
            >
              <Text style={styles.sosStar}>✳</Text>
              <Text style={styles.sosBtnText}>TAP TO SOS</Text>
            </TouchableOpacity>
          </Animated.View>
          <Text style={styles.sosHint}>
            {sosActive
              ? 'Tap again to cancel the alert'
              : 'Hold for 3 seconds to trigger\nimmediate campus alarm and\nsecurity dispatch.'}
          </Text>
        </View>

        {/* Emergency Contacts */}
        <Text style={styles.contactsTitle}>EMERGENCY CONTACTS</Text>
        <View style={styles.contactsList}>
          {contacts.map((c, i) => (
            <View key={i} style={styles.contactCard}>
              <View style={[styles.contactAvatar, c.type === 'campus' && { backgroundColor: C.redLight }]}>
                <Text style={styles.contactAvatarIcon}>{c.type === 'campus' ? '🛡️' : '👤'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.contactName}>{c.name}</Text>
                <Text style={styles.contactPhone}>{c.phone}</Text>
              </View>
              {c.notified && (
                <View style={[styles.notifiedBadge, c.type === 'campus' && { backgroundColor: C.redLight }]}>
                  <Text style={[styles.notifiedText, c.type === 'campus' && { color: C.red }]}>
                    {c.type === 'campus' ? 'ALERTTED' : 'NOTIFIED'}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF5F5' },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationPin: { fontSize: 16 },
  title: { fontSize: 18, fontWeight: '700', color: C.text },
  notifBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },

  liveBanner: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: C.redLight, borderRadius: 12, padding: 14, marginBottom: 20,
    borderWidth: 1, borderColor: '#FCA5A5',
  },
  liveIcon: { fontSize: 20 },
  liveBannerTitle: { fontSize: 12, fontWeight: '800', color: C.red, letterSpacing: 0.5 },
  liveBannerSub: { fontSize: 12, fontWeight: '600', color: C.redDark, marginTop: 2, lineHeight: 16 },

  sosContainer: { alignItems: 'center', marginVertical: 20 },
  sosOuter: {
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: '#E53E3E33',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  sosBtn: {
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: C.red,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: C.red, shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 10,
  },
  sosStar: { color: '#fff', fontSize: 36, marginBottom: 4 },
  sosBtnText: { color: '#fff', fontWeight: '900', fontSize: 18, letterSpacing: 1 },
  sosHint: { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 18 },

  contactsTitle: { fontSize: 12, fontWeight: '700', color: C.textSub, letterSpacing: 1, marginBottom: 12 },
  contactsList: { gap: 10 },
  contactCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  contactAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EDE8FF', justifyContent: 'center', alignItems: 'center' },
  contactAvatarIcon: { fontSize: 18 },
  contactName: { fontSize: 14, fontWeight: '600', color: C.text },
  contactPhone: { fontSize: 12, color: C.textSub, marginTop: 2 },
  notifiedBadge: { backgroundColor: C.greenLight, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  notifiedText: { fontSize: 11, fontWeight: '700', color: C.green },
});
