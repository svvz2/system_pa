import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const fetchWithTimeout: typeof fetch = async (input, init = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  const parentSignal = init.signal;
  const abortFromParent = () => controller.abort();
  parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !parentSignal?.aborted) {
      throw new Error('انتهت مهلة الاتصال بالخادم. تحقق من الشبكة ثم حاول مجدداً.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
};

if (!url || !publishableKey) {
  console.warn('Supabase environment variables are missing. Copy mobile/.env.example to mobile/.env.');
}

const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

// SecureStore is native-only. The browser build uses localStorage so the same
// authentication flow can be exercised from the development web preview.
const webStorage = {
  getItem: async (key: string) =>
    typeof window === 'undefined' ? null : window.localStorage.getItem(key),
  setItem: async (key: string, value: string) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key);
  },
};

export const supabase = createClient(
  url ?? 'http://127.0.0.1:55321',
  publishableKey ?? 'missing-publishable-key',
  {
    global: { fetch: fetchWithTimeout },
    auth: {
      storage: Platform.OS === 'web' ? webStorage : secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

export const garageId =
  process.env.EXPO_PUBLIC_GARAGE_ID ?? '10000000-0000-4000-8000-000000000001';
