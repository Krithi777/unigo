// mobile/src/services/api.ts
//
// Axios instance pointed at the FastAPI backend.
// Automatically injects the stored Firebase token as Bearer header.

import axios from 'axios';
import { Storage } from '../utils/storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://192.168.31.252:8000';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// Inject token on every request
api.interceptors.request.use(async (config) => {
  const token = await Storage.getToken();
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// Unwrap .data so callers get the payload directly
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message =
      error?.response?.data?.detail ??
      error?.message ??
      'Something went wrong';
    return Promise.reject(new Error(message));
  },
);