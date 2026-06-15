/**
 * DriverSetupScreen — Account + Vehicle + Documents (real uploads via expo-image-picker).
 *
 * Changes from original:
 *  - handleUploadDoc: real ImagePicker → base64 → driverService.uploadDriverDocument
 *  - Vehicle number validated client-side with Indian RTO regex BEFORE hitting the server
 *  - Progress bar accounts for all three sections (account + vehicle + docs)
 *  - License number field added (required by driver_profiles schema)
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, ActivityIndicator, Alert,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { Colors } from '../../constants/colors';
import { createDriverAccount } from '../../services/authService';
import {
  saveDriverSetup,
  checkVehicleNumber,
  submitDriverForReview,
  uploadDriverDocument,   // must exist in driverService — see note at bottom
} from '../../services/driverService';
import { useAuth } from '../../context/AuthContext';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'DriverSetup'>;
type RouteProps = RouteProp<AuthStackParamList, 'DriverSetup'>;
type Gender = 'male' | 'female' | 'other';
type VehicleType = 'car' | 'bike' | 'auto';
type DocKey = 'license' | 'rc' | 'insurance' | 'puc';

// ─── Indian vehicle number regex ────────────────────────────────────────────
// Format: <2-letter state> <2-digit RTO> <1-3 letter series> <4-digit number>
// Examples: MH12AB1234  DL01C1234  KA03M5678  TN09Z1234
const INDIAN_VEHICLE_REGEX = /^[A-Z]{2}[0-9]{2}[A-Z]{1,3}[0-9]{4}$/;

function validateVehicleNumber(raw: string): { valid: boolean; message?: string } {
  const num = raw.trim().toUpperCase().replace(/[\s-]/g, '');
  if (!num) return { valid: false, message: 'Vehicle number is required' };
  if (num.length < 7 || num.length > 10)
    return { valid: false, message: 'Must be 7–10 characters (e.g. MH12AB1234)' };
  if (!INDIAN_VEHICLE_REGEX.test(num))
    return { valid: false, message: 'Invalid format. Use MH12AB1234 style' };
  return { valid: true };
}

// ─── Constants ──────────────────────────────────────────────────────────────

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const VEHICLE_TYPES: { value: VehicleType; label: string; icon: string }[] = [
  { value: 'car', label: 'Car', icon: '🚗' },
  { value: 'bike', label: 'Bike', icon: '🏍️' },
  { value: 'auto', label: 'Auto', icon: '🛺' },
];

const DOCS: { key: DocKey; label: string; icon: string }[] = [
  { key: 'license', label: 'Driving License', icon: '🪪' },
  { key: 'rc', label: 'RC Book', icon: '📄' },
  { key: 'insurance', label: 'Insurance', icon: '🛡️' },
  { key: 'puc', label: 'PUC Certificate', icon: '🌿' },
];

type DocStatus = 'none' | 'uploading' | 'uploaded' | 'error';

// ─── Component ──────────────────────────────────────────────────────────────

export default function DriverSetupScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProps>();
  const { idToken, firebase_uid, phone, email } = route.params;
  const { setSession, setDriverProfile } = useAuth();

  // Save the custom_token to storage immediately so all API calls
  // (upload-document, check-vehicle, etc.) have a non-null Bearer token.
  useEffect(() => {
    import('../../utils/storage').then(({ Storage }) => {
      Storage.saveSession(idToken, {}, [], null);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Account
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);

  // Vehicle
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [vehicleNumberStatus, setVehicleNumberStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
  const [vehicleNumberError, setVehicleNumberError] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('car');
  const [seats, setSeats] = useState('4');

  // Documents
  const [docs, setDocs] = useState<Record<DocKey, DocStatus>>({
    license: 'none', rc: 'none', insurance: 'none', puc: 'none',
  });
  const [docErrors, setDocErrors] = useState<Record<DocKey, string>>({
    license: '', rc: '', insurance: '', puc: '',
  });

  // Loading states
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const [vehicleSaved, setVehicleSaved] = useState(false);

  const docsUploaded = Object.values(docs).filter((v) => v === 'uploaded').length;

  // Overall progress: account (33%) + vehicle (33%) + docs (34% split by 4)
  const progress =
    (accountCreated ? 33 : 0) +
    (vehicleSaved ? 33 : 0) +
    Math.round((docsUploaded / 4) * 34);

  // ─── Vehicle number: client-side regex first, then server uniqueness check ───

  const checkVehicle = useCallback(async (num: string) => {
    const cleaned = num.trim().toUpperCase().replace(/[\s-]/g, '');
    if (!cleaned) { setVehicleNumberStatus('idle'); return; }

    // Client-side regex first — no network call needed if format is wrong
    const localCheck = validateVehicleNumber(cleaned);
    if (!localCheck.valid) {
      setVehicleNumberStatus('error');
      setVehicleNumberError(localCheck.message ?? 'Invalid format');
      return;
    }

    // Format OK — check server for uniqueness
    setVehicleNumberStatus('checking');
    try {
      const result = await checkVehicleNumber(cleaned);
      if (result.taken) {
        setVehicleNumberStatus('error');
        setVehicleNumberError('This vehicle number is already registered');
      } else {
        setVehicleNumberStatus('ok');
        setVehicleNumberError('');
      }
    } catch {
      // Network error — don't block the user; let server validate on save
      setVehicleNumberStatus('ok');
      setVehicleNumberError('');
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => checkVehicle(vehicleNumber), 600);
    return () => clearTimeout(t);
  }, [vehicleNumber, checkVehicle]);

  // ─── Step 1: Create driver account ──────────────────────────────────────────

  const ensureAccountCreated = async (): Promise<boolean> => {
    if (accountCreated) return true;
    if (!name.trim()) { Alert.alert('Name required', 'Please enter your full name.'); return false; }
    if (!gender) { Alert.alert('Gender required', 'Please select your gender.'); return false; }
    try {
      setSaving(true);
      const result = await createDriverAccount({
        idToken, firebase_uid, name: name.trim(), phone, gender, email,
      });
      setSession(result.user, result.communities, result.driver_profile);
      setAccountCreated(true);
      return true;
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Account creation failed.');
      return false;
    } finally { setSaving(false); }
  };

  // ─── Step 2: Save vehicle info ───────────────────────────────────────────────

  const handleSaveVehicle = async () => {
    const ok = await ensureAccountCreated();
    if (!ok) return;

    if (vehicleNumberStatus !== 'ok') {
      Alert.alert('Vehicle number', vehicleNumberError || 'Enter a valid vehicle number (e.g. MH12AB1234).');
      return;
    }
    if (!licenseNumber.trim()) {
      Alert.alert('License number required', 'Please enter your driving license number.');
      return;
    }
    if (!make.trim() || !model.trim() || !color.trim()) {
      Alert.alert('Missing fields', 'Please fill in make, model, and color.');
      return;
    }
    const parsedSeats = parseInt(seats, 10);
    if (isNaN(parsedSeats) || parsedSeats < 1 || parsedSeats > 8) {
      Alert.alert('Invalid seats', 'Seats must be between 1 and 8.');
      return;
    }

    try {
      setSaving(true);
      const dp = await saveDriverSetup({
        vehicle: {
          vehicle_number: vehicleNumber.toUpperCase().replace(/[\s-]/g, ''),
          license_number: licenseNumber.trim().toUpperCase(),
          vehicle_make: make.trim(),
          vehicle_model: model.trim(),
          vehicle_color: color.trim(),
          vehicle_type: vehicleType,
          seats_available_default: parsedSeats,
        },
      });
      setDriverProfile(dp);
      setVehicleSaved(true);
      Alert.alert('✅ Saved!', 'Vehicle info saved. Now upload your documents.');
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not save vehicle info.');
    } finally { setSaving(false); }
  };

  // ─── Step 3: Upload document (real ImagePicker) ──────────────────────────────

  const handleUploadDoc = async (docKey: DocKey) => {
    // Request media library permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission needed',
        'Please allow photo library access in Settings to upload documents.',
        [{ text: 'OK' }],
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.85,
      base64: true,          // needed if your uploadDriverDocument sends base64
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];

    setDocs((prev) => ({ ...prev, [docKey]: 'uploading' }));
    setDocErrors((prev) => ({ ...prev, [docKey]: '' }));

    try {
      // uploadDriverDocument must be implemented in driverService:
      //   POST /driver/upload-document  { doc_type: docKey, uri, base64, mimeType }
      await uploadDriverDocument({
        doc_type: docKey,
        uri: asset.uri,
        base64: asset.base64 ?? undefined,
        mimeType: asset.mimeType ?? 'image/jpeg',
        fileName: asset.fileName ?? `${docKey}.jpg`,
      });
      setDocs((prev) => ({ ...prev, [docKey]: 'uploaded' }));
    } catch (err: any) {
      setDocs((prev) => ({ ...prev, [docKey]: 'error' }));
      setDocErrors((prev) => ({
        ...prev,
        [docKey]: err?.message ?? 'Upload failed. Tap to retry.',
      }));
    }
  };

  // ─── Step 4: Submit for review ───────────────────────────────────────────────

  const canSubmit =
    accountCreated &&
    vehicleSaved &&
    vehicleNumberStatus === 'ok' &&
    docsUploaded === 4;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      setSubmitting(true);
      const { driver_profile } = await submitDriverForReview();
      setDriverProfile(driver_profile);
      navigation.navigate('DriverPendingReview');
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Submission failed. Try again.');
    } finally { setSubmitting(false); }
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const docStatusIcon = (status: DocStatus) => {
    if (status === 'uploaded') return '✅';
    if (status === 'uploading') return '⏳';
    if (status === 'error') return '❌';
    return '📎';
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Progress */}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` as any }]} />
        </View>
        <Text style={styles.progressLabel}>
          {accountCreated && vehicleSaved
            ? `${docsUploaded} of 4 documents uploaded`
            : !accountCreated
            ? 'Step 1 of 3 — Account info'
            : 'Step 2 of 3 — Vehicle info'}
        </Text>

        {/* ── ACCOUNT SECTION ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>👤 Account</Text>
            {accountCreated && <Text style={styles.sectionDone}>✓ Done</Text>}
          </View>
          <View style={styles.emailBadge}>
            <Text style={styles.emailBadgeIcon}>✅</Text>
            <Text style={styles.emailBadgeText}>{email ?? phone}</Text>
          </View>
          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your full name"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="words"
            editable={!accountCreated}
          />
          <Text style={styles.label}>Gender</Text>
          <View style={styles.genderRow}>
            {GENDERS.map((g) => (
              <TouchableOpacity
                key={g.value}
                style={[styles.genderBtn, gender === g.value && styles.genderBtnSelected]}
                onPress={() => !accountCreated && setGender(g.value)}
                activeOpacity={accountCreated ? 1 : 0.8}
              >
                <Text style={[styles.genderLabel, gender === g.value && styles.genderLabelSelected]}>
                  {g.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── VEHICLE SECTION ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🚘 Vehicle</Text>
            {vehicleSaved && <Text style={styles.sectionDone}>✓ Done</Text>}
          </View>

          {/* Vehicle Number */}
          <Text style={styles.label}>Vehicle Number</Text>
          <View style={styles.vehicleNumRow}>
            <TextInput
              style={[
                styles.input, styles.vehicleNumInput,
                vehicleNumberStatus === 'ok' && styles.inputOk,
                vehicleNumberStatus === 'error' && styles.inputError,
              ]}
              value={vehicleNumber}
              onChangeText={(t) => setVehicleNumber(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="MH12AB1234"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
              maxLength={10}
            />
            {vehicleNumberStatus === 'checking' && (
              <ActivityIndicator color={Colors.primary} style={styles.vehicleStatusIcon} />
            )}
            {vehicleNumberStatus === 'ok' && (
              <Text style={[styles.vehicleStatusIcon, styles.ok]}>✓</Text>
            )}
            {vehicleNumberStatus === 'error' && (
              <Text style={[styles.vehicleStatusIcon, styles.err]}>✗</Text>
            )}
          </View>
          {vehicleNumberStatus === 'error' && (
            <Text style={styles.errorText}>{vehicleNumberError}</Text>
          )}
          <Text style={styles.hint}>Format: MH12AB1234 (state code + RTO + series + number)</Text>

          {/* License Number */}
          <Text style={styles.label}>Driving License Number</Text>
          <TextInput
            style={styles.input}
            value={licenseNumber}
            onChangeText={(t) => setLicenseNumber(t.toUpperCase())}
            placeholder="MH1234567890123"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="characters"
            maxLength={16}
          />

          {/* Make / Model */}
          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={styles.label}>Make</Text>
              <TextInput
                style={styles.input}
                value={make}
                onChangeText={setMake}
                placeholder="Maruti"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            <View style={styles.halfField}>
              <Text style={styles.label}>Model</Text>
              <TextInput
                style={styles.input}
                value={model}
                onChangeText={setModel}
                placeholder="Swift"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
          </View>

          {/* Color / Seats */}
          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={styles.label}>Color</Text>
              <TextInput
                style={styles.input}
                value={color}
                onChangeText={setColor}
                placeholder="White"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            <View style={styles.halfField}>
              <Text style={styles.label}>Seats</Text>
              <TextInput
                style={styles.input}
                value={seats}
                onChangeText={setSeats}
                placeholder="4"
                placeholderTextColor={Colors.textMuted}
                keyboardType="number-pad"
                maxLength={1}
              />
            </View>
          </View>

          {/* Vehicle Type */}
          <Text style={styles.label}>Vehicle Type</Text>
          <View style={styles.typeRow}>
            {VEHICLE_TYPES.map((vt) => (
              <TouchableOpacity
                key={vt.value}
                style={[styles.typeBtn, vehicleType === vt.value && styles.typeBtnSelected]}
                onPress={() => setVehicleType(vt.value)}
                activeOpacity={0.8}
              >
                <Text style={styles.typeIcon}>{vt.icon}</Text>
                <Text style={[styles.typeLabel, vehicleType === vt.value && styles.typeLabelSelected]}>
                  {vt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, (saving || vehicleSaved) && styles.btnDisabled]}
            onPress={handleSaveVehicle}
            disabled={saving || vehicleSaved}
          >
            {saving
              ? <ActivityIndicator color={Colors.primary} />
              : <Text style={styles.saveBtnText}>
                  {vehicleSaved ? '✓ Vehicle info saved' : 'Save vehicle info'}
                </Text>
            }
          </TouchableOpacity>
        </View>

        {/* ── DOCUMENTS SECTION ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 Documents</Text>
          <Text style={styles.docNote}>
            Upload clear photos (JPG/PNG). All 4 are required before submitting.
          </Text>
          {DOCS.map((doc) => (
            <View key={doc.key}>
              <TouchableOpacity
                style={[
                  styles.docRow,
                  docs[doc.key] === 'uploaded' && styles.docRowUploaded,
                  docs[doc.key] === 'error' && styles.docRowError,
                ]}
                onPress={() => docs[doc.key] !== 'uploading' && handleUploadDoc(doc.key)}
                disabled={docs[doc.key] === 'uploading'}
                activeOpacity={0.8}
              >
                <Text style={styles.docIcon}>{doc.icon}</Text>
                <View style={styles.docText}>
                  <Text style={styles.docLabel}>{doc.label}</Text>
                  <Text style={styles.docStatus}>
                    {docs[doc.key] === 'uploaded'
                      ? 'Uploaded — tap to replace'
                      : docs[doc.key] === 'uploading'
                      ? 'Uploading…'
                      : docs[doc.key] === 'error'
                      ? 'Failed — tap to retry'
                      : 'Tap to upload'}
                  </Text>
                </View>
                {docs[doc.key] === 'uploading'
                  ? <ActivityIndicator color={Colors.primary} />
                  : <Text style={styles.docStatusIcon}>{docStatusIcon(docs[doc.key])}</Text>
                }
              </TouchableOpacity>
              {docErrors[doc.key] ? (
                <Text style={styles.errorText}>{docErrors[doc.key]}</Text>
              ) : null}
            </View>
          ))}
        </View>

        {/* ── SUBMIT ── */}
        <TouchableOpacity
          style={[styles.submitBtn, (!canSubmit || submitting) && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit || submitting}
          activeOpacity={0.85}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitBtnText}>Submit for review</Text>}
        </TouchableOpacity>
        {!canSubmit && (
          <Text style={styles.submitHint}>
            {!accountCreated
              ? 'Save your account info first.'
              : !vehicleSaved
              ? 'Save your vehicle info next.'
              : `Upload all 4 documents (${docsUploaded}/4 done).`}
          </Text>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 56 },

  progressBar: { height: 4, backgroundColor: Colors.border, borderRadius: 2, marginBottom: 6 },
  progressFill: { height: 4, backgroundColor: Colors.primary, borderRadius: 2 },
  progressLabel: { fontSize: 12, color: Colors.textMuted, textAlign: 'right', marginBottom: 24 },

  section: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 20,
    marginBottom: 20, borderWidth: 1, borderColor: Colors.border,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  sectionDone: { fontSize: 13, fontWeight: '700', color: Colors.success },

  emailBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primaryLight,
    borderRadius: 10, padding: 10, marginBottom: 16, gap: 8,
  },
  emailBadgeIcon: { fontSize: 14 },
  emailBadgeText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },

  label: {
    fontSize: 12, fontWeight: '600', color: Colors.textSecondary,
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  hint: { fontSize: 11, color: Colors.textMuted, marginTop: -6, marginBottom: 14 },
  input: {
    backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: Colors.textPrimary, marginBottom: 14,
  },
  inputOk: { borderColor: Colors.success },
  inputError: { borderColor: Colors.error },
  errorText: { fontSize: 12, color: Colors.error, marginTop: -10, marginBottom: 12 },

  genderRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  genderBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  genderBtnSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  genderLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  genderLabelSelected: { color: Colors.primary },

  vehicleNumRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  vehicleNumInput: { flex: 1, letterSpacing: 2, fontWeight: '700' },
  vehicleStatusIcon: { fontSize: 20, fontWeight: '700' },
  ok: { color: Colors.success },
  err: { color: Colors.error },

  row: { flexDirection: 'row', gap: 10 },
  halfField: { flex: 1 },

  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  typeBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background, gap: 4,
  },
  typeBtnSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  typeIcon: { fontSize: 22 },
  typeLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  typeLabelSelected: { color: Colors.primary },

  saveBtn: {
    backgroundColor: Colors.primaryLight, borderRadius: 12, paddingVertical: 12,
    alignItems: 'center', borderWidth: 1.5, borderColor: Colors.primary, marginTop: 4,
  },
  saveBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 14 },

  docNote: { fontSize: 13, color: Colors.textMuted, marginBottom: 16, lineHeight: 18 },
  docRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background,
    borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border, gap: 12,
  },
  docRowUploaded: { borderColor: Colors.success, backgroundColor: '#f0fdf4' },
  docRowError: { borderColor: Colors.error, backgroundColor: '#fff1f2' },
  docIcon: { fontSize: 24 },
  docText: { flex: 1 },
  docLabel: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  docStatus: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  docStatusIcon: { fontSize: 18 },

  submitBtn: {
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12,
    elevation: 6, marginTop: 8,
  },
  btnDisabled: { opacity: 0.45 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  submitHint: { textAlign: 'center', fontSize: 12, color: Colors.textMuted, marginTop: 10, lineHeight: 18 },
});

/*
 * ── driverService.uploadDriverDocument ──────────────────────────────────────
 * Add this function to services/driverService.ts:
 *
 * export async function uploadDriverDocument(params: {
 *   doc_type: string;
 *   uri: string;
 *   base64?: string;
 *   mimeType: string;
 *   fileName: string;
 * }) {
 *   const formData = new FormData();
 *   formData.append('doc_type', params.doc_type);
 *   formData.append('file', {
 *     uri: params.uri,
 *     type: params.mimeType,
 *     name: params.fileName,
 *   } as any);
 *
 *   const token = await getIdToken();   // your auth helper
 *   const res = await fetch(`${API_BASE}/driver/upload-document`, {
 *     method: 'POST',
 *     headers: { Authorization: `Bearer ${token}` },
 *     body: formData,
 *   });
 *   if (!res.ok) {
 *     const err = await res.json().catch(() => ({}));
 *     throw new Error(err.detail ?? 'Upload failed');
 *   }
 *   return res.json();
 * }
 */