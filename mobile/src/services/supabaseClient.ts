/**
 * supabaseClient.ts — UniGo
 *
 * FIX: Removed `import 'react-native-url-polyfill/auto'`
 * That package is not in package.json, so Metro can't resolve it → fatal bundler error.
 *
 * With Expo SDK 50+ / React Native 0.73+, the JS engine (Hermes) ships its own
 * URL implementation, so the polyfill is NOT needed. Remove it entirely.
 *
 * supabase-js v2 also no longer requires the polyfill when running on Hermes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = process.env.EXPO_PUBLIC_SUPABASE_URL     ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage:           AsyncStorage,
    autoRefreshToken:  true,
    persistSession:    true,
    detectSessionInUrl: false,
  },
});

/**
 * Use for read-only queries only (browsing rides, profiles, etc.).
 * All writes (create ride, join ride, payments, SOS) must go through the
 * FastAPI backend (src/services/api.ts) where Firebase auth is verified server-side.
 */