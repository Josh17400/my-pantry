/**
 * jeep-sqlite browser investigation notes (NOT wired into production or default DEV).
 *
 * ## Finding (2026-07-26)
 *
 * jeep-sqlite@2.8.0 is a Stencil component used by @capacitor-community/sqlite's
 * web implementation. Dependencies (from package.json):
 *   - sql.js ^1.11.0
 *   - localforage ^1.10.0  (IndexedDB store `jeepSqliteStore`)
 *
 * Official README: "based on sql.js for SQLite queries and localforage for
 * database storage in IndexedDB." No mention of SharedArrayBuffer, COOP, or
 * COEP.
 *
 * Evidence gathered in this repo:
 * 1. `node_modules/sql.js/dist/sql-wasm.js` contains ZERO "SharedArrayBuffer"
 *    references (unlike @sqlite.org/sqlite-wasm OPFS builds).
 * 2. Vite dev server intentionally does not set COOP/COEP.
 * 3. Playwright smoke at http://localhost:5173/db-health:
 *      crossOriginIsolated: false
 *      typeof SharedArrayBuffer: "undefined"  (hasSAB: false)
 *    Yet jeep custom-element registration + initWebStore still completed
 *    enough to show a Run UI when experimentally wired.
 * 4. First real query failed with:
 *      LinkError: WebAssembly.instantiate(): Import #34 "a" "I":
 *      function import requires a callable
 *    — a sql.js wasm/glue mismatch under Vite, not a COOP/COEP problem.
 *
 * ## Decision
 *
 * Do NOT use jeep-sqlite as the browser data path:
 * - Product web is Supabase-direct (online companion) — that stands.
 * - DEV browser SQLite would be valuable, but the Vite + sql.js wasm path
 *   does not work cleanly today. Leave web on the honest "Not applicable"
 *   panel rather than a broken Run button.
 *
 * Revisit later with a known-good sql.js pin + non-Vite host, or a different
 * browser SQLite stack — without ever enabling origin-wide COOP/COEP.
 */

export const JEEP_SQLITE_FINDING = {
  needsCoopCoep: false,
  worksCleanlyUnderVite: false,
  storage: 'sql.js + localforage IndexedDB',
  blocker: 'sql.js wasm LinkError under Vite (not COOP/COEP)',
} as const;
