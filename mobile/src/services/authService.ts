/**
 * authService.ts
 *
 * All auth is handled server-side. No Firebase client SDK.
 *
 * Flows:
 *  RIDER:  sendRiderEmailVerification → checkRiderEmailVerified (poll)
 *          → completeRiderProfile
 *  DRIVER: sendPhoneOTP → verifyPhoneOTP → sendDriverEmailVerification
 *          → pollDriverEmailVerified → DriverSetup
 *  ADMIN:  adminLogin (email + password from DB)
 */

import { api } from './api';
import { Storage } from '../utils/storage';

// ─── Rider email verification ─────────────────────────────────────────────────

export async function sendRiderEmailVerification(email: string): Promise<void> {
  await api.post('/auth/rider/send-email-verification', { email });
}

export interface RiderEmailVerifyResult {
  verified: boolean;
  is_new_user: boolean;
  idToken: string;
  firebase_uid: string;
  user: any | null;
  communities: any[];
  driver_profile: any | null;
}

export async function checkRiderEmailVerified(email: string): Promise<RiderEmailVerifyResult> {
  const res = await api.post<any>('/auth/rider/check-email-verified', { email });

  // Backend returns custom_token, map it to idToken
  const idToken: string = res.custom_token ?? res.idToken ?? '';
  const firebase_uid: string = res.firebase_uid ?? '';

  const result: RiderEmailVerifyResult = {
    verified: res.verified,
    is_new_user: res.is_new_user,
    idToken,
    firebase_uid,
    user: res.user ?? null,
    communities: res.communities ?? [],
    driver_profile: res.driver_profile ?? null,
  };

  if (result.verified && !result.is_new_user && result.user) {
    await Storage.saveSession(idToken, result.user, result.communities, result.driver_profile);
  }

  return result;
}

export async function resendRiderEmailVerification(email: string): Promise<void> {
  await api.post('/auth/rider/send-email-verification', { email });
}

// ─── Rider profile setup ──────────────────────────────────────────────────────

export async function completeRiderProfile(params: {
  idToken: string;
  firebase_uid: string;
  name: string;
  email: string;
  gender: string;
  fcm_token?: string;
}): Promise<{ user: any; communities: any[] }> {
  // idToken here is actually the custom_token from check-email-verified.
  // /auth/rider/complete-profile accepts the custom_token directly in the body
  // (no Firebase SDK exchange needed — backend handles it server-side).
  await Storage.saveSession(params.idToken, {}, [], null);

  const data = await api.post<{ user: any; communities: any[]; is_new_user: boolean }>(
    '/auth/rider/complete-profile',
    {
      firebase_uid: params.firebase_uid,
      custom_token: params.idToken,
      name: params.name,
      email: params.email,
      gender: params.gender,
      fcm_token: params.fcm_token,
    },
  );

  await Storage.saveSession(params.idToken, data.user, data.communities, null);
  return data;
}

// ─── Phone OTP (Driver only) ──────────────────────────────────────────────────

export async function sendPhoneOTP(phone: string): Promise<void> {
  await api.post('/auth/send-phone-otp', { phone });
}

export interface PhoneOTPResult {
  idToken: string;
  firebase_uid: string;
  is_new_user: boolean;
  user: any | null;
  communities: any[];
  driver_profile: any | null;
  is_admin: boolean;
}

export async function verifyPhoneOTP(params: {
  phone: string;
  otp: string;
  entry_role: 'driver' | 'admin';
}): Promise<PhoneOTPResult> {
  const res = await api.post<any>('/auth/verify-phone-otp', params);

  // Backend returns custom_token
  const idToken: string = res.custom_token ?? res.id_token ?? res.idToken ?? '';
  const firebase_uid: string = res.firebase_uid ?? '';

  if (!res.is_new_user && res.user) {
    await Storage.saveSession(idToken, res.user, res.communities ?? [], res.driver_profile ?? null);
  }

  return {
    idToken,
    firebase_uid,
    is_new_user: res.is_new_user,
    user: res.user,
    communities: res.communities ?? [],
    driver_profile: res.driver_profile,
    is_admin: res.is_admin ?? false,
  };
}

// ─── Driver email verification ────────────────────────────────────────────────

export async function sendDriverEmailVerification(params: {
  email: string;
}): Promise<void> {
  await api.post('/auth/driver/send-email-verification', { email: params.email });
}

export interface DriverEmailVerifyResult {
  verified: boolean;
  is_new_user: boolean;
  idToken: string;
  firebase_uid: string;
  user: any | null;
  communities: any[];
  driver_profile: any | null;
}

export async function checkDriverEmailVerified(email: string): Promise<DriverEmailVerifyResult> {
  const res = await api.post<any>('/auth/driver/check-email-verified', { email });

  // Backend returns custom_token, map it to idToken
  const idToken: string = res.custom_token ?? res.idToken ?? '';
  const firebase_uid: string = res.firebase_uid ?? '';

  const result: DriverEmailVerifyResult = {
    verified: res.verified,
    is_new_user: res.is_new_user,
    idToken,
    firebase_uid,
    user: res.user ?? null,
    communities: res.communities ?? [],
    driver_profile: res.driver_profile ?? null,
  };

  if (result.verified && !result.is_new_user && result.user) {
    await Storage.saveSession(idToken, result.user, result.communities, result.driver_profile);
  }

  return result;
}

export async function resendDriverEmailVerification(email: string): Promise<void> {
  await api.post('/auth/driver/send-email-verification', { email });
}

// ─── Driver account creation ──────────────────────────────────────────────────

export async function createDriverAccount(params: {
  idToken: string;
  firebase_uid: string;
  name: string;
  phone: string;
  gender: string;
  email: string;
  fcm_token?: string;
}): Promise<{ user: any; communities: any[]; driver_profile: any }> {
  await Storage.saveSession(params.idToken, {}, [], null);

  const data = await api.post<{ user: any; communities: any[]; driver_profile: any }>(
    '/auth/verify',
    {
      firebase_uid: params.firebase_uid,
      name: params.name,
      phone: params.phone,
      gender: params.gender,
      email: params.email,
      role: 'driver',
      fcm_token: params.fcm_token,
    },
  );

  await Storage.saveSession(params.idToken, data.user, data.communities, data.driver_profile);
  return data;
}

// ─── Admin email + password login ─────────────────────────────────────────────

export interface AdminLoginResult {
  idToken: string;
  firebase_uid?: string;
  is_new_user: boolean;
  user: any;
  communities: any[];
  driver_profile: any | null;
  is_admin: boolean;
}

export async function adminLogin(email: string, password: string): Promise<AdminLoginResult> {
  const res = await api.post<any>('/auth/admin/login', { email, password });

  // Backend returns custom_token
  const idToken: string = res.custom_token ?? res.idToken ?? '';

  if (res.user) {
    await Storage.saveSession(idToken, res.user, res.communities ?? [], res.driver_profile ?? null);
  }

  return {
    idToken,
    firebase_uid: res.user?.firebase_uid,
    is_new_user: res.is_new_user ?? false,
    user: res.user,
    communities: res.communities ?? [],
    driver_profile: res.driver_profile ?? null,
    is_admin: res.is_admin ?? false,
  };
}

// ─── Session restore ──────────────────────────────────────────────────────────

export async function restoreSession(): Promise<{
  user: any;
  communities: any[];
  driverProfile: any | null;
} | null> {
  const token = await Storage.getToken();
  if (!token) return null;
  try {
    const data = await api.get<{ user: any; communities: any[]; driver_profile: any | null }>(
      '/auth/me',
    );
    await Storage.saveSession(token, data.user, data.communities, data.driver_profile ?? null);
    return { user: data.user, communities: data.communities, driverProfile: data.driver_profile };
  } catch {
    await Storage.clearSession();
    return null;
  }
}

// ─── Sign out ─────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  await Storage.clearSession();
}