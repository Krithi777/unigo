/**
 * DriverPendingReviewScreen — shown after submission and until is_active=true.
 * Also handles "Action Required" if a doc is rejected.
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { Colors } from '../../constants/colors';
import { getDriverProfile } from '../../services/driverService';
import { useAuth } from '../../context/AuthContext';

const DOC_LABELS: Record<string, string> = {
  license: 'Driving License',
  rc: 'RC Book',
  insurance: 'Insurance',
  puc: 'PUC Certificate',
};

export default function DriverPendingReviewScreen() {
  const { driverProfile, signOut } = useAuth();
  const [profile, setProfile] = useState<any>(driverProfile);
  const [refreshing, setRefreshing] = useState(false);

  const submissionState = profile?.submission_state ?? 'pending_review';
  const rejectedDocs = Object.entries({
    license: profile?.license_verified,
    rc: profile?.rc_verified,
    insurance: profile?.insurance_verified,
    puc: profile?.puc_verified,
  }).filter(([, v]) => v === false).map(([k]) => k);

  const refresh = async () => {
    try {
      setRefreshing(true);
      const dp = await getDriverProfile();
      setProfile(dp);
    } catch { /* ignore */ }
    finally { setRefreshing(false); }
  };

  useEffect(() => { refresh(); }, []);

  const isActionRequired = submissionState === 'action_required' || rejectedDocs.length > 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>{isActionRequired ? '⚠️' : '🔍'}</Text>
        </View>
        <Text style={styles.title}>
          {isActionRequired ? 'Action Required' : 'Profile Under Review'}
        </Text>
        <Text style={styles.sub}>
          {isActionRequired
            ? 'Some documents need to be re-uploaded.'
            : "Your profile is under review. You'll be notified once approved."}
        </Text>

        {isActionRequired && rejectedDocs.length > 0 && (
          <View style={styles.rejectedCard}>
            <Text style={styles.rejectedTitle}>Documents to re-upload:</Text>
            {rejectedDocs.map((doc) => (
              <View key={doc} style={styles.rejectedDoc}>
                <Text style={styles.rejectedDocIcon}>❌</Text>
                <Text style={styles.rejectedDocLabel}>{DOC_LABELS[doc]}</Text>
              </View>
            ))}
            <TouchableOpacity style={styles.reuploadBtn} onPress={() => Alert.alert('Re-upload', 'Open DriverSetupScreen to re-upload.')}>
              <Text style={styles.reuploadBtnText}>Go to setup to re-upload</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Phone</Text>
            <Text style={styles.statusValue}>✅ Verified</Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Email</Text>
            <Text style={styles.statusValue}>✅ Verified</Text>
          </View>
          {['license', 'rc', 'insurance', 'puc'].map((doc) => {
            const val = profile?.[`${doc}_verified`];
            const icon = val === true ? '✅' : val === false ? '❌' : '⏳';
            return (
              <View key={doc} style={styles.statusRow}>
                <Text style={styles.statusLabel}>{DOC_LABELS[doc]}</Text>
                <Text style={styles.statusValue}>{icon} {val === true ? 'Approved' : val === false ? 'Rejected' : 'Pending'}</Text>
              </View>
            );
          })}
        </View>

        <TouchableOpacity style={styles.refreshBtn} onPress={refresh} disabled={refreshing}>
          {refreshing
            ? <ActivityIndicator color={Colors.primary} />
            : <Text style={styles.refreshBtnText}>Refresh status</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} onPress={() => {
          Alert.alert('Sign out', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out', onPress: signOut, style: 'destructive' },
          ]);
        }}>
          <Text style={styles.logoutBtnText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 48, alignItems: 'center' },
  iconWrap: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.primaryLight,
    justifyContent: 'center', alignItems: 'center', marginBottom: 24,
  },
  icon: { fontSize: 44 },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginBottom: 12 },
  sub: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  rejectedCard: {
    width: '100%', backgroundColor: '#FFF5F5', borderRadius: 14, padding: 16,
    borderWidth: 1.5, borderColor: Colors.error, marginBottom: 20,
  },
  rejectedTitle: { fontSize: 14, fontWeight: '700', color: Colors.error, marginBottom: 12 },
  rejectedDoc: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  rejectedDocIcon: { fontSize: 16 },
  rejectedDocLabel: { fontSize: 14, color: Colors.textPrimary },
  reuploadBtn: {
    backgroundColor: Colors.error, borderRadius: 10, paddingVertical: 10,
    alignItems: 'center', marginTop: 12,
  },
  reuploadBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  statusCard: {
    width: '100%', backgroundColor: Colors.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 24, gap: 10,
  },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusLabel: { fontSize: 14, color: Colors.textSecondary },
  statusValue: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  refreshBtn: {
    borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 32, marginBottom: 16,
  },
  refreshBtnText: { color: Colors.primary, fontWeight: '600', fontSize: 15 },
  logoutBtn: { marginTop: 8 },
  logoutBtnText: { color: Colors.textMuted, fontSize: 14, textDecorationLine: 'underline' },
});