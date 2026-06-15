/**
 * OrgVerifyScreen — Organisation trust layer.
 *
 * Flow:
 *   1. User enters an org/work/college email (different from their login email).
 *   2. Backend sends a Firebase verification link to that email.
 *   3. User clicks the link in their inbox.
 *   4. We poll the backend until Firebase shows it as verified.
 *   5. Backend calls Hunter.io to confirm the domain belongs to a real organisation.
 *   6. User is added to that org's community pool.
 *      They can repeat to join multiple organisations.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../navigation/types';
import { Colors } from '../../constants/colors';
import { api } from '../../services/api';
import { communityService } from '../../services/communityService';
import { useAuth } from '../../context/AuthContext';

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'OrgVerify'>;

type Step = 'input' | 'waiting' | 'hunter_checking' | 'done';

interface JoinedOrg {
  email: string;
  orgName: string;
}

const POLL_INTERVAL_MS = 4000;
const PERSONAL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
  'icloud.com', 'protonmail.com', 'ymail.com', 'live.com',
  'yahoo.in', 'rediffmail.com',
];

const isValidEmail = (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());

export default function OrgVerifyScreen() {
  const navigation = useNavigation<Nav>();
  const { user, communities, setSession } = useAuth();

  const [email, setEmail] = useState('');
  const [step, setStep] = useState<Step>('input');
  const [sending, setSending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [joinedOrgs, setJoinedOrgs] = useState<JoinedOrg[]>([]);
  const [statusMsg, setStatusMsg] = useState('');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const currentEmailRef = useRef('');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  // Step 1: Validate + send verification email
  const handleSendVerification = async () => {
    if (!isValidEmail(email)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    const trimmed = email.trim().toLowerCase();
    const domain = trimmed.split('@')[1] ?? '';

    if (PERSONAL_DOMAINS.includes(domain)) {
      Alert.alert(
        'Personal email',
        'Please enter your organisation or college email address, not a personal one like Gmail or Yahoo.',
      );
      return;
    }

    setSending(true);
    try {
      await api.post('/auth/org/send-email-verification', { email: trimmed });
      currentEmailRef.current = trimmed;
      setStep('waiting');
      setResendCooldown(30);
      startPolling(trimmed);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to send verification email. Please try again.');
    } finally {
      if (mountedRef.current) setSending(false);
    }
  };

  // Step 2: Poll for email click
  const startPolling = (emailToCheck: string) => {
    stopPolling();
    pollRef.current = setInterval(() => pollVerification(emailToCheck), POLL_INTERVAL_MS);
  };

  const pollVerification = useCallback(async (emailToCheck: string) => {
    if (!mountedRef.current) return;
    try {
      const res = await api.post<any>('/auth/org/check-email-verified', { email: emailToCheck });
      if (res.verified && mountedRef.current) {
        stopPolling();
        await proceedToHunter(emailToCheck);
      }
    } catch {
      // silent — keep polling
    }
  }, []);

  const handleManualCheck = async () => {
    const emailToCheck = currentEmailRef.current;
    try {
      const res = await api.post<any>('/auth/org/check-email-verified', { email: emailToCheck });
      if (res.verified) {
        stopPolling();
        await proceedToHunter(emailToCheck);
      } else {
        Alert.alert('Not verified yet', 'Please click the verification link in your email first, then try again.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not check verification status.');
    }
  };

  // Step 3: Hunter domain check + join org community
  const proceedToHunter = async (verifiedEmail: string) => {
    if (!mountedRef.current) return;
    setStep('hunter_checking');
    setStatusMsg('Checking organisation domain…');

    try {
      const hunterRes = await api.post<{
        valid: boolean;
        org_name: string;
        org_type: string;
        domain: string;
        message?: string;
      }>('/community/verify-org-email', { email: verifiedEmail });

      if (!hunterRes.valid) {
        if (mountedRef.current) {
          setStep('input');
          Alert.alert(
            'Domain not recognised',
            hunterRes.message ??
              'We could not confirm this as an organisation email. Please try a work or college email address.',
          );
        }
        return;
      }

      if (mountedRef.current) setStatusMsg(`Joining ${hunterRes.org_name} pool…`);

      const res = await communityService.joinOrCreate({
        name: hunterRes.org_name,
        type: hunterRes.org_type,
        verification_domain: hunterRes.domain,
        trust_layer: 'organisation',
      });

      if (mountedRef.current) {
        setJoinedOrgs((prev) => [...prev, { email: verifiedEmail, orgName: hunterRes.org_name }]);
        setSession(user!, [...communities, res.community]);
        setStep('done');
        setEmail('');
      }
    } catch (err: any) {
      if (mountedRef.current) {
        if (err?.message?.includes('Already a member')) {
          setStep('done');
          setEmail('');
        } else {
          setStep('input');
          Alert.alert('Could not join', err?.message ?? 'Organisation join failed. Please try again.');
        }
      }
    }
  };

  const handleResend = async () => {
    const emailToCheck = currentEmailRef.current;
    try {
      await api.post('/auth/org/send-email-verification', { email: emailToCheck });
      setResendCooldown(30);
      Alert.alert('Sent!', 'A new verification link has been sent.');
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to resend email.');
    }
  };

  const handleAddAnother = () => {
    setStep('input');
    setEmail('');
    setStatusMsg('');
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={s.back} onPress={() => { stopPolling(); navigation.goBack(); }}>
            <Text style={s.backText}>‹ Back</Text>
          </TouchableOpacity>

          <View style={s.header}>
            <Text style={s.emoji}>🎓</Text>
            <Text style={s.title}>Organisation Verification</Text>
            <Text style={s.subtitle}>
              Enter your work or college email. We'll send a verification link, then confirm the
              domain belongs to a real organisation using Hunter.io. You can verify multiple organisations.
            </Text>
          </View>

          {/* Already joined orgs */}
          {joinedOrgs.length > 0 && (
            <View style={s.joinedList}>
              {joinedOrgs.map((org, i) => (
                <View key={i} style={s.joinedItem}>
                  <Text style={s.joinedIcon}>✅</Text>
                  <View>
                    <Text style={s.joinedOrgName}>{org.orgName}</Text>
                    <Text style={s.joinedEmail}>{org.email}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ── STEP: input ── */}
          {step === 'input' && (
            <View style={s.card}>
              <Text style={s.cardLabel}>
                {joinedOrgs.length > 0 ? 'Add another organisation email' : 'Your organisation or college email'}
              </Text>
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@yourcompany.com or you@college.edu"
                placeholderTextColor={Colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus={joinedOrgs.length === 0}
              />
              <Text style={s.inputHint}>
                Don't use Gmail, Yahoo, or other personal email addresses here.
              </Text>
              <TouchableOpacity
                style={[s.btn, { backgroundColor: Colors.primary }, (!isValidEmail(email) || sending) && s.btnDisabled]}
                onPress={handleSendVerification}
                disabled={!isValidEmail(email) || sending}
              >
                {sending
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnText}>Send Verification Email</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP: waiting ── */}
          {step === 'waiting' && (
            <View style={s.card}>
              <Text style={s.waitIcon}>📧</Text>
              <Text style={s.waitTitle}>Check your email</Text>
              <Text style={s.waitSub}>
                We sent a verification link to{'\n'}
                <Text style={s.highlight}>{currentEmailRef.current}</Text>
              </Text>

              <View style={s.steps}>
                {[
                  'Open the email we sent you',
                  'Tap the "Verify Email" link',
                  'Come back here — we\'ll detect it automatically',
                ].map((st, i) => (
                  <View key={i} style={s.stepRow}>
                    <View style={s.stepNum}><Text style={s.stepNumText}>{i + 1}</Text></View>
                    <Text style={s.stepText}>{st}</Text>
                  </View>
                ))}
              </View>

              <View style={s.pollingRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={s.pollingText}>Waiting for verification…</Text>
              </View>

              <TouchableOpacity style={[s.btn, { backgroundColor: Colors.primary }]} onPress={handleManualCheck}>
                <Text style={s.btnText}>I've clicked the link ✓</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.resendBtn, resendCooldown > 0 && s.btnDisabled]}
                onPress={handleResend}
                disabled={resendCooldown > 0}
              >
                <Text style={s.resendText}>
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend verification email'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.changeEmailBtn} onPress={() => { stopPolling(); setStep('input'); }}>
                <Text style={s.changeEmailText}>← Use a different email</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP: Hunter checking ── */}
          {step === 'hunter_checking' && (
            <View style={[s.card, s.centreCard]}>
              <ActivityIndicator size="large" color={Colors.primary} style={{ marginBottom: 16 }} />
              <Text style={s.waitTitle}>Verifying organisation…</Text>
              <Text style={s.waitSub}>{statusMsg}</Text>
            </View>
          )}

          {/* ── STEP: done ── */}
          {step === 'done' && (
            <View style={[s.card, s.centreCard]}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🎉</Text>
              <Text style={s.waitTitle}>Organisation joined!</Text>
              <Text style={s.waitSub}>
                You're now in the{' '}
                <Text style={{ fontWeight: '800', color: Colors.primary }}>
                  {joinedOrgs[joinedOrgs.length - 1]?.orgName}
                </Text>{' '}
                carpool pool.
              </Text>

              <TouchableOpacity
                style={[s.btn, { backgroundColor: Colors.primary, marginTop: 20 }]}
                onPress={handleAddAnother}
              >
                <Text style={s.btnText}>+ Add another organisation</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.btn, { backgroundColor: Colors.success, marginTop: 10 }]}
                onPress={() => navigation.goBack()}
              >
                <Text style={s.btnText}>Done →</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 56 },

  back: { marginBottom: 20 },
  backText: { fontSize: 17, color: Colors.primary, fontWeight: '600' },

  header: { marginBottom: 24 },
  emoji: { fontSize: 40, marginBottom: 10 },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },

  joinedList: { marginBottom: 16 },
  joinedItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F0FDF4', borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  joinedIcon: { fontSize: 20 },
  joinedOrgName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  joinedEmail: { fontSize: 12, color: Colors.textSecondary },

  card: {
    backgroundColor: Colors.surface, borderRadius: 16,
    padding: 20, borderWidth: 1, borderColor: Colors.border, marginBottom: 16,
  },
  centreCard: { alignItems: 'center' },
  cardLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8 },

  input: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: Colors.textPrimary, backgroundColor: Colors.background,
    marginBottom: 6,
  },
  inputHint: { fontSize: 12, color: Colors.textMuted, marginBottom: 16 },

  btn: {
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    backgroundColor: Colors.primary, width: '100%',
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.4 },

  waitIcon: { fontSize: 44, textAlign: 'center', marginBottom: 12 },
  waitTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6, textAlign: 'center' },
  waitSub: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  highlight: { fontWeight: '700', color: Colors.textPrimary },

  steps: { gap: 12, marginBottom: 20, width: '100%' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepNum: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  stepNumText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  stepText: { fontSize: 14, color: Colors.textPrimary, flex: 1 },

  pollingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginBottom: 20,
  },
  pollingText: { fontSize: 13, color: Colors.textSecondary },

  resendBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  resendText: { fontSize: 14, color: Colors.primary, fontWeight: '600' },

  changeEmailBtn: { paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  changeEmailText: { fontSize: 13, color: Colors.textMuted },
});