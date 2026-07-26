import { useCallback, useState } from 'react';

import {
  createPantryRepository,
  runHealthCheck,
  type HealthRunResult,
  type HealthStepResult,
} from '../db';
import { getCoreWiringProof } from '../lib/core-proof';
import { isNativePlatform, platformName } from '../lib/platform';

const STEP_LABELS: Record<HealthStepResult['step'], string> = {
  open: '1. Open / create database',
  migrate: '2. Run migration (create table)',
  insert: '3. Insert 1,000 rows (transaction)',
  read_verify: '4. Read back + verify count/checksum',
  aggregate: '5. Indexed aggregate query',
  persist: '6. Close, reopen, verify persistence',
  cleanup: '7. Drop test table (no residue)',
};

/**
 * DB Health — ported from apps/mobile.
 * Native runs the 7-step SQLite self-test.
 * Web is an honest "not applicable" panel — never fake a pass.
 */
export function DbHealthPage() {
  if (!isNativePlatform()) {
    return <WebNotApplicablePanel />;
  }
  return <NativeHealthPanel />;
}

function CoreProofBanner() {
  const proof = getCoreWiringProof();
  return (
    <div className="mb-4 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm text-zinc-700">
      <span className="font-semibold text-zinc-500">@larder/core · </span>
      {proof.packageOk ? 'ok' : 'fail'} · {proof.conversionLine}
    </div>
  );
}

/** Honest web panel — no local DB, do not fake a pass. */
function WebNotApplicablePanel() {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-zinc-900">DB Health</h1>
      <CoreProofBanner />
      <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-left">
        <h2 className="mb-2 text-lg font-bold text-blue-900">Not applicable</h2>
        <p className="text-sm leading-relaxed text-blue-800">
          Web is an online companion — no local database. Native (iOS / Android)
          runs offline-first SQLite via @capacitor-community/sqlite + Drizzle
          (sqlite-proxy). Web product path is Supabase-direct once product
          features need remote queries.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-blue-800">
          jeep-sqlite finding (DEV probe): uses sql.js + IndexedDB, not OPFS —
          it does <em>not</em> require COOP/COEP headers (confirmed with{' '}
          <code className="rounded bg-blue-100 px-1 text-xs">
            crossOriginIsolated: false
          </code>
          ). However sql.js wasm fails under Vite with a LinkError, so a browser
          SQLite dev path is not wired. See{' '}
          <code className="rounded bg-blue-100 px-1 text-xs">
            reports/m1-replatform.md
          </code>
          .
        </p>
      </div>
      <p className="text-sm text-zinc-500">
        Platform: {platformName()} · Driver: supabase-direct (not configured for
        health probes)
      </p>
    </div>
  );
}

function NativeHealthPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<HealthRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onRun = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const repo = createPantryRepository();
      const run = await runHealthCheck(repo);
      setResult(run);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, []);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-zinc-900">DB Health</h1>
      <CoreProofBanner />
      <p className="mb-5 text-sm leading-relaxed text-zinc-600">
        Self-test for Capacitor SQLite + Drizzle on native. Must pass all 7
        steps, including persistence across close/reopen.
      </p>

      <button
        type="button"
        onClick={() => void onRun()}
        disabled={running}
        className="mb-5 rounded-lg bg-blue-600 px-5 py-3 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {running ? 'Running…' : 'Run self-test'}
      </button>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="space-y-2.5">
          <div
            className={`rounded-lg p-3 text-center text-sm font-bold text-white ${
              result.allPassed ? 'bg-green-900' : 'bg-red-900'
            }`}
          >
            {result.allPassed ? 'ALL PASSED' : 'FAILED'} · {result.platform} ·{' '}
            {result.driver}
          </div>
          {result.steps.map((step) => (
            <StepRow key={step.step} step={step} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StepRow({ step }: { step: HealthStepResult }) {
  return (
    <div
      className={`rounded-lg border p-3 text-left ${
        step.ok
          ? 'border-green-300 bg-green-50'
          : 'border-red-300 bg-red-50'
      }`}
    >
      <div className="mb-1 flex justify-between">
        <span className="text-xs font-extrabold tracking-wide">
          {step.ok ? 'PASS' : 'FAIL'}
        </span>
        <span className="font-mono text-xs text-zinc-500">
          {step.ms.toFixed(1)} ms
        </span>
      </div>
      <div className="mb-1 text-sm font-semibold text-zinc-800">
        {STEP_LABELS[step.step]}
      </div>
      <div className="font-mono text-xs text-zinc-600">{step.detail}</div>
    </div>
  );
}
