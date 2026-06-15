/**
 * MapPicker.tsx — Phase 1 Component.
 *
 * Renders a MapView where the user taps to drop a pin.
 * Calls onLocationSelected(lat, lng, address?) when they confirm.
 *
 * Props:
 *   initialRegion?     — starting map region (defaults to Chennai)
 *   onLocationSelected — callback with (lat, lng, address?)
 *   style?             — optional container style override
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import MapView, {
  Marker,
  MapPressEvent,
  Region,
} from 'react-native-maps';

interface Props {
  initialRegion?: Region;
  onLocationSelected: (lat: number, lng: number, address?: string) => void;
  style?: object;
}

const DEFAULT_REGION: Region = {
  // Chennai, India — sensible default for UniGo
  latitude: 13.0827,
  longitude: 80.2707,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function MapPicker({
  initialRegion = DEFAULT_REGION,
  onLocationSelected,
  style,
}: Props) {
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [resolving, setResolving] = useState(false);

  const handlePress = (event: MapPressEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setPin({ lat: latitude, lng: longitude });
  };

  const handleConfirm = async () => {
    if (!pin) return;
    setResolving(true);

    // Best-effort reverse geocode using Google Geocoding API
    let address: string | undefined;
    try {
      const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
      if (apiKey) {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${pin.lat},${pin.lng}&key=${apiKey}`
        );
        const json = await res.json();
        if (json.status === 'OK' && json.results?.[0]) {
          address = json.results[0].formatted_address;
        }
      }
    } catch {
      // Geocode is best-effort — proceed without address
    } finally {
      setResolving(false);
    }

    onLocationSelected(pin.lat, pin.lng, address);
  };

  return (
    <View style={[styles.container, style]}>
      <MapView
        style={styles.map}
        initialRegion={initialRegion}
        onPress={handlePress}
        showsUserLocation
        showsMyLocationButton
      >
        {pin && (
          <Marker
            coordinate={{ latitude: pin.lat, longitude: pin.lng }}
            pinColor="#6C47FF"
          />
        )}
      </MapView>

      <View style={styles.footer}>
        {pin ? (
          <>
            <Text style={styles.hint}>
              📍 {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
            </Text>
            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={handleConfirm}
              disabled={resolving}
            >
              {resolving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.confirmText}>Confirm Location</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.hint}>Tap on the map to drop a pin</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  map: {
    height: 220,
    width: '100%',
  },
  footer: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 8,
  },
  hint: {
    color: '#64748B',
    fontSize: 13,
  },
  confirmBtn: {
    backgroundColor: '#6C47FF',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
  },
  confirmText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
