/**
 * AdminSignInScreen — email + password login (credentials stored in DB).
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
import { adminLogin } from '../../services/authService';
import { useAuth } from '../../context/AuthContext';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'AdminSignIn'>;

export default function AdminSignInScreen() {
  const navigation = useNavigation<Nav>();
  const { setSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const isValidEmail = (val: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());

  const handleLogin = async () => {
    if (!isValidEmail(email)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (!password) {
      Alert.alert('Password required', 'Please enter your password.');
      return;
    }
    try {
      setLoading(true);
      const result = await adminLogin(email.trim().toLowerCase(), password);
      if (!result.is_admin || !result.user) {
        Alert.alert('Access denied', 'This account is not an admin.');
        return;
      }
      setSession(result.user, result.communities, result.driver_profile);
    } catch (err: any) {
      Alert.alert('Login failed', err?.message ?? 'Invalid email or password.');
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
            <View style={styles.iconWrap}>
              <Text style={styles.icon}>🔐</Text>
            </View>
            <Text style={styles.title}>Admin Sign In</Text>
            <Text style={styles.sub}>Restricted access. Sign in with your admin credentials.</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="admin@unigo.app"
              placeholderTextColor={Colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity
            style={[styles.btn, (loading || !isValidEmail(email) || !password) && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading || !isValidEmail(email) || !password}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Sign In</Text>}
          </TouchableOpacity>

          <View style={styles.warning}>
            <Text style={styles.warningText}>⚠️ Unauthorized access attempts are logged.</Text>
          </View>
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
  iconWrap: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#1A1A2E',
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  icon: { fontSize: 32 },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6 },
  sub: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  field: { marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 17, color: Colors.textPrimary,
  },
  btn: {
    backgroundColor: '#1A1A2E', borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  warning: {
    marginTop: 'auto', backgroundColor: '#FFF9E6', borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: Colors.warning,
  },
  warningText: { fontSize: 12, color: Colors.warning, textAlign: 'center', fontWeight: '600' },
});