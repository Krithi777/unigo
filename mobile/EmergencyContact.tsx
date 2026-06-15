import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, ScrollView, ActivityIndicator,
  Alert, Modal
} from 'react-native';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
);

const MOCK_USER_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

const RELATIONSHIPS = ['Mother', 'Father', 'Sister', 'Brother', 'Friend', 'Spouse', 'Other'];

interface Props {
  onBack: () => void;
}

export default function EmergencyContact({ onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [hasContact, setHasContact] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('');
  const [customRelationship, setCustomRelationship] = useState('');

  const [savedName, setSavedName] = useState('');
  const [savedPhone, setSavedPhone] = useState('');
  const [savedRelationship, setSavedRelationship] = useState('');

  const [nameError, setNameError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [relationshipError, setRelationshipError] = useState('');

  useEffect(() => {
    fetchContact();
  }, []);

  const fetchContact = async () => {
    const { data } = await supabase
      .from('users')
      .select('emergency_contact_name, emergency_contact_phone')
      .eq('id', MOCK_USER_ID)
      .single();

    if (data?.emergency_contact_name) {
      setHasContact(true);
      setSavedName(data.emergency_contact_name);
      setSavedPhone(data.emergency_contact_phone ?? '');

      // Try to parse relationship from name if stored as "Name|Relationship"
      if (data.emergency_contact_name.includes('|')) {
        const parts = data.emergency_contact_name.split('|');
        setSavedName(parts[0]);
        setSavedRelationship(parts[1]);
      }
    }
    setLoading(false);
  };

  const validate = () => {
    let valid = true;
    setNameError('');
    setPhoneError('');
    setRelationshipError('');

    if (!name.trim()) {
      setNameError('Name is required');
      valid = false;
    }

    const phoneDigits = phone.replace(/\D/g, '');
    if (!phone.trim()) {
      setPhoneError('Phone number is required');
      valid = false;
    } else if (phoneDigits.length !== 10) {
      setPhoneError('Enter a valid 10-digit phone number');
      valid = false;
    }

    const finalRelationship = relationship === 'Other' ? customRelationship : relationship;
    if (!finalRelationship.trim()) {
      setRelationshipError('Please select or enter a relationship');
      valid = false;
    }

    return valid;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setSaving(true);
    const finalRelationship = relationship === 'Other' ? customRelationship : relationship;
    const storeName = `${name.trim()}|${finalRelationship.trim()}`;

    const { error } = await supabase
      .from('users')
      .update({
        emergency_contact_name: storeName,
        emergency_contact_phone: phone.trim(),
      })
      .eq('id', MOCK_USER_ID);

    if (error) {
      Alert.alert('Error', 'Could not save contact. Try again.');
    } else {
      setSavedName(name.trim());
      setSavedPhone(phone.trim());
      setSavedRelationship(finalRelationship.trim());
      setHasContact(true);
      setEditing(false);
    }
    setSaving(false);
  };

  const handleRemove = () => {
    Alert.alert(
      'Remove contact',
      'Are you sure you want to remove your emergency contact?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            await supabase
              .from('users')
              .update({
                emergency_contact_name: null,
                emergency_contact_phone: null,
              })
              .eq('id', MOCK_USER_ID);
            setHasContact(false);
            setSavedName('');
            setSavedPhone('');
            setSavedRelationship('');
            setName('');
            setPhone('');
            setRelationship('');
            setCustomRelationship('');
          }
        }
      ]
    );
  };

  const startEditing = () => {
    // Pre-fill form with saved values
    setName(savedName);
    setPhone(savedPhone);
    if (RELATIONSHIPS.includes(savedRelationship)) {
      setRelationship(savedRelationship);
    } else {
      setRelationship('Other');
      setCustomRelationship(savedRelationship);
    }
    setEditing(true);
  };

  const getInitials = (n: string) =>
    n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1A73E8" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled">

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Emergency Contact</Text>
        {hasContact && !editing && (
          <TouchableOpacity onPress={startEditing}>
            <Text style={styles.editBtn}>Edit</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.body}>

        {/* No contact warning */}
        {!hasContact && (
          <View style={styles.warningBox}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={styles.warningText}>
              No emergency contact set. Add one so your circle can be alerted during rides.
            </Text>
          </View>
        )}

        {/* Contact saved — view mode */}
        {hasContact && !editing && (
          <>
            <View style={styles.successBox}>
              <Text style={styles.successIcon}>🛡️</Text>
              <Text style={styles.successText}>Your emergency contact is set and active.</Text>
            </View>

            <View style={styles.card}>
              {/* Avatar + name */}
              <View style={styles.contactRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{getInitials(savedName)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactName}>{savedName}</Text>
                  <Text style={styles.contactRel}>{savedRelationship}</Text>
                </View>
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>Active</Text>
                </View>
              </View>

              <View style={styles.divider} />

              {/* Details */}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>📞 Phone</Text>
                <Text style={styles.detailValue}>{savedPhone}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>🔔 Alerts sent</Text>
                <Text style={styles.detailValue}>0 so far</Text>
              </View>
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                ℹ️ They will be notified if you trigger an SOS or miss a ride check-in.
              </Text>
            </View>

            <TouchableOpacity style={styles.removeBtn} onPress={handleRemove}>
              <Text style={styles.removeBtnText}>🗑 Remove contact</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Add / Edit form */}
        {(!hasContact || editing) && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {editing ? '✏️ Edit contact' : '➕ Add contact'}
            </Text>

            {/* Name */}
            <Text style={styles.fieldLabel}>Full name</Text>
            <TextInput
              style={[styles.input, nameError ? styles.inputError : null]}
              placeholder="e.g. Amma"
              placeholderTextColor="#BBB"
              value={name}
              onChangeText={t => { setName(t); setNameError(''); }}
            />
            {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}

            {/* Phone */}
            <Text style={styles.fieldLabel}>Phone number</Text>
            <TextInput
              style={[styles.input, phoneError ? styles.inputError : null]}
              placeholder="10-digit mobile number"
              placeholderTextColor="#BBB"
              keyboardType="phone-pad"
              maxLength={10}
              value={phone}
              onChangeText={t => { setPhone(t.replace(/\D/g, '')); setPhoneError(''); }}
            />
            {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}

            {/* Relationship dropdown */}
            <Text style={styles.fieldLabel}>Relationship</Text>
            <TouchableOpacity
              style={[styles.input, styles.dropdownBtn, relationshipError ? styles.inputError : null]}
              onPress={() => setShowDropdown(true)}>
              <Text style={relationship ? styles.dropdownValue : styles.dropdownPlaceholder}>
                {relationship || 'Select relationship'}
              </Text>
              <Text style={styles.dropdownArrow}>▾</Text>
            </TouchableOpacity>
            {relationshipError ? <Text style={styles.errorText}>{relationshipError}</Text> : null}

            {/* Custom relationship if Other selected */}
            {relationship === 'Other' && (
              <>
                <Text style={styles.fieldLabel}>Specify relationship</Text>
                <TextInput
                  style={[styles.input, relationshipError ? styles.inputError : null]}
                  placeholder="e.g. Aunt, Roommate..."
                  placeholderTextColor="#BBB"
                  value={customRelationship}
                  onChangeText={t => { setCustomRelationship(t); setRelationshipError(''); }}
                />
              </>
            )}

            {/* Buttons */}
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={saving}>
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>Save contact</Text>
              }
            </TouchableOpacity>

            {editing && (
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setEditing(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Relationship dropdown modal */}
      <Modal
        visible={showDropdown}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDropdown(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowDropdown(false)} />
        <View style={styles.dropdownSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Select relationship</Text>
          {RELATIONSHIPS.map(r => (
            <TouchableOpacity
              key={r}
              style={[styles.sheetOption,
                relationship === r && styles.sheetOptionActive]}
              onPress={() => {
                setRelationship(r);
                setRelationshipError('');
                if (r !== 'Other') setCustomRelationship('');
                setShowDropdown(false);
              }}>
              <Text style={[styles.sheetOptionText,
                relationship === r && styles.sheetOptionTextActive]}>
                {r}
              </Text>
              {relationship === r && <Text style={styles.sheetCheck}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F0F4FF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: '#1A1A2E',
    paddingTop: 56, paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: { padding: 4 },
  backArrow: { fontSize: 22, color: '#fff' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', color: '#fff' },
  editBtn: { fontSize: 14, color: '#1A73E8', fontWeight: '600' },
  body: { padding: 16 },

  warningBox: {
    backgroundColor: '#FEF0E0',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  warningIcon: { fontSize: 18 },
  warningText: { flex: 1, fontSize: 13, color: '#7A4500', lineHeight: 20 },

  successBox: {
    backgroundColor: '#E6F4EA',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginBottom: 14,
  },
  successIcon: { fontSize: 18 },
  successText: { flex: 1, fontSize: 13, color: '#154D21' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: '#1A1A2E', marginBottom: 14 },

  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#FCE8E6',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: 'bold', color: '#C5221F' },
  contactName: { fontSize: 16, fontWeight: 'bold', color: '#1A1A2E' },
  contactRel: { fontSize: 13, color: '#888', marginTop: 2 },
  activeBadge: {
    backgroundColor: '#E6F4EA',
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  activeBadgeText: { fontSize: 11, color: '#188038', fontWeight: '600' },

  divider: { height: 0.5, backgroundColor: '#F0F0F0', marginBottom: 12 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  detailLabel: { fontSize: 13, color: '#888' },
  detailValue: { fontSize: 13, color: '#1A1A2E', fontWeight: '600' },

  infoBox: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: '#E0E0E0',
  },
  infoText: { fontSize: 12, color: '#666', lineHeight: 18 },

  removeBtn: {
    borderWidth: 0.5,
    borderColor: '#F09595',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  removeBtnText: { fontSize: 13, color: '#A32D2D' },

  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#F5F7FF',
    borderRadius: 12,
    padding: 13,
    fontSize: 14,
    color: '#1A1A2E',
    borderWidth: 1,
    borderColor: '#E0E8FF',
  },
  inputError: { borderColor: '#F09595' },
  errorText: { fontSize: 11, color: '#C5221F', marginTop: 4 },

  dropdownBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownValue: { fontSize: 14, color: '#1A1A2E' },
  dropdownPlaceholder: { fontSize: 14, color: '#BBB' },
  dropdownArrow: { fontSize: 14, color: '#888' },

  saveBtn: {
    backgroundColor: '#1A73E8',
    borderRadius: 14,
    padding: 15,
    alignItems: 'center',
    marginTop: 20,
  },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },

  cancelBtn: {
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 0.5,
    borderColor: '#E0E0E0',
  },
  cancelBtnText: { color: '#888', fontSize: 14 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  dropdownSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 36, height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1A1A2E',
    marginBottom: 12,
  },
  sheetOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F0F0F0',
  },
  sheetOptionActive: { backgroundColor: '#F0F6FF', borderRadius: 10, paddingHorizontal: 10 },
  sheetOptionText: { fontSize: 15, color: '#1A1A2E' },
  sheetOptionTextActive: { color: '#1A73E8', fontWeight: '600' },
  sheetCheck: { fontSize: 16, color: '#1A73E8' },
});