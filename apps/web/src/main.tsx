import './index.css';

import { type ReactNode, StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './App';
import { createPantryRepository } from './db';
import { setActiveRepository } from './state';
import { Wordmark } from './ui';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Missing #root element');
}

/**
 * Boot the data layer. Native / browser-DEV initialize the local store;
 * production web companion leaves the repo unset when NotConfiguredError is
 * thrown (screens show unavailable / demo fallbacks).
 *
 * Fixtures (demo groceries) load ONLY in browser DEV — never on production
 * builds or TestFlight/native so a first run starts empty.
 *
 * Singleton: React StrictMode double-mounts effects; only one open/seed runs.
 */
let bootPromise: Promise<'ready' | 'skipped'> | null = null;

function bootRepositoryOnce(): Promise<'ready' | 'skipped'> {
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    const t0 = performance.now();
    try {
      console.info('[larder] boot: create repository');
      const repo = await createPantryRepository();
      console.info(
        '[larder] boot: driver =',
        repo.driverName,
        `${(performance.now() - t0).toFixed(0)}ms`,
      );
      if (typeof repo.initialize === 'function') {
        // Demo pantry fixtures are for local design review only.
        const loadFixtures = Boolean(import.meta.env.DEV);
        console.info(
          '[larder] boot: initialize…',
          loadFixtures ? '(with fixtures)' : '(empty first-run)',
        );
        await repo.initialize({ loadFixtures });
        console.info(
          '[larder] boot: initialize done',
          `${(performance.now() - t0).toFixed(0)}ms`,
        );
      }
      setActiveRepository(repo);
      console.info('[larder] boot: active', `${(performance.now() - t0).toFixed(0)}ms`);
      return 'ready' as const;
    } catch (err) {
      // Web production stub throws NotConfiguredError — screens handle no-repo.
      console.info(
        '[larder] data layer not active:',
        err instanceof Error ? err.message : err,
      );
      return 'skipped' as const;
    }
  })();
  return bootPromise;
}

function BootGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'skipped'>('loading');

  useEffect(() => {
    let cancelled = false;
    void bootRepositoryOnce().then((result) => {
      if (!cancelled) setPhase(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase === 'loading') {
    // Splash: wordmark only — greeting replaces it once the home shell mounts.
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center bg-bg px-6"
        data-boot-splash
      >
        <Wordmark size="lg" showTagline tagline="Everything in its place." />
      </div>
    );
  }

  return children;
}

// GitHub Pages serves under /<repo>/, so the router needs that basename or every
// route 404s. BASE_URL is '/' locally and in the native build, where this is a no-op.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <BootGate>
        <App />
      </BootGate>
    </BrowserRouter>
  </StrictMode>,
);
