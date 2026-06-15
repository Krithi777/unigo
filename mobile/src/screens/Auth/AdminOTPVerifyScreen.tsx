// mobile/src/screens/Auth/AdminOTPVerifyScreen.tsx
//
// Verifies the OTP for admin sign-in.
// After OTP success, calls /auth/admin/check to confirm the phone is allowlisted.
// On success → setSession (RootNavigator routes to AdminDashboard via isAdmin flag).

import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { Colors } from '../../constants/colors';
import { verifyPhoneOTP, checkAdminAllowlist } from '../../services/authService';
import { useAuth } from '../../context/AuthContext';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'AdminOTPVerify'>;
type Route = RouteProp<AuthStackParamList, 'AdminOTPVerify'>;

export default function AdminOTPVerifyScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { phone } = route.params;
  const { setSession } = useAuth();

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (otp.length !== 6) {
      Alert.alert('Enter 6-digit OTP', 'Please enter the complete code.');
      return;
    }
    try {
      setLoading(true);

      // 1. Verify OTP (backend checks allowlist during verify-phone-otp for admin role)
      const result = await verifyPhoneOTP({ phone, otp, entry_role: 'admin' });

      if (!result.is_admin) {
        Alert.alert(
          'Access Denied',
          'Your phone number is not on the admin allowlist.',
        );
        return;
      }

      // 2. Set session — RootNavigator will route to AdminDashboard via isAdmin
      setSession(result.user, result.communities ?? []);
    } catch (err: any) {
      Alert.alert('Verification failed', err?.message ?? 'Invalid OTP or access denied.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <Text style={styles.icon}>🔐</Text>
          </View>
          <Text style={styles.title}>Admin Verification</Text>
          <Text style={styles.sub}>
            Enter the code sent to{'\n'}
            <Text style={styles.phone}>{phone}</Text>
          </Text>
        </View>

        <TextInput
          style={styles.otpInput}
          value={otp}
          onChangeText={setOtp}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="------"
          placeholderTextColor={Colors.textMuted}
          autoFocus
          textAlign="center"
        />

        <TouchableOpacity
          style={[styles.btn, (loading || otp.length < 6) && styles.btnDisabled]}
          onPress={handleVerify}
          disabled={loading || otp.length < 6}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Verify & Sign In</Text>
          }
        </TouchableOpacity>

        <View style={styles.warning}>
          <Text style={styles.warningText}>⚠️ Unauthorized access attempts are logged.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 },
  back: { marginBottom: 32 },
  backText: { fontSize: 17, color: Colors.primary, fontWeight: '600' },
  header: { alignItems: 'center', marginBottom: 40 },
  iconWrap: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#1A1A2E',
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  icon: { fontSize: 32 },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
  sub: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  phone: { fontWeight: '700', color: Colors.textPrimary },
  otpInput: {
    fontSize: 32, fontWeight: '700', letterSpacing: 12,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: 16, paddingVertical: 18, paddingHorizontal: 24,
    color: Colors.textPrimary, marginBottom: 28,
  },
  btn: {
    backgroundColor: '#1A1A2E', borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3,
    shadowRadius: 12, elevation: 6,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  warning: {
    marginTop: 'auto', backgroundColor: '#FFF9E6', borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: Colors.warning,
  },
  warningText: { fontSize: 12, color: Colors.warning, textAlign: 'center', fontWeight: '600' },
});