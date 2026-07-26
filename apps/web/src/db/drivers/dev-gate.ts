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
  // Explicit opt-in for the GitHub Pages demo build, so the app can be walked
  // in a browser (and driven by automation) without a TestFlight round trip.
  // Set only by the pages workflow — a real production web deploy leaves it
  // unset and keeps online-companion behaviour.
  if (import.meta.env.VITE_PREVIEW_DEMO === '1') {
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
