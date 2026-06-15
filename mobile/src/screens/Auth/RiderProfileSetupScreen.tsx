/**
 * RiderProfileSetupScreen — name + gender for new rider.
 * Route params: idToken, firebase_uid, email (email-based flow, no phone)
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { Colors } from '../../constants/colors';
import { completeRiderProfile } from '../../services/authService';
import { useAuth } from '../../context/AuthContext';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'RiderProfileSetup'>;
type RouteProps = RouteProp<AuthStackParamList, 'RiderProfileSetup'>;
type Gender = 'male' | 'female' | 'other';

const GENDERS: { value: Gender; label: string; icon: string }[] = [
  { value: 'male', label: 'Male', icon: '👨' },
  { value: 'female', label: 'Female', icon: '👩' },
  { value: 'other', label: 'Other', icon: '🧑' },
];

export default function RiderProfileSetupScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProps>();
  const { idToken, firebase_uid, email } = route.params;
  const { setSession } = useAuth();

  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) { Alert.alert('Name required', 'Please enter your name.'); return; }
    if (!gender) { Alert.alert('Gender required', 'Please select your gender.'); return; }
    try {
      setLoading(true);
      const result = await completeRiderProfile({
        idToken,
        firebase_uid,
        name: name.trim(),
        email,
        gender,
      });
      setSession(result.user, result.communities, null);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Setup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.icon}>👤</Text>
            <Text style={styles.title}>One last step</Text>
            <Text style={styles.sub}>Tell us a bit about yourself</Text>
          </View>
          <View style={styles.emailBadge}>
            <Text style={styles.emailBadgeIcon}>✅</Text>
            <Text style={styles.emailBadgeText}>{email}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Full name</Text>
            <TextInput
              style={styles.input} value={name} onChangeText={setName}
              placeholder="Your name" placeholderTextColor={Colors.textMuted}
              autoCapitalize="words" returnKeyType="next"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Gender</Text>
            <View style={styles.genderRow}>
              {GENDERS.map((g) => (
                <TouchableOpacity
                  key={g.value}
                  style={[styles.genderBtn, gender === g.value && styles.genderBtnSelected]}
                  onPress={() => setGender(g.value)} activeOpacity={0.8}
                >
                  <Text style={styles.genderIcon}>{g.icon}</Text>
                  <Text style={[styles.genderLabel, gender === g.value && styles.genderLabelSelected]}>
                    {g.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleSubmit} disabled={loading} activeOpacity={0.85}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create account</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  kav: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingTop: 40, paddingBottom: 48 },
  header: { alignItems: 'center', marginBottom: 32 },
  icon: { fontSize: 48, marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6 },
  sub: { fontSize: 15, color: Colors.textSecondary },
  emailBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primaryLight,
    borderRadius: 10, padding: 12, marginBottom: 28, gap: 8,
  },
  emailBadgeIcon: { fontSize: 16 },
  emailBadgeText: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  field: { marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 17, color: Colors.textPrimary,
  },
  genderRow: { flexDirection: 'row', gap: 10 },
  genderBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface, gap: 4,
  },
  genderBtnSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  genderIcon: { fontSize: 24 },
  genderLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  genderLabelSelected: { color: Colors.primary },
  btn: {
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 8, shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});