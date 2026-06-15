/**
 * CreateCommunityScreen — Create a private TrustCircle group.
 *
 * Generates an invite code the user can share.
 * Joining via the code categorises users for carpool matching —
 * no explicit group feed or list is shown in the app.
 *
 * Type options limited to non-institutional kinds:
 *   apartment | neighborhood | other
 * (College / workplace are handled by Layer 2 org domain matching.)
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, ActivityIndicator, Alert, Share,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../navigation/types';
import { Colors } from '../../constants/colors';
import { communityService } from '../../services/communityService';
import { useAuth } from '../../context/AuthContext';

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'CreateCommunity'>;

const COMMUNITY_TYPES = [
  { value: 'apartment',     label: '🏢 Apartment / Gated community' },
  { value: 'neighborhood',  label: '🏘️ Neighbourhood / Street' },
  { value: 'other',         label: '👋 Friend group / Other' },
];

export default function CreateCommunityScreen() {
  const navigation = useNavigation<Nav>();
  const { user, communities, setSession } = useAuth();

  const [name, setName] = useState('');
  const [type, setType] = useState('apartment');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ communityName: string; inviteCode: string } | null>(null);

  const canSubmit = name.trim().length >= 3 && !loading;

  const handleCreate = async () => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      const res = await communityService.create({
        name: name.trim(),
        type,
        city: city.trim() || undefined,
        description: description.trim() || undefined,
      });
      setCreated({ communityName: res.community.name, inviteCode: res.invite_code });
      setSession(user!, [...communities, res.community]);
    } catch (e: any) {
      Alert.alert('Could not create', e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!created) return;
    try {
      await Share.share({
        message:
          `Join my TrustCircle "${created.communityName}" on UniGo!\n` +
          `Use invite code: ${created.inviteCode}\n\n` +
          `We'll be matched together for carpooling. 🚗`,
        title: `UniGo TrustCircle Invite`,
      });
    } catch {
      // user cancelled — that's fine
    }
  };

  // ── After creation: show the invite code ────────────────────────────────
  if (created) {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.successCard}>
            <Text style={s.successIcon}>🎉</Text>
            <Text style={s.successTitle}>TrustCircle Created!</Text>
            <Text style={s.successSub}>
              Share the invite code below with people you want to carpool with.
              Anyone who joins this code will be matched with you.
            </Text>

            <View style={s.codeBox}>
              <Text style={s.codeLabel}>INVITE CODE</Text>
              <Text style={s.codeValue}>{created.inviteCode}</Text>
              <Text style={s.codeName}>{created.communityName}</Text>
            </View>

            <TouchableOpacity style={s.shareBtn} onPress={handleShare}>
              <Text style={s.shareBtnText}>📤 Share invite code</Text>
            </TouchableOpacity>

            <View style={s.howItWorks}>
              <Text style={s.howTitle}>How it works</Text>
              <Text style={s.howItem}>• People you share the code with join your TrustCircle</Text>
              <Text style={s.howItem}>• When searching for rides, you can filter to match only within your circle</Text>
              <Text style={s.howItem}>• No group chat or member list — just smarter carpool matching</Text>
            </View>

            <TouchableOpacity
              style={s.continueBtn}
              onPress={() => {
                // RootNavigator auto-redirects now that communities.length > 0
              }}
            >
              <Text style={s.continueBtnText}>Continue to app →</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.backLink}
              onPress={() => navigation.goBack()}
            >
              <Text style={s.backLinkText}>← Back to Join Community</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Creation form ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={s.backLink} onPress={() => navigation.goBack()}>
          <Text style={s.backLinkText}>← Back</Text>
        </TouchableOpacity>

        <Text style={s.title}>Create a TrustCircle</Text>
        <Text style={s.subtitle}>
          Create a private group, then share the invite code with people you trust.
          They'll be added to your carpool matching pool.
        </Text>

        {/* Group name */}
        <Text style={s.label}>Group name *</Text>
        <TextInput
          style={s.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Sunrise Apartments Block B"
          placeholderTextColor={Colors.textMuted}
          maxLength={60}
        />

        {/* Type */}
        <Text style={s.label}>Type</Text>
        <View style={s.typeRow}>
          {COMMUNITY_TYPES.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[s.typeBtn, type === opt.value && s.typeBtnActive]}
              onPress={() => setType(opt.value)}
            >
              <Text style={[s.typeBtnText, type === opt.value && s.typeBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* City */}
        <Text style={s.label}>City (optional)</Text>
        <TextInput
          style={s.input}
          value={city}
          onChangeText={setCity}
          placeholder="e.g. Chennai"
          placeholderTextColor={Colors.textMuted}
          maxLength={40}
        />

        {/* Description */}
        <Text style={s.label}>Description (optional)</Text>
        <TextInput
          style={[s.input, s.inputMultiline]}
          value={description}
          onChangeText={setDescription}
          placeholder="Help members know who this group is for…"
          placeholderTextColor={Colors.textMuted}
          multiline
          numberOfLines={3}
          maxLength={200}
        />

        {/* Submit */}
        <TouchableOpacity
          style={[s.createBtn, !canSubmit && s.btnDisabled]}
          onPress={handleCreate}
          disabled={!canSubmit}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.createBtnText}>Generate Invite Code →</Text>}
        </TouchableOpacity>

        <Text style={s.footnote}>
          Invite codes can be shared with anyone. Only people you share it with can join.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 56 },

  backLink: { marginBottom: 16 },
  backLinkText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },

  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20, marginBottom: 28 },

  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6, marginTop: 16 },
  input: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: Colors.textPrimary, backgroundColor: Colors.surface,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },

  typeRow: { gap: 8 },
  typeBtn: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, backgroundColor: Colors.surface,
  },
  typeBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  typeBtnText: { fontSize: 14, color: Colors.textSecondary },
  typeBtnTextActive: { color: Colors.primary, fontWeight: '700' },

  createBtn: {
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 28,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.4 },

  footnote: { textAlign: 'center', fontSize: 12, color: Colors.textMuted, marginTop: 14 },

  // Success state
  successCard: { alignItems: 'center', paddingTop: 20 },
  successIcon: { fontSize: 52, marginBottom: 12 },
  successTitle: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
  successSub: {
    fontSize: 14, color: Colors.textSecondary, textAlign: 'center',
    lineHeight: 20, marginBottom: 28, paddingHorizontal: 8,
  },
  codeBox: {
    backgroundColor: Colors.primaryLight, borderRadius: 16, padding: 24,
    alignItems: 'center', width: '100%', marginBottom: 20,
    borderWidth: 2, borderColor: Colors.primary,
  },
  codeLabel: {
    fontSize: 11, fontWeight: '800', color: Colors.primary,
    letterSpacing: 1.5, marginBottom: 8,
  },
  codeValue: {
    fontSize: 40, fontWeight: '900', color: Colors.primary,
    letterSpacing: 6, marginBottom: 6,
  },
  codeName: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },

  shareBtn: {
    backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14,
    paddingHorizontal: 32, marginBottom: 24,
  },
  shareBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  howItWorks: {
    width: '100%', backgroundColor: Colors.surface, borderRadius: 12,
    padding: 16, marginBottom: 24, borderWidth: 1, borderColor: Colors.border,
  },
  howTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },
  howItem: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginBottom: 4 },

  continueBtn: {
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', width: '100%', marginBottom: 12,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  continueBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});