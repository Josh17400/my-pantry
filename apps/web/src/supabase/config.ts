/**
 * Supabase client config — env-driven, no secrets in repo.
 *
 * Env contract (Vite):
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *
 * (Renamed from Expo's EXPO_PUBLIC_* — values carried from apps/mobile/.env.)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type SupabaseEnv = {
  url: string;
  anonKey: string;
  configured: boolean;
};

export function getSupabaseEnv(): SupabaseEnv {
  const url = import.meta.env.VITE_SUPABASE_URL ?? '';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
  return {
    url,
    anonKey,
    configured: url.length > 0 && anonKey.length > 0,
  };
}

let client: SupabaseClient | null = null;

/**
 * Returns a Supabase JS client when env is set; otherwise null.
 * Call sites must handle the unconfigured case (offline-first local path on native).
 */
export function getSupabaseClient(): SupabaseClient | null {
  const env = getSupabaseEnv();
  if (!env.configured) {
    return null;
  }
  if (!client) {
    client = createClient(env.url, env.anonKey);
  }
  return client;
}
