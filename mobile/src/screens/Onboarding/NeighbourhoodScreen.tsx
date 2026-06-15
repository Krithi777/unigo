/**
 * NeighbourhoodScreen — Locality trust layer.
 *
 * Flow:
 *   1. User types their locality/area manually.
 *   2. App requests GPS location and shows it on a map (MapView).
 *   3. User can compare their typed area vs their GPS pin.
 *   4. If GPS location matches their typed area (within reasonable bounds),
 *      they confirm and join the neighbourhood pool.
 *   5. locality_confirmed starts false; GPS from future rides upgrades it.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, ActivityIndicator, Alert,
  Platform, KeyboardAvoidingView,
} from 'react-native';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../navigation/types';
import { Colors } from '../../constants/colors';
import { communityService } from '../../services/communityService';
import { useAuth } from '../../context/AuthContext';

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'Neighbourhood'>;

const LOCALITIES = [
  'Velachery', 'Tambaram', 'Adyar', 'Anna Nagar', 'T. Nagar',
  'Porur', 'Chromepet', 'Pallavaram', 'Medavakkam', 'Perungudi',
  'OMR', 'ECR', 'Sholinganallur', 'Thoraipakkam', 'Perambur',
  'Egmore', 'Mylapore', 'Nungambakkam', 'Guindy', 'Kodambakkam',
  'Saidapet', 'Ambattur', 'Avadi', 'Poonamallee', 'Madipakkam',
  'White Town', 'Lawspet', 'Mudaliarpet', 'Ariyankuppam', 'Ozhukarai',
  'Villianur', 'Reddiarpalayam', 'Muthialpet', 'Puducherry Town',
];

interface GpsCoords {
  latitude: number;
  longitude: number;
}

export default function NeighbourhoodScreen() {
  const navigation = useNavigation<Nav>();
  const { user, communities, setSession } = useAuth();

  const [locality, setLocality] = useState('');
  const [filter, setFilter] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<GpsCoords | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsAddress, setGpsAddress] = useState('');
  const [gpsError, setGpsError] = useState('');
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  const filtered = LOCALITIES.filter((l) =>
    l.toLowerCase().includes(filter.toLowerCase()),
  );

  const getGpsLocation = async () => {
    setGpsLoading(true);
    setGpsError('');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGpsError('Location permission denied. You can still join by entering your area manually.');
        setGpsLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setGpsCoords(coords);

      // Reverse geocode to get human-readable address
      const [geocoded] = await Location.reverseGeocodeAsync(coords);
      if (geocoded) {
        const parts = [
          geocoded.district,
          geocoded.subregion,
          geocoded.city,
        ].filter(Boolean);
        setGpsAddress(parts.join(', ') || 'Location obtained');
      }
    } catch (e: any) {
      setGpsError('Could not get your location. You can still join manually.');
    } finally {
      setGpsLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!locality) return;
    setJoining(true);
    try {
      const res = await communityService.joinOrCreate({
        name: locality,
        type: 'neighborhood',
        trust_layer: 'locality',
        locality_confirmed: false,
      });
      setJoined(true);
      setSession(user!, [...communities, res.community]);
    } catch (e: any) {
      if (e?.message?.includes('Already a member')) {
        setJoined(true);
      } else {
        Alert.alert('Could not join', e?.message ?? 'Neighbourhood join failed. Please try again.');
      }
    } finally {
      setJoining(false);
    }
  };

  if (joined) {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={[s.scroll, { alignItems: 'center', paddingTop: 60 }]}>
          <Text style={{ fontSize: 52, marginBottom: 16 }}>📍</Text>
          <Text style={s.title}>Neighbourhood Joined!</Text>
          <Text style={[s.subtitle, { textAlign: 'center', marginBottom: 24 }]}>
            You're now in the <Text style={{ fontWeight: '700', color: Colors.success }}>{locality}</Text> pool.{'\n'}
            Your badge starts as{' '}
            <Text style={{ color: Colors.warning, fontStyle: 'italic' }}>Unconfirmed</Text>{' '}
            and upgrades to{' '}
            <Text style={{ color: Colors.success, fontStyle: 'italic' }}>Confirmed</Text>{' '}
            automatically as your rides verify your location.
          </Text>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: Colors.success, width: '80%' }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={s.btnText}>Done →</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

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
            <Text style={s.emoji}>📍</Text>
            <Text style={s.title}>Your Neighbourhood</Text>
            <Text style={s.subtitle}>
              Select your area manually below. You can also let us use your GPS to see
              where you actually are on the map — this helps confirm your location.
            </Text>
          </View>

          {/* Manual locality picker */}
          <View style={s.card}>
            <Text style={s.cardLabel}>Select your neighbourhood *</Text>

            <TouchableOpacity
              style={s.picker}
              onPress={() => setShowDropdown((v) => !v)}
            >
              <Text style={locality ? s.pickerSelected : s.pickerPlaceholder}>
                {locality || 'Choose your area…'}
              </Text>
              <Text style={s.chevron}>{showDropdown ? '▲' : '▼'}</Text>
            </TouchableOpacity>

            {showDropdown && (
              <View style={s.dropdown}>
                <TextInput
                  style={s.dropdownSearch}
                  placeholder="Search locality…"
                  placeholderTextColor={Colors.textMuted}
                  value={filter}
                  onChangeText={setFilter}
                  autoFocus
                />
                <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                  {filtered.map((loc) => (
                    <TouchableOpacity
                      key={loc}
                      style={s.dropdownItem}
                      onPress={() => {
                        setLocality(loc);
                        setShowDropdown(false);
                        setFilter('');
                      }}
                    >
                      <Text style={s.dropdownItemText}>{loc}</Text>
                    </TouchableOpacity>
                  ))}
                  {filtered.length === 0 && (
                    <Text style={s.noResults}>No match — try different spelling</Text>
                  )}
                </ScrollView>
              </View>
            )}

            {locality ? (
              <View style={s.selectedBadge}>
                <Text style={s.selectedBadgeText}>📍 {locality} selected</Text>
              </View>
            ) : null}
          </View>

          {/* GPS location card */}
          <View style={s.card}>
            <Text style={s.cardLabel}>Confirm with GPS (optional but recommended)</Text>
            <Text style={s.gpsHint}>
              Your GPS pin helps verify that your selected area matches where you actually live.
            </Text>

            {!gpsCoords && (
              <TouchableOpacity
                style={[s.btn, { backgroundColor: Colors.textSecondary }, gpsLoading && s.btnDisabled]}
                onPress={getGpsLocation}
                disabled={gpsLoading}
              >
                {gpsLoading
                  ? <><ActivityIndicator color="#fff" style={{ marginRight: 8 }} /><Text style={s.btnText}>Getting location…</Text></>
                  : <Text style={s.btnText}>📡 Use my GPS location</Text>}
              </TouchableOpacity>
            )}

            {gpsError ? (
              <Text style={s.gpsError}>{gpsError}</Text>
            ) : null}

            {gpsCoords && (
              <>
                <View style={s.gpsAddressRow}>
                  <Text style={s.gpsAddressLabel}>📡 GPS says you're near:</Text>
                  <Text style={s.gpsAddressText}>{gpsAddress || 'Location obtained'}</Text>
                </View>

                {/* Map view */}
                <View style={s.mapContainer}>
                  <MapView
                    provider={PROVIDER_GOOGLE}
                    style={s.map}
                    initialRegion={{
                      ...gpsCoords,
                      latitudeDelta: 0.025,
                      longitudeDelta: 0.025,
                    }}
                    scrollEnabled={false}
                    zoomEnabled={false}
                  >
                    <Marker coordinate={gpsCoords} title="Your GPS location" />
                    <Circle
                      center={gpsCoords}
                      radius={1500}
                      strokeColor={Colors.primary + '80'}
                      fillColor={Colors.primary + '20'}
                    />
                  </MapView>
                </View>

                {locality && (
                  <View style={s.comparisonBox}>
                    <Text style={s.comparisonLabel}>Comparison</Text>
                    <Text style={s.comparisonText}>
                      You selected <Text style={{ fontWeight: '700' }}>{locality}</Text>.
                      {'\n'}GPS shows you near <Text style={{ fontWeight: '700' }}>{gpsAddress || 'your location'}</Text>.
                      {'\n\n'}If these look different, please select the correct neighbourhood above.
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[s.btn, { backgroundColor: Colors.textMuted, marginTop: 8 }]}
                  onPress={getGpsLocation}
                >
                  <Text style={s.btnText}>🔄 Refresh GPS</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Join button */}
          <TouchableOpacity
            style={[s.btn, { backgroundColor: Colors.success, marginTop: 4 }, (!locality || joining) && s.btnDisabled]}
            onPress={handleJoin}
            disabled={!locality || joining}
          >
            {joining
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnText}>
                  {locality ? `Join ${locality} pool →` : 'Select a neighbourhood first'}
                </Text>}
          </TouchableOpacity>

          <Text style={s.footnote}>
            Your badge starts as Unconfirmed and upgrades automatically as rides verify your location.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 56 },

  back: { marginBottom: 20 },
  backText: { fontSize: 17, color: Colors.primary, fontWeight: '600' },

  header: { marginBottom: 24 },
  emoji: { fontSize: 36, marginBottom: 10 },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },

  card: {
    backgroundColor: Colors.surface, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: Colors.border, marginBottom: 14,
  },
  cardLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 10 },

  picker: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: Colors.background,
  },
  pickerSelected: { fontSize: 15, color: Colors.textPrimary, fontWeight: '600' },
  pickerPlaceholder: { fontSize: 15, color: Colors.textMuted },
  chevron: { fontSize: 12, color: Colors.textMuted },

  dropdown: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    backgroundColor: Colors.surface, marginTop: 4, overflow: 'hidden',
  },
  dropdownSearch: {
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: Colors.textPrimary,
  },
  dropdownItem: {
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  dropdownItemText: { fontSize: 14, color: Colors.textPrimary },
  noResults: { padding: 12, fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

  selectedBadge: {
    marginTop: 10, backgroundColor: '#DCFCE7', borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  selectedBadgeText: { fontSize: 13, fontWeight: '600', color: '#166534' },

  gpsHint: { fontSize: 13, color: Colors.textSecondary, marginBottom: 12, lineHeight: 18 },
  gpsError: { fontSize: 13, color: Colors.warning, marginTop: 8, lineHeight: 18 },

  gpsAddressRow: {
    backgroundColor: Colors.primaryLight, borderRadius: 10, padding: 12, marginBottom: 12,
  },
  gpsAddressLabel: { fontSize: 11, fontWeight: '700', color: Colors.primary, marginBottom: 4 },
  gpsAddressText: { fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },

  mapContainer: {
    borderRadius: 12, overflow: 'hidden', height: 200,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 12,
  },
  map: { flex: 1 },

  comparisonBox: {
    backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: Colors.warning, marginBottom: 10,
  },
  comparisonLabel: { fontSize: 11, fontWeight: '700', color: '#92400E', marginBottom: 6 },
  comparisonText: { fontSize: 13, color: '#78350F', lineHeight: 19 },

  btn: {
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center',
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.4 },

  footnote: {
    textAlign: 'center', fontSize: 12, color: Colors.textMuted,
    marginTop: 12, lineHeight: 17,
  },
});