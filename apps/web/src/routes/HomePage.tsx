import { Link } from 'react-router-dom';

import { getCoreWiringProof } from '../lib/core-proof';
import { platformName } from '../lib/platform';
import { getSupabaseEnv } from '../supabase/config';

/**
 * Home — shell only. No product features.
 */
export function HomePage() {
  const core = getCoreWiringProof();
  const supabase = getSupabaseEnv();
  const platform = platformName();

  return (
    <div className="flex flex-col items-center text-center">
      <h1 className="mb-2 text-3xl font-bold tracking-tight text-zinc-900">
        My Pantry
      </h1>
      <p className="mb-8 max-w-md text-base text-zinc-600">
        Shell scaffold (React + Vite + Capacitor). No product features yet —
        pantry, recipes, and grocery land in track F.
      </p>

      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Workspace health
        </h2>
        <dl className="space-y-2 text-sm text-zinc-800">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Platform</dt>
            <dd className="font-medium">{platform}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">@larder/core</dt>
            <dd className="font-medium">
              {core.packageOk ? 'ok' : 'fail'} ({core.packageName})
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Core convert</dt>
            <dd className="font-mono text-xs font-medium">
              {core.conversionOk ? core.conversionLine : core.conversionLine}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Supabase env</dt>
            <dd className="font-medium">
              {supabase.configured ? 'configured' : 'not set'}
            </dd>
          </div>
        </dl>
      </div>

      <p className="mt-8 max-w-md text-sm text-zinc-500">
        Native: open{' '}
        <Link to="/db-health" className="font-medium text-blue-600 hover:underline">
          DB Health
        </Link>{' '}
        and run the SQLite self-test. Web: DB Health shows not applicable
        (online companion, no local database).
      </p>
    </div>
  );
}
