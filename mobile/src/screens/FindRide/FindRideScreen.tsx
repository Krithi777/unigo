import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';

import {
  getWomenOnlyRides,
  joinRide,
  searchRides,
  type Ride,
} from '@/services/ridesApi';
import { decodePolyline } from '@/utils/decodePolyline';

const C = {
  brand: '#7F77DD',
  brandMid: '#534AB7',
  brandDark: '#3C3489',
  brandLight: '#F9F7FF',
  green: '#1D9E75',
  greenLight: '#E6F7F0',
  greenDark: '#085041',
  amber: '#EF9F27',
  amberLight: '#FAEEDA',
  red: '#E24B4A',
  pink: '#993556',
  pinkLight: '#FBEAF0',
  bg: '#F5F6FA',
  surface: '#FFFFFF',
  border: '#E5E7EB',
  text: '#111111',
  textSub: '#555555',
  textMuted: '#888888',
};

const DEFAULT_PICKUP = {
  address: 'Gate 1, NIT Trichy',
  latitude: 10.7589,
  longitude: 78.8132,
};

const KNOWN_PLACES: Record<string, { latitude: number; longitude: number }> = {
  'gate 1': DEFAULT_PICKUP,
  'nit trichy': DEFAULT_PICKUP,
  'trichy junction': { latitude: 10.7948, longitude: 78.6856 },
  'chennai central': { latitude: 13.0821, longitude: 80.2757 },
  't nagar': { latitude: 13.0418, longitude: 80.2341 },
  'tambaram': { latitude: 12.9249, longitude: 80.1 },
};

type Filter = 'all' | 'women' | 'morning' | 'evening';
type Coord = { latitude: number; longitude: number };

function placeToCoord(text: string, fallback: Coord): Coord {
  const value = text.trim().toLowerCase();
  const key = Object.keys(KNOWN_PLACES).find((item) => value.includes(item));
  return key ? KNOWN_PLACES[key] : fallback;
}

function formatTime(iso?: string): string {
  if (!iso) return 'Today';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Today';
  return date.toLocaleString('en-IN', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function initials(name?: string): string {
  return (name || 'Driver')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function matchColor(value: number): string {
  if (value >= 90) return C.green;
  if (value >= 75) return C.brandMid;
  return C.amber;
}

function getMatch(ride: Ride): number {
  return Math.round(
    ride.route_match_percent ||
      ride.optimized_route?.match_score ||
      86,
  );
}

function getFare(ride: Ride): string {
  return `Rs ${ride.estimated_fare_per_rider || 120}`;
}

function routeCoordinates(ride: Ride | null, pickup: Coord): Coord[] {
  if (!ride) return [];
  const decoded = ride.optimized_route?.overview_polyline
    ? decodePolyline(ride.optimized_route.overview_polyline)
    : [];
  if (decoded.length > 1) return decoded;
  return [
    pickup,
    { latitude: ride.pickup_lat, longitude: ride.pickup_lng },
    { latitude: ride.dropoff_lat, longitude: ride.dropoff_lng },
  ];
}

function FilterPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.pill, active && styles.pillActive]} onPress={onPress}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function RideCard({ ride, onPress }: { ride: Ride; onPress: () => void }) {
  const match = getMatch(ride);
  const driver = ride.users;
  const profile = ride.driver_profiles;
  const seats = `${ride.seats_available}/${ride.seats_total}`;

  return (
    <TouchableOpacity style={styles.rideCard} activeOpacity={0.86} onPress={onPress}>
      <View style={styles.cardTop}>
        <View style={styles.driverBlock}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(driver?.name)}</Text>
          </View>
          <View style={styles.driverCopy}>
            <Text style={styles.driverName} numberOfLines={1}>{driver?.name || 'Verified driver'}</Text>
            <Text style={styles.driverMeta} numberOfLines={1}>
              {driver?.reliability_score ? `${driver.reliability_score}% reliable` : 'Verified community driver'}
              {profile?.vehicle_make ? ` · ${profile.vehicle_make}` : ''}
            </Text>
          </View>
        </View>
        <View style={styles.fareBlock}>
          <Text style={styles.fare}>{getFare(ride)}</Text>
          <Text style={styles.fareSub}>your share</Text>
        </View>
      </View>

      <View style={styles.routeBlock}>
        <View style={styles.routeDots}>
          <View style={styles.dotGreen} />
          <View style={styles.dotLine} />
          <View style={styles.dotRed} />
        </View>
        <View style={styles.routeCopy}>
          <Text style={styles.address} numberOfLines={1}>{ride.pickup_address || 'Pickup point'}</Text>
          <Text style={styles.address} numberOfLines={1}>{ride.dropoff_address || 'Drop location'}</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaChip}>{formatTime(ride.departure_time)}</Text>
        <Text style={styles.metaChip}>{seats} seats</Text>
        {ride.women_only && <Text style={styles.womenChip}>Women only</Text>}
      </View>

      <View style={styles.featureRow}>
        <View style={[styles.matchPill, { backgroundColor: match >= 90 ? C.greenLight : C.brandLight }]}>
          <Text style={[styles.matchText, { color: matchColor(match) }]}>RouteMorph {match}%</Text>
        </View>
        <View style={styles.backupPill}>
          <Text style={styles.backupText}>Backup guaranteed</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function FindRideScreen() {
  const navigation = useNavigation<any>();
  const [pickupText, setPickupText] = useState(DEFAULT_PICKUP.address);
  const [dropText, setDropText] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [rides, setRides] = useState<Ride[]>([]);
  const [selected, setSelected] = useState<Ride | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [joining, setJoining] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const pickupCoord = useMemo(
    () => placeToCoord(pickupText, DEFAULT_PICKUP),
    [pickupText],
  );

  const loadRides = useCallback(async () => {
    const cid = communityId || (await AsyncStorage.getItem('community_id'));
    setCommunityId(cid);
    if (!cid) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const params = {
        community_id: cid,
        destination: dropText || undefined,
        pickup_lat: pickupCoord.latitude,
        pickup_lng: pickupCoord.longitude,
      };
      const data = filter === 'women'
        ? await getWomenOnlyRides(cid, params)
        : await searchRides({ ...params, women_only: undefined });

      const filtered = data.filter((ride) => {
        const hour = new Date(ride.departure_time).getHours();
        if (filter === 'morning') return hour >= 5 && hour < 12;
        if (filter === 'evening') return hour >= 16 && hour < 22;
        return true;
      });

      setRides(filtered);
    } catch (error: any) {
      Alert.alert('Could not find rides', error?.message || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [communityId, dropText, filter, pickupCoord.latitude, pickupCoord.longitude]);

  useEffect(() => {
    AsyncStorage.getItem('community_id').then(setCommunityId);
  }, []);

  useEffect(() => {
    setLoading(true);
    loadRides();
  }, [filter]);

  const handleSearch = () => {
    setHasSearched(true);
    setLoading(true);
    loadRides();
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadRides();
  };

  const handleJoin = async () => {
    if (!selected || joining) return;
    const riderId = await AsyncStorage.getItem('user_id');
    if (!riderId) {
      Alert.alert('Login required', 'Please sign in before requesting a ride.');
      return;
    }

    setJoining(true);
    try {
      const result = await joinRide(selected.id, {
        rider_id: riderId,
        pickup_lat: pickupCoord.latitude,
        pickup_lng: pickupCoord.longitude,
        pickup_address: pickupText,
      });

      const optimized = result.optimized_route || selected.optimized_route;
      const rideInfo = {
        driver_name: selected.users?.name || 'Driver',
        driver_phone: selected.users?.phone,
        driver_reliability: selected.users?.reliability_score,
        vehicle_make: selected.driver_profiles?.vehicle_make,
        vehicle_model: selected.driver_profiles?.vehicle_model,
        vehicle_color: selected.driver_profiles?.vehicle_color,
        vehicle_number: selected.driver_profiles?.vehicle_number,
        pickup_lat: pickupCoord.latitude,
        pickup_lng: pickupCoord.longitude,
        pickup_address: pickupText,
        dropoff_lat: selected.dropoff_lat,
        dropoff_lng: selected.dropoff_lng,
        dropoff_address: selected.dropoff_address || dropText,
        women_only: selected.women_only,
        fare_share: String(selected.estimated_fare_per_rider || 120),
        overview_polyline: optimized?.overview_polyline || selected.optimized_route?.overview_polyline || '',
      };

      setSelected(null);
      navigation.navigate('RiderActiveRide', {
        rideId: selected.id,
        rideInfo: JSON.stringify(rideInfo),
      });
    } catch (error: any) {
      if (error?.status === 403) {
        Alert.alert('Women-only ride', 'Only verified women riders can join this ride.');
      } else {
        Alert.alert('Could not request ride', error?.message || 'Please try again.');
      }
    } finally {
      setJoining(false);
    }
  };

  const selectedCoords = routeCoordinates(selected, pickupCoord);
  const mapRegion = selected
    ? {
        latitude: pickupCoord.latitude,
        longitude: pickupCoord.longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      }
    : undefined;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.surface} />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Find a ride</Text>
          <Text style={styles.headerSub}>NIT Trichy community</Text>
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{filter === 'women' ? 'Women only' : 'All rides'}</Text>
        </View>
      </View>

      <View style={styles.searchPanel}>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Pickup</Text>
          <View style={styles.locationInput}>
            <View style={styles.inputDotGreen} />
            <TextInput
              style={styles.input}
              value={pickupText}
              onChangeText={setPickupText}
              placeholder="Pickup location"
              placeholderTextColor={C.textMuted}
              returnKeyType="next"
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Drop</Text>
          <View style={[styles.locationInput, styles.locationInputFocus]}>
            <View style={styles.inputDotRed} />
            <TextInput
              style={styles.input}
              value={dropText}
              onChangeText={setDropText}
              placeholder="Where are you going?"
              placeholderTextColor={C.textMuted}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
            />
            <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
              <Text style={styles.searchButtonText}>Search</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
          <FilterPill label="All rides" active={filter === 'all'} onPress={() => setFilter('all')} />
          <FilterPill label="Women only" active={filter === 'women'} onPress={() => setFilter('women')} />
          <FilterPill label="Morning" active={filter === 'morning'} onPress={() => setFilter('morning')} />
          <FilterPill label="Evening" active={filter === 'evening'} onPress={() => setFilter('evening')} />
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.brand} size="large" />
          <Text style={styles.centerText}>Finding RouteMorph matches...</Text>
        </View>
      ) : rides.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No matching rides yet</Text>
          <Text style={styles.emptySub}>
            {hasSearched
              ? 'Try a broader drop location or switch filters.'
              : 'Enter your drop location to see rides going your way.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={rides}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.brand} />}
          renderItem={({ item }) => <RideCard ride={item} onPress={() => setSelected(item)} />}
        />
      )}

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setSelected(null)}>
          <TouchableOpacity style={styles.sheet} activeOpacity={1}>
            <View style={styles.sheetHandle} />
            {selected && (
              <>
                <View style={styles.sheetTitleRow}>
                  <View>
                    <Text style={styles.sheetTitle}>{selected.users?.name || 'Driver'}'s ride</Text>
                    <Text style={styles.sheetSub}>{formatTime(selected.departure_time)}</Text>
                  </View>
                  {selected.women_only && <Text style={styles.womenChip}>Women only</Text>}
                </View>

                <MapView
                  style={styles.map}
                  initialRegion={mapRegion}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                >
                  <Marker coordinate={pickupCoord} title="Your pickup" pinColor={C.green} />
                  <Marker
                    coordinate={{ latitude: selected.dropoff_lat, longitude: selected.dropoff_lng }}
                    title="Drop"
                    pinColor={C.red}
                  />
                  {selectedCoords.length > 1 && (
                    <Polyline coordinates={selectedCoords} strokeColor={C.brand} strokeWidth={4} />
                  )}
                </MapView>

                <View style={styles.detailGrid}>
                  <View style={styles.detailBox}>
                    <Text style={styles.detailLabel}>Pickup</Text>
                    <Text style={styles.detailValue} numberOfLines={2}>{pickupText}</Text>
                  </View>
                  <View style={styles.detailBox}>
                    <Text style={styles.detailLabel}>Drop</Text>
                    <Text style={styles.detailValue} numberOfLines={2}>{selected.dropoff_address || dropText}</Text>
                  </View>
                </View>

                <View style={styles.driverSheetRow}>
                  <View style={styles.avatarLarge}>
                    <Text style={styles.avatarLargeText}>{initials(selected.users?.name)}</Text>
                  </View>
                  <View style={styles.driverCopy}>
                    <Text style={styles.driverName}>{selected.users?.name || 'Verified driver'}</Text>
                    <Text style={styles.driverMeta}>
                      {selected.driver_profiles?.vehicle_make || 'Vehicle'}
                      {selected.driver_profiles?.vehicle_color ? ` · ${selected.driver_profiles.vehicle_color}` : ''}
                      {selected.driver_profiles?.vehicle_number ? ` · ${selected.driver_profiles.vehicle_number}` : ''}
                    </Text>
                  </View>
                  <View style={styles.fareBlock}>
                    <Text style={styles.fare}>{getFare(selected)}</Text>
                    <Text style={styles.fareSub}>your fare</Text>
                  </View>
                </View>

                <View style={styles.routeMorphBox}>
                  <Text style={styles.routeMorphTitle}>RouteMorph analysis</Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${getMatch(selected)}%` }]} />
                  </View>
                  <Text style={styles.routeMorphCopy}>
                    {getMatch(selected)}% route overlap. Pickup order will be re-optimised when you request this ride.
                  </Text>
                </View>

                <View style={styles.backupBox}>
                  <Text style={styles.backupBoxTitle}>Guaranteed Backup Match</Text>
                  <Text style={styles.backupBoxCopy}>
                    If this driver cancels near departure, UniGo searches the same TrustCircle for the next best ride.
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.joinButton, joining && styles.disabledButton]}
                  onPress={handleJoin}
                  disabled={joining}
                >
                  {joining ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.joinButtonText}>Request to join · {getFare(selected)}</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: C.text },
  headerSub: { marginTop: 2, fontSize: 12, color: C.textMuted },
  headerBadge: { backgroundColor: C.green, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  headerBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  searchPanel: { backgroundColor: C.surface, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8 },
  inputGroup: { marginBottom: 8 },
  inputLabel: { fontSize: 11, color: C.textMuted, marginBottom: 4, fontWeight: '700' },
  locationInput: {
    minHeight: 46,
    backgroundColor: '#F4F4F8',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  locationInputFocus: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.brand },
  input: { flex: 1, fontSize: 14, color: C.text, paddingVertical: 8 },
  inputDotGreen: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.green },
  inputDotRed: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.red },
  searchButton: { backgroundColor: C.brand, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8 },
  searchButtonText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  pillRow: { gap: 6, paddingTop: 2 },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: C.surface,
  },
  pillActive: { backgroundColor: C.brandLight, borderColor: C.brand },
  pillText: { fontSize: 12, color: C.textMuted, fontWeight: '700' },
  pillTextActive: { color: C.brandMid },
  list: { paddingTop: 10, paddingBottom: 28 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  centerText: { marginTop: 10, fontSize: 13, color: C.textMuted },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: C.text, marginBottom: 6 },
  emptySub: { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 19 },
  rideCard: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginHorizontal: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  driverBlock: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#AFA9EC', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.brandDark, fontWeight: '800', fontSize: 12 },
  driverCopy: { flex: 1 },
  driverName: { fontSize: 14, fontWeight: '800', color: C.text },
  driverMeta: { marginTop: 2, color: C.textMuted, fontSize: 11 },
  fareBlock: { alignItems: 'flex-end' },
  fare: { fontSize: 16, fontWeight: '900', color: C.text },
  fareSub: { fontSize: 10, color: C.textMuted },
  routeBlock: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  routeDots: { alignItems: 'center', paddingTop: 3 },
  dotGreen: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green },
  dotLine: { width: 1, height: 18, backgroundColor: '#D1D5DB', marginVertical: 3 },
  dotRed: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D85A30' },
  routeCopy: { flex: 1, gap: 7 },
  address: { color: C.textSub, fontSize: 12 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 9 },
  metaChip: { color: C.textSub, fontSize: 11, fontWeight: '600' },
  womenChip: { color: C.pink, backgroundColor: C.pinkLight, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, fontSize: 11, fontWeight: '800' },
  featureRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  matchPill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  matchText: { fontSize: 11, fontWeight: '900' },
  backupPill: { borderRadius: 999, backgroundColor: C.greenLight, paddingHorizontal: 9, paddingVertical: 5 },
  backupText: { fontSize: 11, fontWeight: '800', color: C.greenDark },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 30, maxHeight: '92%' },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 14 },
  sheetTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 10 },
  sheetTitle: { fontSize: 18, color: C.text, fontWeight: '900' },
  sheetSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  map: { height: 150, borderRadius: 14, marginBottom: 12 },
  detailGrid: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  detailBox: { flex: 1, backgroundColor: '#F4F4F8', borderRadius: 10, padding: 10 },
  detailLabel: { fontSize: 10, color: C.textMuted, fontWeight: '800', marginBottom: 4 },
  detailValue: { color: C.text, fontSize: 12, fontWeight: '700', lineHeight: 16 },
  driverSheetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatarLarge: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#AFA9EC' },
  avatarLargeText: { color: C.brandDark, fontWeight: '900' },
  routeMorphBox: { backgroundColor: C.brandLight, borderRadius: 12, padding: 12, marginBottom: 9, borderWidth: 1, borderColor: '#E8E4FF' },
  routeMorphTitle: { color: C.brandMid, fontWeight: '900', fontSize: 13, marginBottom: 8 },
  progressTrack: { height: 6, backgroundColor: '#E8E4FF', borderRadius: 999, overflow: 'hidden', marginBottom: 7 },
  progressFill: { height: '100%', backgroundColor: C.brand, borderRadius: 999 },
  routeMorphCopy: { color: C.brandDark, fontSize: 12, lineHeight: 17 },
  backupBox: { backgroundColor: C.amberLight, borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#FAC775' },
  backupBoxTitle: { color: '#633806', fontWeight: '900', marginBottom: 4, fontSize: 13 },
  backupBoxCopy: { color: '#633806', fontSize: 12, lineHeight: 17 },
  joinButton: { backgroundColor: C.brand, borderRadius: 14, alignItems: 'center', paddingVertical: 15 },
  disabledButton: { opacity: 0.65 },
  joinButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
