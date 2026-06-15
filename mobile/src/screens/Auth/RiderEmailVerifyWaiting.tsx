/**
 * RiderEmailVerifyWaiting — waits for the rider to click their email link.
 * Replaces RiderOTPVerifyScreen. Polls the backend every 4 s.
 * On success:
 *   - existing user → setSession → RootNavigator routes to App/Onboarding
 *   - new user      → navigate to RiderProfileSetup
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { Colors } from '../../constants/colors';
import {
  checkRiderEmailVerified,
  resendRiderEmailVerification,
} from '../../services/authService';
import { useAuth } from '../../context/AuthContext';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'RiderEmailVerifyWaiting'>;
type Route = RouteProp<AuthStackParamList, 'RiderEmailVerifyWaiting'>;

const POLL_INTERVAL_MS = 4000;

export default function RiderEmailVerifyWaiting() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { email } = route.params;
  const { setSession } = useAuth();

  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const handleVerified = useCallback(
    (result: { is_new_user: boolean; user: any; communities: any[]; driver_profile: any; idToken: string; firebase_uid: string }) => {
      stopPolling();
      if (!result.is_new_user && result.user) {
        setSession(result.user, result.communities, result.driver_profile);
      } else {
        navigation.navigate('RiderProfileSetup', {
          idToken: result.idToken,
          firebase_uid: result.firebase_uid,
          email,
        });
      }
    },
    [email, navigation, setSession],
  );

  const poll = useCallback(async () => {
    if (!mountedRef.current) return;
    try {
      const result = await checkRiderEmailVerified(email);
      if (result.verified && mountedRef.current) {
        handleVerified(result);
      }
    } catch {
      // silent — keep polling
    }
  }, [email, handleVerified]);

  useEffect(() => {
    mountedRef.current = true;
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [poll]);

  // Resend cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleManualCheck = async () => {
    setChecking(true);
    try {
      const result = await checkRiderEmailVerified(email);
      if (result.verified) {
        handleVerified(result);
      } else {
        Alert.alert('Not verified yet', 'Please click the link in your email and try again.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not check verification status.');
    } finally {
      if (mountedRef.current) setChecking(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await resendRiderEmailVerification(email);
      setResendCooldown(30);
      Alert.alert('Email sent', 'A new verification link has been sent.');
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to resend email.');
    } finally {
      if (mountedRef.current) setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.back} onPress={() => { stopPolling(); navigation.goBack(); }}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.icon}>📧</Text>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.sub}>
            We sent a verification link to{'\n'}
            <Text style={styles.email}>{email}</Text>
          </Text>
        </View>

        <View style={styles.steps}>
          <View style={styles.step}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>1</Text></View>
            <Text style={styles.stepText}>Open the email we sent you</Text>
          </View>
          <View style={styles.step}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>2</Text></View>
            <Text style={styles.stepText}>Tap the <Text style={styles.bold}>Verify Email</Text> link</Text>
          </View>
          <View style={styles.step}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>3</Text></View>
            <Text style={styles.stepText}>Come back here — we'll log you in automatically</Text>
          </View>
        </View>

        <View style={styles.pollingRow}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.pollingText}>Waiting for verification…</Text>
        </View>

        <TouchableOpacity
          style={[styles.btn, checking && styles.btnDisabled]}
          onPress={handleManualCheck}
          disabled={checking}
          activeOpacity={0.85}
        >
          {checking
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>I've verified my email</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.resendBtn, (resending || resendCooldown > 0) && styles.resendBtnDisabled]}
          onPress={handleResend}
          disabled={resending || resendCooldown > 0}
          activeOpacity={0.7}
        >
          {resending
            ? <ActivityIndicator size="small" color={Colors.primary} />
            : <Text style={styles.resendText}>
                {resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : 'Resend verification email'}
              </Text>
          }
        </TouchableOpacity>

        <Text style={styles.note}>
          Check your spam folder if you don't see the email.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 },
  back: { marginBottom: 32 },
  backText: { fontSize: 17, color: Colors.primary, fontWeight: '600' },
  header: { alignItems: 'center', marginBottom: 36 },
  icon: { fontSize: 56, marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
  sub: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  email: { fontWeight: '700', color: Colors.textPrimary },
  steps: { gap: 16, marginBottom: 32 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepNum: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  stepNumText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  stepText: { fontSize: 15, color: Colors.textPrimary, flex: 1 },
  bold: { fontWeight: '700' },
  pollingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginBottom: 28,
  },
  pollingText: { fontSize: 13, color: Colors.textSecondary },
  btn: {
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
    marginBottom: 14,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  resendBtn: { alignItems: 'center', paddingVertical: 12 },
  resendBtnDisabled: { opacity: 0.45 },
  resendText: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  note: { textAlign: 'center', fontSize: 12, color: Colors.textMuted, marginTop: 20, lineHeight: 17 },
});