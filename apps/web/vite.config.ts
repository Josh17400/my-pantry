import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Intentionally no COOP/COEP headers.
 * Web is Supabase-direct (online companion). jeep-sqlite was investigated for a
 * browser SQLite dev path — see reports/m1-replatform.md — and is not wired
 * because product web remains online-only. Do not re-introduce origin-wide
 * isolation headers (they break OAuth popups / ads / payments).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@larder/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  // jeep-sqlite / sql.js (DEV-only path): do not prebundle; serve wasm as static asset.
  // No COOP/COEP headers — jeep uses sql.js + IndexedDB, not SharedArrayBuffer.
  optimizeDeps: {
    exclude: ['sql.js', 'jeep-sqlite', '@capacitor-community/sqlite'],
  },
  assetsInclude: ['**/*.wasm'],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      // Standalone grocery preview for screenshot (shell wiring is another track)
      input: {
        main: path.resolve(__dirname, 'index.html'),
        groceryPreview: path.resolve(__dirname, 'grocery-preview.html'),
        pantryPreview: path.resolve(__dirname, 'pantry-preview.html'),
      },
    },
  },
});
