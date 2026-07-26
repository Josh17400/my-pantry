import { isNativePlatform } from '../lib/platform';
import { NativePantryRepository } from './drivers/native';
import { WebPantryRepository } from './drivers/web';
import type { PantryRepository } from './repository';

/**
 * Runtime platform switch (Capacitor WebView vs browser).
 * Replaces Metro's .native.ts / .web.ts resolution from the Expo app.
 *
 * - Native (iOS/Android WebView): Capacitor SQLite + Drizzle proxy
 * - Browser: Supabase-direct stub (online companion)
 *
 * jeep-sqlite was investigated as a DEV-only browser SQLite path. It does NOT
 * need COOP/COEP (sql.js + IndexedDB), but sql.js wasm fails to instantiate
 * under Vite (LinkError). Not wired — see reports/m1-replatform.md and
 * src/db/jeep-dev.ts.
 */
export function createPantryRepository(): PantryRepository {
  if (isNativePlatform()) {
    return new NativePantryRepository();
  }
  return new WebPantryRepository();
}
