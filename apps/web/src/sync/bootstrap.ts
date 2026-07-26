/**
 * Wire auth + sync into the app boot path.
 * Safe when Supabase env is missing or the user is signed out.
 */

import type { AuthClient} from '../auth';
import { getAuthClient } from '../auth';
import type { AppDatabase } from '../db/domain-repository';
import { getSupabaseClient } from '../supabase/config';
import { SyncEngine } from './engine';
import { createDrizzleLocalPort } from './local-store';
import { createSupabaseRemotePort } from './remote';
import { startSyncScheduler } from './scheduler';
import { getSyncStatusStore } from './status';

export type SyncBootstrap = {
  auth: AuthClient;
  engine: SyncEngine | null;
  dispose: () => void;
};

let active: SyncBootstrap | null = null;

/**
 * Start auth + optional sync engine against a local Drizzle DB.
 * Pass the same AppDatabase DomainRepository uses.
 */
export function bootstrapSync(db: AppDatabase): SyncBootstrap {
  if (active) {
    active.dispose();
    active = null;
  }

  const auth = getAuthClient();
  const local = createDrizzleLocalPort(db);
  const supabase = getSupabaseClient();
  const remote = supabase ? createSupabaseRemotePort(supabase) : null;

  const engine = new SyncEngine({
    local,
    remote,
    auth,
    status: getSyncStatusStore(),
  });

  void auth.initialize();
  const stopScheduler = startSyncScheduler({ engine });

  const dispose = () => {
    stopScheduler();
    engine.dispose();
    if (active?.engine === engine) active = null;
  };

  active = { auth, engine, dispose };
  return active;
}

export function getActiveSyncBootstrap(): SyncBootstrap | null {
  return active;
}

export function getActiveSyncEngine(): SyncEngine | null {
  return active?.engine ?? null;
}
