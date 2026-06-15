import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, ScrollView, ActivityIndicator,
  Alert, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
);

// ─────────────────────────────────────────────────────────────────────────────
// Replace with real logged-in user's UUID when auth is wired up.
// Pass as a prop: <EmergencyContact userId={firebaseUser.supabaseId} onBack={...} />
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_USER_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

const RELATIONSHIPS = ['Mother', 'Father', 'Sister', 'Brother', 'Friend', 'Spouse', 'Roommate', 'Other'];

interface Props {
  onBack: () => void;
  userId?: string;
}

interface SavedContact {
  name: string;
  phone: string;
  relationship: string;
  alertCount: number;
}

// ── How we store: "Name||Relationship" in emergency_contact_name column ───────
// Using || as separator to avoid conflicts with names containing |
const SEPARATOR = '||';

function encodeContact(name: string, relationship: string) {
  return `${name.trim()}${SEPARATOR}${relationship.trim()}`;
}

function decodeContact(raw: string): { name: string; relationship: string } {
  if (raw.includes(SEPARATOR)) {
    const idx = raw.indexOf(SEPARATOR);
    return { name: raw.slice(0, idx), relationship: raw.slice(idx + SEPARATOR.length) };
  }
  // Legacy: just name, no relationship stored
  return { name: raw, relationship: '' };
}

export default function EmergencyContact({ onBack, userId }: Props) {
  const USER_ID = userId ?? MOCK_USER_ID;

  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [removing,   setRemoving]   = useState(false);
  const [editing,    setEditing]    = useState(false);
  const [saved,      setSaved]      = useState<SavedContact | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // Form state
  const [name,              setName]              = useState('');
  const [phone,             setPhone]             = useState('');
  const [relationship,      setRelationship]      = useState('');
  const [customRelationship,setCustomRelationship]= useState('');

  // Validation errors
  const [nameErr, setNameErr]   = useState('');
  const [phoneErr, setPhoneErr] = useState('');
  const [relErr,  setRelErr]    = useState('');

  // ── Fetch current contact ──────────────────────────────────────────────────
  const fetchContact = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('emergency_contact_name, emergency_contact_phone')
        .eq('id', USER_ID)
         .maybeSingle();

      if (error) throw error;

      if (data?.emergency_contact_name && data?.emergency_contact_phone) {
        const { name: n, relationship: r } = decodeContact(data.emergency_contact_name);
        setSaved({
          name:         n,
          phone:        data.emergency_contact_phone,
          relationship: r,
          alertCount:   0, // fetched separately below
        });

        // Also fetch how many emergency alerts triggered for this user
        const { count } = await supabase
          .from('emergency_logs')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', USER_ID);

        setSaved(prev => prev ? { ...prev, alertCount: count ?? 0 } : prev);
      } else {
        setSaved(null);
      }
    } catch (err) {
      console.error('EmergencyContact fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [USER_ID]);

  useEffect(() => { fetchContact(); }, [fetchContact]);

  // ── Real-time: if emergency_logs changes, refresh alert count ──────────────
  useEffect(() => {
    const channel = supabase
      .channel(`emergency_contact_${USER_ID}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'emergency_logs',
        filter: `user_id=eq.${USER_ID}`,
      }, () => fetchContact())
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
        filter: `id=eq.${USER_ID}`,
      }, () => fetchContact())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [USER_ID, fetchContact]);

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = () => {
    let ok = true;
    setNameErr(''); setPhoneErr(''); setRelErr('');

    if (!name.trim()) {
      setNameErr('Name is required'); ok = false;
    } else if (name.trim().length < 2) {
      setNameErr('Enter a valid full name'); ok = false;
    }

    const digits = phone.replace(/\D/g, '');
    if (!digits) {
      setPhoneErr('Phone number is required'); ok = false;
    } else if (digits.length !== 10) {
      setPhoneErr('Enter a valid 10-digit number'); ok = false;
    }

    const finalRel = relationship === 'Other' ? customRelationship : relationship;
    if (!finalRel.trim()) {
      setRelErr('Please select or enter a relationship'); ok = false;
    }

    return ok;
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);

    try {
      const finalRel  = relationship === 'Other' ? customRelationship.trim() : relationship;
      const storeName = encodeContact(name, finalRel);

      const { error } = await supabase
        .from('users')
        .update({
          emergency_contact_name:  storeName,
          emergency_contact_phone: phone.trim(),
        })
        .eq('id', USER_ID);

      if (error) throw error;

      setSaved({
        name:         name.trim(),
        phone:        phone.trim(),
        relationship: finalRel,
        alertCount:   saved?.alertCount ?? 0,
      });
      setEditing(false);

      // Refresh to confirm from DB
      fetchContact();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Remove ─────────────────────────────────────────────────────────────────
  const handleRemove = () => {
    Alert.alert(
      'Remove contact',
      `Remove ${saved?.name} as your emergency contact? They won't receive SOS alerts.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            setRemoving(true);
            try {
              const { error } = await supabase
                .from('users')
                .update({
                  emergency_contact_name:  null,
                  emergency_contact_phone: null,
                })
                .eq('id', USER_ID);
              if (error) throw error;
              setSaved(null);
              clearForm();
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'Could not remove. Try again.');
            } finally {
              setRemoving(false);
            }
          },
        },
      ]
    );
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const clearForm = () => {
    setName(''); setPhone(''); setRelationship('');
    setCustomRelationship('');
    setNameErr(''); setPhoneErr(''); setRelErr('');
  };

  const startEditing = () => {
    if (!saved) return;
    setName(saved.name);
    setPhone(saved.phone);
    if (RELATIONSHIPS.includes(saved.relationship)) {
      setRelationship(saved.relationship);
      setCustomRelationship('');
    } else {
      setRelationship('Other');
      setCustomRelationship(saved.relationship);
    }
    setEditing(true);
  };

  const cancelEditing = () => {
    clearForm();
    setEditing(false);
  };

  const getInitials = (n: string) =>
    n.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const finalRelationship = relationship === 'Other' ? customRelationship : relationship;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1A73E8" />
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.screen}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">

        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Emergency Contact</Text>
            <Text style={styles.headerSub}>Notified during SOS or missed check-in</Text>
          </View>
          {saved && !editing && (
            <TouchableOpacity onPress={startEditing} style={styles.editChip}>
              <Text style={styles.editChipText}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.body}>

          {/* ── No contact warning ── */}
          {!saved && !editing && (
            <View style={styles.warningBox}>
              <Text style={styles.warningIcon}>⚠️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.warningTitle}>No contact set</Text>
                <Text style={styles.warningText}>
                  Add an emergency contact so someone you trust is alerted if you trigger SOS or miss a ride check-in.
                </Text>
              </View>
            </View>
          )}

          {/* ── Saved contact — view mode ── */}
          {saved && !editing && (
            <>
              <View style={styles.successBox}>
                <Text style={styles.successIcon}>🛡️</Text>
                <Text style={styles.successText}>
                  Your emergency contact is active and will be notified instantly.
                </Text>
              </View>

              <View style={styles.card}>
                {/* Avatar row */}
                <View style={styles.contactRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{getInitials(saved.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.contactName}>{saved.name}</Text>
                    <Text style={styles.contactRel}>{saved.relationship || 'Emergency contact'}</Text>
                  </View>
                  <View style={styles.activeBadge}>
                    <View style={styles.activeDot} />
                    <Text style={styles.activeBadgeText}>Active</Text>
                  </View>
                </View>

                <View style={styles.divider} />

                {/* Details */}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>📞 Phone</Text>
                  <Text style={styles.detailValue}>{saved.phone}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>🔔 SOS alerts sent</Text>
                  <Text style={[styles.detailValue,
                    saved.alertCount > 0 && { color: '#C5221F' }]}>
                    {saved.alertCount > 0 ? `${saved.alertCount} alert${saved.alertCount > 1 ? 's' : ''}` : 'None so far'}
                  </Text>
                </View>
              </View>

              {/* How it works */}
              <View style={styles.howBox}>
                <Text style={styles.howTitle}>When will they be notified?</Text>
                <View style={styles.howItem}>
                  <View style={styles.howDot} />
                  <Text style={styles.howText}>You trigger the SOS button during a ride</Text>
                </View>
                <View style={styles.howItem}>
                  <View style={styles.howDot} />
                  <Text style={styles.howText}>You miss a ride check-in (no-show)</Text>
                </View>
                <View style={styles.howItem}>
                  <View style={styles.howDot} />
                  <Text style={styles.howText}>Your ride is cancelled without your confirmation</Text>
                </View>
              </View>

              {/* Remove */}
              <TouchableOpacity
                style={[styles.removeBtn, removing && { opacity: 0.6 }]}
                onPress={handleRemove}
                disabled={removing}>
                {removing
                  ? <ActivityIndicator color="#A32D2D" size="small" />
                  : <Text style={styles.removeBtnText}>🗑 Remove contact</Text>
                }
              </TouchableOpacity>
            </>
          )}

          {/* ── Add / Edit form ── */}
          {(!saved || editing) && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {editing ? '✏️ Edit contact' : '➕ Add emergency contact'}
              </Text>

              {/* Name */}
              <Text style={styles.fieldLabel}>Full name *</Text>
              <TextInput
                style={[styles.input, nameErr ? styles.inputError : null]}
                placeholder="e.g. Amma, Dad, Priya..."
                placeholderTextColor="#BBB"
                value={name}
                onChangeText={t => { setName(t); setNameErr(''); }}
                autoCapitalize="words"
              />
              {nameErr ? <Text style={styles.errText}>{nameErr}</Text> : null}

              {/* Phone */}
              <Text style={styles.fieldLabel}>Mobile number *</Text>
              <View style={styles.phoneRow}>
                <View style={styles.phonePrefix}>
                  <Text style={styles.phonePrefixText}>🇮🇳 +91</Text>
                </View>
                <TextInput
                  style={[styles.phoneInput, phoneErr ? styles.inputError : null]}
                  placeholder="10-digit number"
                  placeholderTextColor="#BBB"
                  keyboardType="number-pad"
                  maxLength={10}
                  value={phone}
                  onChangeText={t => { setPhone(t.replace(/\D/g, '')); setPhoneErr(''); }}
                />
              </View>
              {phoneErr ? <Text style={styles.errText}>{phoneErr}</Text> : null}

              {/* Relationship */}
              <Text style={styles.fieldLabel}>Relationship *</Text>
              <TouchableOpacity
                style={[styles.input, styles.dropdownBtn, relErr ? styles.inputError : null]}
                onPress={() => setShowPicker(true)}
                activeOpacity={0.7}>
                <Text style={relationship ? styles.dropdownVal : styles.dropdownPh}>
                  {relationship || 'Select relationship'}
                </Text>
                <Text style={styles.dropdownArrow}>▾</Text>
              </TouchableOpacity>
              {relErr ? <Text style={styles.errText}>{relErr}</Text> : null}

              {/* Custom if Other */}
              {relationship === 'Other' && (
                <>
                  <Text style={styles.fieldLabel}>Specify *</Text>
                  <TextInput
                    style={[styles.input, relErr && !customRelationship ? styles.inputError : null]}
                    placeholder="e.g. Aunt, Roommate, Cousin..."
                    placeholderTextColor="#BBB"
                    value={customRelationship}
                    onChangeText={t => { setCustomRelationship(t); setRelErr(''); }}
                    autoCapitalize="words"
                  />
                </>
              )}

              {/* Preview chip */}
              {name.trim() && phone.trim() && finalRelationship.trim() && (
                <View style={styles.previewChip}>
                  <Text style={styles.previewChipText}>
                    ✓ {name.trim()} ({finalRelationship}) · +91 {phone}
                  </Text>
                </View>
              )}

              {/* Save */}
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.7 }]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.8}>
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.saveBtnText}>
                      {editing ? 'Update contact' : 'Save contact'}
                    </Text>
                }
              </TouchableOpacity>

              {editing && (
                <TouchableOpacity style={styles.cancelBtn} onPress={cancelEditing}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

        </View>

        {/* ── Relationship picker modal ── */}
        <Modal
          visible={showPicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowPicker(false)}>
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowPicker(false)} />
          <View style={styles.pickerSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Select relationship</Text>
            {RELATIONSHIPS.map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.sheetOption, relationship === r && styles.sheetOptionActive]}
                onPress={() => {
                  setRelationship(r);
                  setRelErr('');
                  if (r !== 'Other') setCustomRelationship('');
                  setShowPicker(false);
                }}>
                <Text style={[styles.sheetOptionText, relationship === r && styles.sheetOptionTextActive]}>
                  {r}
                </Text>
                {relationship === r && <Text style={styles.sheetCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </Modal>

        <View style={{ height: 48 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F0F4FF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F4FF' },

  header: {
    backgroundColor: '#1A1A2E',
    paddingTop: 56, paddingBottom: 18, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
  },
  backBtn:    { paddingTop: 2 },
  backArrow:  { fontSize: 22, color: '#fff' },
  headerTitle:{ fontSize: 18, fontWeight: 'bold', color: '#fff' },
  headerSub:  { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 3 },
  editChip:   { backgroundColor: 'rgba(26,115,232,0.2)', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 6, marginTop: 2 },
  editChipText:{ fontSize: 13, color: '#7AADFF', fontWeight: '600' },

  body: { padding: 16 },

  warningBox: {
    backgroundColor: '#FEF0E0', borderRadius: 16, padding: 16,
    flexDirection: 'row', gap: 12, marginBottom: 14,
  },
  warningIcon:  { fontSize: 22 },
  warningTitle: { fontSize: 14, fontWeight: 'bold', color: '#7A4500', marginBottom: 4 },
  warningText:  { fontSize: 13, color: '#7A4500', lineHeight: 20 },

  successBox: {
    backgroundColor: '#E6F4EA', borderRadius: 14, padding: 14,
    flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 14,
  },
  successIcon: { fontSize: 20 },
  successText: { flex: 1, fontSize: 13, color: '#154D21', lineHeight: 19 },

  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 18,
    marginBottom: 12, shadowColor: '#000',
    shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: '#1A1A2E', marginBottom: 16 },

  contactRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  avatar:       { width: 50, height: 50, borderRadius: 25, backgroundColor: '#FCE8E6', justifyContent: 'center', alignItems: 'center' },
  avatarText:   { fontSize: 17, fontWeight: 'bold', color: '#C5221F' },
  contactName:  { fontSize: 16, fontWeight: 'bold', color: '#1A1A2E' },
  contactRel:   { fontSize: 13, color: '#888', marginTop: 2 },
  activeBadge:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E6F4EA', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  activeDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: '#34A853' },
  activeBadgeText: { fontSize: 11, color: '#188038', fontWeight: '600' },

  divider:      { height: 0.5, backgroundColor: '#F0F0F0', marginBottom: 12 },
  detailRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  detailLabel:  { fontSize: 13, color: '#888' },
  detailValue:  { fontSize: 13, color: '#1A1A2E', fontWeight: '600' },

  howBox:  { backgroundColor: '#F8F9FF', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 0.5, borderColor: '#E0E8FF' },
  howTitle:{ fontSize: 13, fontWeight: 'bold', color: '#1A1A2E', marginBottom: 12 },
  howItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  howDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: '#1A73E8', marginTop: 5, flexShrink: 0 },
  howText: { fontSize: 13, color: '#555', lineHeight: 19, flex: 1 },

  removeBtn:     { borderWidth: 1, borderColor: '#F09595', borderRadius: 14, padding: 14, alignItems: 'center', marginBottom: 4 },
  removeBtnText: { fontSize: 13, color: '#A32D2D' },

  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 14 },
  input:      { backgroundColor: '#F5F7FF', borderRadius: 12, padding: 13, fontSize: 14, color: '#1A1A2E', borderWidth: 1, borderColor: '#E0E8FF' },
  inputError: { borderColor: '#F09595', backgroundColor: '#FFF5F5' },
  errText:    { fontSize: 11, color: '#C5221F', marginTop: 4 },

  phoneRow:       { flexDirection: 'row', gap: 8 },
  phonePrefix:    { backgroundColor: '#F5F7FF', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 13, borderWidth: 1, borderColor: '#E0E8FF', justifyContent: 'center' },
  phonePrefixText:{ fontSize: 14, color: '#1A1A2E', fontWeight: '500' },
  phoneInput:     { flex: 1, backgroundColor: '#F5F7FF', borderRadius: 12, padding: 13, fontSize: 14, color: '#1A1A2E', borderWidth: 1, borderColor: '#E0E8FF' },

  dropdownBtn:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dropdownVal:   { fontSize: 14, color: '#1A1A2E' },
  dropdownPh:    { fontSize: 14, color: '#BBB' },
  dropdownArrow: { fontSize: 14, color: '#888' },

  previewChip: { backgroundColor: '#E6F4EA', borderRadius: 10, padding: 10, marginTop: 14 },
  previewChipText: { fontSize: 12, color: '#188038', fontWeight: '500' },

  saveBtn:     { backgroundColor: '#1A73E8', borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  cancelBtn:   { borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 8, borderWidth: 0.5, borderColor: '#E0E0E0' },
  cancelBtnText:{ color: '#888', fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  pickerSheet:  { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingTop: 12 },
  sheetHandle:  { width: 36, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle:   { fontSize: 15, fontWeight: 'bold', color: '#1A1A2E', marginBottom: 12 },
  sheetOption:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: '#F0F0F0' },
  sheetOptionActive:    { backgroundColor: '#F0F6FF', borderRadius: 10 },
  sheetOptionText:      { fontSize: 15, color: '#1A1A2E' },
  sheetOptionTextActive:{ color: '#1A73E8', fontWeight: '600' },
  sheetCheck:           { fontSize: 16, color: '#1A73E8' },
});