import { isNativePlatform } from '../lib/platform';
import { shouldUseBrowserDevDriver } from './drivers/dev-gate';
import type { PantryRepository } from './repository';

/**
 * Runtime platform switch (Capacitor WebView vs browser).
 *
 * Drivers are loaded via dynamic `import()` so the browser never evaluates
 * `@capacitor-community/sqlite` (native-only) and production web hosts never
 * need to parse the IndexedDB dev driver until selected.
 *
 * - Native (iOS/Android WebView): Capacitor SQLite + Drizzle proxy
 * - Browser + DEV / localhost: IndexedDB plain-TS driver (product review)
 * - Browser production host: Supabase-direct stub (online companion)
 *
 * jeep-sqlite was investigated as a browser SQLite path. It does NOT need
 * COOP/COEP, but sql.js wasm fails under Vite (LinkError). See
 * reports/m1-replatform.md. Track L uses IndexedDB instead.
 */
export async function createPantryRepository(): Promise<PantryRepository> {
  if (isNativePlatform()) {
    const { NativePantryRepository } = await import('./drivers/native');
    return new NativePantryRepository();
  }
  if (shouldUseBrowserDevDriver()) {
    const { DevPantryRepository } = await import('./drivers/dev');
    return new DevPantryRepository();
  }
  const { WebPantryRepository } = await import('./drivers/web');
  return new WebPantryRepository();
}
