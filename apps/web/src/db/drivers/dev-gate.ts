/**
 * Selection gate for the browser IndexedDB dev driver.
 * Kept in a tiny module so create-repository can decide without loading
 * the full driver (or Capacitor SQLite).
 */

/**
 * True when the browser should use the local IndexedDB driver.
 *
 * Primary gate: `import.meta.env.DEV` (Vite dev server).
 * Secondary: localhost / 127.0.0.1 so `vite preview` + screenshot-routes
 * (production build served locally) still get reviewable data. Real users on
 * a non-local host never activate this path.
 */
export function shouldUseBrowserDevDriver(): boolean {
  if (import.meta.env.DEV) {
    return true;
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return true;
    }
  }
  return false;
}
