/**
 * AdminDashboardScreen — lists pending drivers, allows per-document approve/reject.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  FlatList, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { Colors } from '../../constants/colors';
import { getPendingDrivers, reviewDocument, PendingDriver } from '../../services/adminService';
import { useAuth } from '../../context/AuthContext';
import AdminDriverDetailScreen from './AdminDriverDetailScreen';

export default function AdminDashboardScreen() {
  const { signOut } = useAuth();
  const [drivers, setDrivers] = useState<PendingDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<PendingDriver | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getPendingDrivers();
      setDrivers(data);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to load drivers.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const stateColor = (state: string) => {
    if (state === 'pending_review') return Colors.warning;
    if (state === 'action_required') return Colors.error;
    if (state === 'active') return Colors.success;
    return Colors.textMuted;
  };

  if (selectedDriver) {
    return (
      <AdminDriverDetailScreen
        driver={selectedDriver}
        onBack={() => { setSelectedDriver(null); load(); }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Admin Dashboard</Text>
          <Text style={styles.headerSub}>{drivers.length} pending review</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={() => {
          Alert.alert('Sign out', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out', onPress: signOut, style: 'destructive' },
          ]);
        }}>
          <Text style={styles.logoutBtnText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={Colors.primary} size="large" /></View>
      ) : drivers.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>🎉</Text>
          <Text style={styles.emptyText}>No pending applications</Text>
          <Text style={styles.emptySub}>All drivers have been reviewed.</Text>
        </View>
      ) : (
        <FlatList
          data={drivers}
          keyExtractor={(d) => d.user_id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => setSelectedDriver(item)} activeOpacity={0.85}>
              <View style={styles.cardTop}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{item.name?.[0]?.toUpperCase() ?? '?'}</Text>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName}>{item.name}</Text>
                  <Text style={styles.cardPhone}>{item.phone}</Text>
                  <Text style={styles.cardVehicle}>{item.vehicle_number} · {item.vehicle_make} {item.vehicle_model}</Text>
                </View>
                <View style={[styles.stateBadge, { backgroundColor: stateColor(item.submission_state) + '22' }]}>
                  <Text style={[styles.stateBadgeText, { color: stateColor(item.submission_state) }]}>
                    {item.submission_state === 'pending_review' ? 'Pending' : item.submission_state === 'action_required' ? 'Action' : item.submission_state}
                  </Text>
                </View>
              </View>
              <View style={styles.docRow}>
                {['license', 'rc', 'insurance', 'puc'].map((doc) => {
                  const val = item[`${doc}_verified` as keyof PendingDriver] as boolean | null;
                  const icon = val === true ? '✅' : val === false ? '❌' : '⏳';
                  return <Text key={doc} style={styles.docDot}>{icon}</Text>;
                })}
                <Text style={styles.docHint}>Tap to review →</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  headerSub: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  logoutBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border },
  logoutBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  emptySub: { fontSize: 14, color: Colors.textMuted },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  cardPhone: { fontSize: 13, color: Colors.textSecondary },
  cardVehicle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  stateBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  stateBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  docDot: { fontSize: 16 },
  docHint: { fontSize: 12, color: Colors.textMuted, marginLeft: 'auto' },
});