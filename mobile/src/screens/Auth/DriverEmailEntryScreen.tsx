/**
 * DriverEmailEntryScreen — email entry for driver signup/login.
 * Sends a verification link then navigates to DriverEmailVerifyWaiting.
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { Colors } from '../../constants/colors';
import { sendDriverEmailVerification } from '../../services/authService';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'DriverEmailEntry'>;

export default function DriverEmailEntryScreen() {
  const navigation = useNavigation<Nav>();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const isValidEmail = (val: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());

  const handleSend = async () => {
    if (!isValidEmail(email)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    try {
      setLoading(true);
      await sendDriverEmailVerification({ email: email.trim().toLowerCase() });
      navigation.navigate('DriverEmailVerifyWaiting', {
        email: email.trim().toLowerCase(),
      });
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to send verification email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.container}>
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.icon}>🏎️</Text>
            <Text style={styles.title}>Continue as Driver</Text>
            <Text style={styles.sub}>Enter your email to get started</Text>
          </View>

          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={Colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />

          <TouchableOpacity
            style={[styles.btn, (loading || !isValidEmail(email)) && styles.btnDisabled]}
            onPress={handleSend}
            disabled={loading || !isValidEmail(email)}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Send Verification Email</Text>
            }
          </TouchableOpacity>

          <Text style={styles.note}>
            We'll send a verification link to your email. No SMS charges.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  kav: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 },
  back: { marginBottom: 32 },
  backText: { fontSize: 17, color: Colors.primary, fontWeight: '600' },
  header: { alignItems: 'center', marginBottom: 40 },
  icon: { fontSize: 48, marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6 },
  sub: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center' },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.textPrimary,
    marginBottom: 24,
  },
  btn: {
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  note: { textAlign: 'center', fontSize: 13, color: Colors.textMuted, marginTop: 16, lineHeight: 18 },
});