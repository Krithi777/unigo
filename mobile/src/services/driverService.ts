import { api } from './api';
import { Storage } from '../utils/storage';

export interface VehicleInfo {
  vehicle_number: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_color: string;
  vehicle_type: 'car' | 'bike' | 'auto';
  seats_available_default: number;
}

export interface DriverSetupPayload {
  full_name?: string;
  profile_photo_uri?: string;
  vehicle?: Partial<VehicleInfo>;
}

/** Save partial driver setup progress (upserts driver_profiles row) */
export async function saveDriverSetup(payload: DriverSetupPayload): Promise<any> {
  const data = await api.post<{ driver_profile: any }>('/driver/setup', payload);
  return data.driver_profile;
}

/** Check vehicle_number for format + uniqueness */
export async function checkVehicleNumber(
  vehicle_number: string,
): Promise<{ valid: boolean; taken: boolean; message?: string }> {
  return api.post('/driver/check-vehicle', { vehicle_number });
}

/** Upload a document (license, rc, insurance, puc).
 *  Accepts an object param to match DriverSetupScreen's call signature. */
export async function uploadDriverDocument(params: {
  doc_type: 'license' | 'rc' | 'insurance' | 'puc';
  uri: string;
  base64?: string;
  mimeType: string;
  fileName: string;
}): Promise<{ driver_profile: any }> {
  const { doc_type, uri, mimeType, fileName } = params;

  const formData = new FormData();
  formData.append('file', { uri, name: fileName, type: mimeType } as any);
  formData.append('doc_type', doc_type);

  const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://192.168.31.252:8000';

  const res = await fetch(`${BASE_URL}/driver/upload-document`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await Storage.getToken()}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? 'Upload failed');
  }
  return res.json();
}

/** Submit for review — moves driver to pending_review state */
export async function submitDriverForReview(): Promise<{ driver_profile: any }> {
  return api.post('/driver/submit-review', {});
}

/** Get own driver profile + document status */
export async function getDriverProfile(): Promise<any> {
  return api.get('/driver/profile');
}

/** Re-upload a rejected document */
export async function reuploadDocument(
  doc_type: 'license' | 'rc' | 'insurance' | 'puc',
  uri: string,
  fileName: string,
  mimeType: string,
): Promise<{ driver_profile: any }> {
  return uploadDriverDocument({ doc_type, uri, mimeType, fileName });
}