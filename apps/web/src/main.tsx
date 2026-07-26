import './index.css';

import { type ReactNode,StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './App';
import { createPantryRepository } from './db';
import { setActiveRepository } from './state';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Missing #root element');
}

/**
 * Boot the data layer. Native / browser-DEV initialize the local store;
 * production web companion leaves the repo unset when NotConfiguredError is
 * thrown (screens show unavailable / demo fallbacks).
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
        console.info('[larder] boot: initialize…');
        await repo.initialize({ loadFixtures: true });
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
  const [detail] = useState('Opening local pantry…');

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
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-6">
        <p className="font-display text-lg text-ink">{detail}</p>
      </div>
    );
  }

  return children;
}

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <BootGate>
        <App />
      </BootGate>
    </BrowserRouter>
  </StrictMode>,
);
