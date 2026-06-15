/**
 * TrustCircleScreen — Private group trust layer.
 *
 * Two tabs:
 *   "Join" — enter an invite code someone shared with you
 *   "Create" — create a new private circle and get an invite code to share
 *
 * The "Create" tab is the existing CreateCommunityScreen logic inlined here
 * so it all lives in one place for this flow, without an extra navigation hop.
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, ActivityIndicator, Alert, Share,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../navigation/types';
import { Colors } from '../../constants/colors';
import { communityService } from '../../services/communityService';
import { useAuth } from '../../context/AuthContext';

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'TrustCircle'>;

type Tab = 'join' | 'create';

const COMMUNITY_TYPES = [
  { value: 'apartment',    label: '🏢 Apartment / Gated community' },
  { value: 'neighborhood', label: '🏘️ Neighbourhood / Street' },
  { value: 'other',        label: '👋 Friend group / Other' },
];

export default function TrustCircleScreen() {
  const navigation = useNavigation<Nav>();
  const { user, communities, setSession } = useAuth();

  const [tab, setTab] = useState<Tab>('join');

  // ── Join state ──────────────────────────────────────────────────────────────
  const [inviteCode, setInviteCode] = useState('');
  const [preview, setPreview] = useState<{ name: string; type: string; member_count: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState<{ name: string; inviteCode: string } | null>(null);

  // ── Create state ────────────────────────────────────────────────────────────
  const [groupName, setGroupName] = useState('');
  const [groupType, setGroupType] = useState('apartment');
  const [groupCity, setGroupCity] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ name: string; inviteCode: string } | null>(null);

  // ── Join handlers ───────────────────────────────────────────────────────────

  const handlePreview = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (code.length < 4) {
      Alert.alert('Invalid code', 'Please enter a valid invite code.');
      return;
    }
    setPreviewing(true);
    setPreview(null);
    try {
      const res = await communityService.preview(code);
      setPreview({
        name: res.community.name,
        type: res.community.type,
        member_count: res.member_count,
      });
    } catch (err: any) {
      Alert.alert('Not found', err?.message ?? 'That invite code was not found. Check and try again.');
    } finally {
      setPreviewing(false);
    }
  };

  const handleJoin = async () => {
    const code = inviteCode.trim().toUpperCase();
    setJoining(true);
    try {
      const res = await communityService.join(code);
      setSession(user!, [...communities, res.community]);
      setJoined({ name: res.community.name, inviteCode: code });
    } catch (err: any) {
      if (err?.message?.includes('Already a member')) {
        setJoined({ name: preview?.name ?? 'the community', inviteCode: code });
      } else {
        Alert.alert('Could not join', err?.message ?? 'Something went wrong.');
      }
    } finally {
      setJoining(false);
    }
  };

  // ── Create handlers ─────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (groupName.trim().length < 3) {
      Alert.alert('Name too short', 'Group name must be at least 3 characters.');
      return;
    }
    setCreating(true);
    try {
      const res = await communityService.create({
        name: groupName.trim(),
        type: groupType,
        city: groupCity.trim() || undefined,
        description: groupDesc.trim() || undefined,
      });
      setSession(user!, [...communities, res.community]);
      setCreated({ name: res.community.name, inviteCode: res.invite_code });
    } catch (err: any) {
      Alert.alert('Could not create', err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleShare = async (name: string, code: string) => {
    try {
      await Share.share({
        message:
          `Join my TrustCircle "${name}" on UniGo!\n` +
          `Use invite code: ${code}\n\n` +
          `We'll be matched together for carpooling. 🚗`,
        title: 'UniGo TrustCircle Invite',
      });
    } catch {
      // user cancelled
    }
  };

  // ── Success screens ─────────────────────────────────────────────────────────

  if (joined) {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={[s.scroll, s.centerScroll]}>
          <Text style={s.bigEmoji}>🎉</Text>
          <Text style={s.successTitle}>You're in!</Text>
          <Text style={s.successSub}>
            You've joined <Text style={{ fontWeight: '800', color: Colors.primary }}>{joined.name}</Text>.{'\n'}
            You'll be matched with members of this TrustCircle when carpooling.
          </Text>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: Colors.primary, marginTop: 24 }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={s.btnText}>Done →</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (created) {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={[s.scroll, s.centerScroll]}>
          <Text style={s.bigEmoji}>🎉</Text>
          <Text style={s.successTitle}>TrustCircle Created!</Text>
          <Text style={s.successSub}>
            Share the invite code below with people you want to carpool with.
          </Text>

          <View style={s.codeBox}>
            <Text style={s.codeLabel}>INVITE CODE</Text>
            <Text style={s.codeValue}>{created.inviteCode}</Text>
            <Text style={s.codeName}>{created.name}</Text>
          </View>

          <TouchableOpacity
            style={[s.btn, { backgroundColor: Colors.primary }]}
            onPress={() => handleShare(created.name, created.inviteCode)}
          >
            <Text style={s.btnText}>📤 Share invite code</Text>
          </TouchableOpacity>

          <View style={s.howBox}>
            <Text style={s.howTitle}>How it works</Text>
            <Text style={s.howItem}>• People you share the code with join your TrustCircle</Text>
            <Text style={s.howItem}>• When searching for rides, you can filter to match only within your circle</Text>
            <Text style={s.howItem}>• No group chat or member list — just smarter carpool matching</Text>
          </View>

          <TouchableOpacity
            style={[s.btn, { backgroundColor: Colors.success, marginTop: 4 }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={s.btnText}>Done →</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Main screen ─────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={s.back} onPress={() => navigation.goBack()}>
            <Text style={s.backText}>‹ Back</Text>
          </TouchableOpacity>

          <View style={s.header}>
            <Text style={s.emoji}>👥</Text>
            <Text style={s.title}>TrustCircle</Text>
            <Text style={s.subtitle}>
              Join a private circle using an invite code from someone you know, or create
              your own circle and share the code with people you trust.
            </Text>
          </View>

          {/* Tab switcher */}
          <View style={s.tabRow}>
            <TouchableOpacity
              style={[s.tabBtn, tab === 'join' && s.tabBtnActive]}
              onPress={() => setTab('join')}
            >
              <Text style={[s.tabText, tab === 'join' && s.tabTextActive]}>Join with Code</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tabBtn, tab === 'create' && s.tabBtnActive]}
              onPress={() => setTab('create')}
            >
              <Text style={[s.tabText, tab === 'create' && s.tabTextActive]}>Create New Circle</Text>
            </TouchableOpacity>
          </View>

          {/* ── JOIN TAB ── */}
          {tab === 'join' && (
            <View style={s.card}>
              <Text style={s.cardLabel}>Enter the invite code you received</Text>
              <View style={s.codeInputRow}>
                <TextInput
                  style={s.codeInput}
                  value={inviteCode}
                  onChangeText={(v) => {
                    setInviteCode(v.toUpperCase());
                    setPreview(null);
                  }}
                  placeholder="e.g. A3B7K2"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={8}
                />
                <TouchableOpacity
                  style={[s.lookupBtn, (inviteCode.trim().length < 4 || previewing) && s.btnDisabled]}
                  onPress={handlePreview}
                  disabled={inviteCode.trim().length < 4 || previewing}
                >
                  {previewing
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.lookupBtnText}>Look up</Text>}
                </TouchableOpacity>
              </View>

              {preview && (
                <View style={s.previewBox}>
                  <Text style={s.previewTitle}>✅ Found!</Text>
                  <Text style={s.previewName}>{preview.name}</Text>
                  <Text style={s.previewMeta}>
                    {preview.type.charAt(0).toUpperCase() + preview.type.slice(1)} · {preview.member_count} member{preview.member_count !== 1 ? 's' : ''}
                  </Text>
                  <TouchableOpacity
                    style={[s.btn, { backgroundColor: Colors.warning, marginTop: 14 }, joining && s.btnDisabled]}
                    onPress={handleJoin}
                    disabled={joining}
                  >
                    {joining
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={s.btnText}>Join this TrustCircle →</Text>}
                  </TouchableOpacity>
                </View>
              )}

              <Text style={s.hintText}>
                Ask the person who invited you to share their UniGo invite code.
              </Text>
            </View>
          )}

          {/* ── CREATE TAB ── */}
          {tab === 'create' && (
            <View style={s.card}>
              <Text style={s.cardLabel}>Group name *</Text>
              <TextInput
                style={s.input}
                value={groupName}
                onChangeText={setGroupName}
                placeholder="e.g. Sunrise Apartments Block B"
                placeholderTextColor={Colors.textMuted}
                maxLength={60}
              />

              <Text style={[s.cardLabel, { marginTop: 16 }]}>Type</Text>
              <View style={s.typeRow}>
                {COMMUNITY_TYPES.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[s.typeBtn, groupType === opt.value && s.typeBtnActive]}
                    onPress={() => setGroupType(opt.value)}
                  >
                    <Text style={[s.typeBtnText, groupType === opt.value && s.typeBtnTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.cardLabel, { marginTop: 16 }]}>City (optional)</Text>
              <TextInput
                style={s.input}
                value={groupCity}
                onChangeText={setGroupCity}
                placeholder="e.g. Chennai"
                placeholderTextColor={Colors.textMuted}
                maxLength={40}
              />

              <Text style={[s.cardLabel, { marginTop: 16 }]}>Description (optional)</Text>
              <TextInput
                style={[s.input, { minHeight: 76, textAlignVertical: 'top' }]}
                value={groupDesc}
                onChangeText={setGroupDesc}
                placeholder="Help members know who this group is for…"
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={3}
                maxLength={200}
              />

              <TouchableOpacity
                style={[s.btn, { backgroundColor: Colors.primary, marginTop: 20 }, (groupName.trim().length < 3 || creating) && s.btnDisabled]}
                onPress={handleCreate}
                disabled={groupName.trim().length < 3 || creating}
              >
                {creating
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnText}>Generate Invite Code →</Text>}
              </TouchableOpacity>

              <Text style={s.hintText}>
                Invite codes can be shared with anyone you trust. Only people with the code can join.
              </Text>
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
  centerScroll: { alignItems: 'center', paddingTop: 60 },

  back: { marginBottom: 20 },
  backText: { fontSize: 17, color: Colors.primary, fontWeight: '600' },

  header: { marginBottom: 24 },
  emoji: { fontSize: 36, marginBottom: 10 },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },

  tabRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 9,
  },
  tabBtnActive: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  tabTextActive: { color: '#fff' },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  cardLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8 },

  codeInputRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  codeInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
    letterSpacing: 4,
    textAlign: 'center',
  },
  lookupBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  lookupBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  previewBox: {
    marginTop: 12,
    backgroundColor: Colors.primaryLight,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.primary + '60',
  },
  previewTitle: { fontSize: 13, fontWeight: '700', color: Colors.success, marginBottom: 4 },
  previewName: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  previewMeta: { fontSize: 13, color: Colors.textSecondary },

  hintText: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 12,
    lineHeight: 17,
  },

  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
  },
  typeRow: { gap: 8 },
  typeBtn: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.background,
  },
  typeBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  typeBtnText: { fontSize: 14, color: Colors.textSecondary },
  typeBtnTextActive: { color: Colors.primary, fontWeight: '700' },

  btn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.4 },

  // Success screen
  bigEmoji: { fontSize: 52, marginBottom: 12 },
  successTitle: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10, textAlign: 'center' },
  successSub: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 21, paddingHorizontal: 12, marginBottom: 8 },

  codeBox: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  codeLabel: {
    fontSize: 11, fontWeight: '800', color: Colors.primary,
    letterSpacing: 1.5, marginBottom: 8,
  },
  codeValue: {
    fontSize: 38, fontWeight: '900', color: Colors.primary,
    letterSpacing: 6, marginBottom: 6,
  },
  codeName: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },

  howBox: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  howTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },
  howItem: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginBottom: 4 },
});