/**
 * CreateRideScreen.tsx — Phase 1 + Phase 3.
 *
 * Driver creates a new scheduled ride.
 * Features:
 *   - MapPicker for pickup location (Phase 1)
 *   - Women-Only toggle with purple accent styling (Phase 3)
 *   - Calls POST /rides/create on submit
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Switch,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import MapPicker from '@/components/rides/MapPreview';
import { createRide } from '@/services/ridesApi';

export default function CreateRideScreen() {
  
const navigation = useNavigation<any>();
  // ---- form state ----
  const [pickup, setPickup] = useState<{
    lat: number;
    lng: number;
    address?: string;
  } | null>(null);
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoffLat, setDropoffLat] = useState('');
  const [dropoffLng, setDropoffLng] = useState('');
  const [seatsTotal, setSeatsTotal] = useState('4');
  const [womenOnly, setWomenOnly] = useState(false);
  const [departure, setDeparture] = useState<Date>(
    new Date(Date.now() + 30 * 60_000)
  );
  const [loading, setLoading] = useState(false);

  const adjustDeparture = (minutes: number) => {
    setDeparture((current) => new Date(current.getTime() + minutes * 60_000));
  };

  const handleSubmit = async () => {
    if (!pickup) {
      Alert.alert('Missing pickup', 'Please tap the map to set a pickup location.');
      return;
    }
    if (!dropoffAddress.trim()) {
      Alert.alert('Missing dropoff', 'Please enter a dropoff address.');
      return;
    }
    const seats = parseInt(seatsTotal, 10);
    if (isNaN(seats) || seats < 1 || seats > 8) {
      Alert.alert('Invalid seats', 'Seats must be between 1 and 8.');
      return;
    }

    try {
      setLoading(true);
      const driverId = await AsyncStorage.getItem('user_id');
      const communityId = await AsyncStorage.getItem('community_id');

      if (!driverId || !communityId) {
        Alert.alert('Error', 'Session expired. Please log in again.');
        return;
      }

      await createRide({
        driver_id: driverId,
        community_id: communityId,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        pickup_address: pickup.address,
        dropoff_lat: parseFloat(dropoffLat) || 0,
        dropoff_lng: parseFloat(dropoffLng) || 0,
        dropoff_address: dropoffAddress.trim(),
        departure_time: departure.toISOString(),
        seats_total: seats,
        women_only: womenOnly,
      });

      Alert.alert('Ride Created! 🚗', 'Your ride has been posted to your community.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Post a Ride 🚗</Text>

      {/* ---- Pickup location ---- */}
      <Text style={styles.label}>Pickup Location</Text>
      <MapPicker
        style={styles.mapPicker}
        onLocationSelected={(lat, lng, address) => setPickup({ lat, lng, address })}
      />
      {pickup?.address && (
        <Text style={styles.addressHint}>{pickup.address}</Text>
      )}

      {/* ---- Dropoff ---- */}
      <Text style={styles.label}>Dropoff Address</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Tidel Park, Taramani"
        value={dropoffAddress}
        onChangeText={setDropoffAddress}
        returnKeyType="next"
      />

      {/* ---- Departure time ---- */}
      <Text style={styles.label}>Departure Time</Text>
      <View style={styles.departureBox}>
        <Text style={styles.dateText}>
          {departure.toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </Text>
        <View style={styles.departureActions}>
          <TouchableOpacity style={styles.timeButton} onPress={() => adjustDeparture(-15)}>
            <Text style={styles.timeButtonText}>-15 min</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.timeButton} onPress={() => adjustDeparture(15)}>
            <Text style={styles.timeButtonText}>+15 min</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ---- Seats ---- */}
      <Text style={styles.label}>Available Seats</Text>
      <TextInput
        style={[styles.input, styles.inputSmall]}
        placeholder="4"
        value={seatsTotal}
        onChangeText={setSeatsTotal}
        keyboardType="number-pad"
        maxLength={1}
      />

      {/* ---- Women-Only toggle (Phase 3) ---- */}
      <View style={[styles.toggleRow, womenOnly && styles.toggleRowActive]}>
        <View>
          <Text style={[styles.toggleLabel, womenOnly && styles.toggleLabelActive]}>
            Women-Only Ride 🚺
          </Text>
          {womenOnly && (
            <Text style={styles.toggleHint}>
              Only female riders can join this ride
            </Text>
          )}
        </View>
        <Switch
          value={womenOnly}
          onValueChange={setWomenOnly}
          trackColor={{ false: '#CBD5E0', true: '#C084FC' }}
          thumbColor={womenOnly ? '#9333EA' : '#fff'}
        />
      </View>

      {/* ---- Submit ---- */}
      <TouchableOpacity
        style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>Post Ride</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 20, paddingBottom: 48 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
    marginTop: 16,
  },
  mapPicker: { marginBottom: 4 },
  addressHint: {
    fontSize: 12,
    color: '#6C47FF',
    marginTop: 4,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#fff',
    color: '#1E293B',
    justifyContent: 'center',
  },
  inputSmall: { width: 80 },
  dateText: { color: '#1E293B', fontSize: 15 },
  departureBox: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#fff',
    gap: 10,
  },
  departureActions: { flexDirection: 'row', gap: 8 },
  timeButton: {
    flex: 1,
    backgroundColor: '#F4F4F8',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  timeButtonText: { color: '#6C47FF', fontWeight: '700', fontSize: 13 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  toggleRowActive: {
    borderColor: '#C084FC',
    backgroundColor: '#FAF5FF',
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  toggleLabelActive: { color: '#7E22CE' },
  toggleHint: {
    fontSize: 12,
    color: '#9333EA',
    marginTop: 3,
  },
  submitBtn: {
    backgroundColor: '#6C47FF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
