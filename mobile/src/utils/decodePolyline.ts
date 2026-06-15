/**
 * decodePolyline.ts — UniGo
 * Place at: src/utils/decodePolyline.ts
 *
 * Decodes a Google Maps encoded polyline string into an array of
 * { latitude, longitude } coordinate objects for react-native-maps Polyline.
 *
 * Bug fix vs original: the bit-shift used `lng >> 1` on the accumulator
 * before the sign-flip; it must use `result >> 1`.
 */

export function decodePolyline(
  encoded: string,
): { latitude: number; longitude: number }[] {
  if (!encoded) return [];

  const poly: { latitude: number; longitude: number }[] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    // --- decode latitude ---
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    // --- decode longitude ---
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    poly.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return poly;
}