/**
 * AdminDriverDetailScreen — per-driver doc review: approve / reject each document.
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { Colors } from '../../constants/colors';
import { reviewDocument, PendingDriver } from '../../services/adminService';

interface Props {
  driver: PendingDriver;
  onBack: () => void;
}

const DOC_KEYS: Array<{ key: 'license' | 'rc' | 'insurance' | 'puc'; label: string; icon: string }> = [
  { key: 'license', label: 'Driving License', icon: '🪪' },
  { key: 'rc', label: 'RC Book', icon: '📄' },
  { key: 'insurance', label: 'Insurance', icon: '🛡️' },
  { key: 'puc', label: 'PUC Certificate', icon: '🌿' },
];

export default function AdminDriverDetailScreen({ driver, onBack }: Props) {
  const [docStates, setDocStates] = useState<Record<string, boolean | null>>({
    license: driver.license_verified,
    rc: driver.rc_verified,
    insurance: driver.insurance_verified,
    puc: driver.puc_verified,
  });
  const [rejectionNotes, setRejectionNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);

  const handleReview = async (
    docKey: 'license' | 'rc' | 'insurance' | 'puc',
    approved: boolean,
  ) => {
    if (!approved && !rejectionNotes[docKey]?.trim()) {
      Alert.alert('Note required', 'Add a rejection note before rejecting.');
      return;
    }
    try {
      setLoading(docKey + (approved ? '_approve' : '_reject'));
      const res = await reviewDocument({
        driver_user_id: driver.user_id,
        doc_type: docKey,
        approved,
        rejection_note: rejectionNotes[docKey],
      });
      setDocStates((prev) => ({ ...prev, [docKey]: approved }));
      if (res.is_active) {
        Alert.alert('Driver activated!', `All documents approved. ${driver.name} is now active.`);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Review failed.');
    } finally { setLoading(null); }
  };

  const docStatus = (key: string) => {
    const val = docStates[key];
    if (val === true) return { icon: '✅', label: 'Approved', color: Colors.success };
    if (val === false) return { icon: '❌', label: 'Rejected', color: Colors.error };
    return { icon: '⏳', label: 'Pending', color: Colors.warning };
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Driver Review</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Driver Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>👤 Driver Info</Text>
          <Row label="Name" value={driver.name} />
          <Row label="Phone" value={driver.phone} />
          {driver.email && <Row label="Email" value={driver.email} />}
        </View>

        {/* Vehicle Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🚘 Vehicle Info</Text>
          <Row label="Number" value={driver.vehicle_number} />
          <Row label="Make / Model" value={`${driver.vehicle_make ?? '-'} ${driver.vehicle_model ?? ''}`} />
          <Row label="Color" value={driver.vehicle_color ?? '-'} />
          <Row label="Type" value={driver.vehicle_type ?? '-'} />
          <Row label="Seats" value={String(driver.seats_available_default ?? '-')} />
        </View>

        {/* Documents */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 Documents</Text>
          {DOC_KEYS.map(({ key, label, icon }) => {
            const status = docStatus(key);
            const isApproving = loading === key + '_approve';
            const isRejecting = loading === key + '_reject';
            return (
              <View key={key} style={styles.docCard}>
                <View style={styles.docHeader}>
                  <Text style={styles.docIcon}>{icon}</Text>
                  <Text style={styles.docLabel}>{label}</Text>
                  <View style={[styles.docBadge, { backgroundColor: status.color + '22' }]}>
                    <Text style={[styles.docBadgeText, { color: status.color }]}>{status.label}</Text>
                  </View>
                </View>

                {/* Document preview placeholder */}
                {(driver as any)[`${key}_url`] ? (
                  <View style={styles.docPreview}>
                    <Text style={styles.docPreviewText}>📎 Document attached</Text>
                  </View>
                ) : (
                  <View style={styles.docPreview}>
                    <Text style={styles.docPreviewText}>⚠️ No document uploaded</Text>
                  </View>
                )}

                {/* Rejection note */}
                {docStates[key] !== true && (
                  <TextInput
                    style={styles.noteInput}
                    value={rejectionNotes[key] ?? ''}
                    onChangeText={(t) => setRejectionNotes((prev) => ({ ...prev, [key]: t }))}
                    placeholder="Rejection note (required to reject)"
                    placeholderTextColor={Colors.textMuted}
                    multiline
                  />
                )}

                <View style={styles.docActions}>
                  <TouchableOpacity
                    style={[styles.approveBtn, docStates[key] === true && styles.btnDone]}
                    onPress={() => handleReview(key, true)}
                    disabled={!!loading || docStates[key] === true}
                  >
                    {isApproving ? <ActivityIndicator color="#fff" /> : <Text style={styles.approveBtnText}>✓ Approve</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.rejectBtn, docStates[key] === false && styles.btnDone]}
                    onPress={() => handleReview(key, false)}
                    disabled={!!loading || docStates[key] === false}
                  >
                    {isRejecting ? <ActivityIndicator color="#fff" /> : <Text style={styles.rejectBtnText}>✗ Reject</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backText: { fontSize: 17, color: Colors.primary, fontWeight: '600', width: 60 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  scroll: { padding: 16, gap: 16 },
  section: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowLabel: { fontSize: 13, color: Colors.textSecondary },
  rowValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, maxWidth: '60%', textAlign: 'right' },
  docCard: {
    backgroundColor: Colors.background, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 12,
  },
  docHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  docIcon: { fontSize: 22 },
  docLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  docBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  docBadgeText: { fontSize: 11, fontWeight: '700' },
  docPreview: {
    backgroundColor: Colors.surface, borderRadius: 8, padding: 12,
    alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: Colors.border,
  },
  docPreviewText: { fontSize: 13, color: Colors.textMuted },
  noteInput: {
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13,
    color: Colors.textPrimary, marginBottom: 10, minHeight: 50,
  },
  docActions: { flexDirection: 'row', gap: 8 },
  approveBtn: {
    flex: 1, backgroundColor: Colors.success, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  rejectBtn: {
    flex: 1, backgroundColor: Colors.error, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  btnDone: { opacity: 0.45 },
  approveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  rejectBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});