/**
 * Sync engine — steady-state loop from SYNC.md §8.
 *
 *   pushOutbox → pullTxns → mergeAndProject → pullMetadataLWW → persistCursor
 *
 * Never blocks the UI. Failures leave the local app fully usable.
 * Auth is optional: signed-out → skip network, status stays local-friendly.
 */

import type { AuthClient } from '../auth';
import type { ConflictSurfaces } from './conflicts';
import { getConflictSurfaces } from './conflicts';
import { getOrCreateDeviceId } from './device';
import {
  sanitizeSyncError,
  SyncNotAuthenticatedError,
  SyncOfflineError,
  SyncSchemaMissingError,
} from './errors';
import { syncMetadata } from './metadata';
import type { SyncLocalPort, SyncRemotePort } from './ports';
import { pullAndMerge } from './pull';
import { pushOutbox } from './push';
import type { SyncStatusStore } from './status';
import { getSyncStatusStore } from './status';
import {
  DEFAULT_SYNC_OPTIONS,
  SYNC_META,
  type SyncEngineOptions,
  type SyncRunResult,
} from './types';

export type SyncEngineDeps = {
  local: SyncLocalPort;
  remote: SyncRemotePort | null;
  auth: AuthClient;
  status?: SyncStatusStore;
  conflicts?: ConflictSurfaces;
  options?: Partial<SyncEngineOptions>;
};

export class SyncEngine {
  private readonly local: SyncLocalPort;
  private readonly remote: SyncRemotePort | null;
  private readonly auth: AuthClient;
  private readonly status: SyncStatusStore;
  private readonly conflicts: ConflictSurfaces;
  private readonly options: SyncEngineOptions;
  private running: Promise<SyncRunResult> | null = null;
  private disposed = false;

  constructor(deps: SyncEngineDeps) {
    this.local = deps.local;
    this.remote = deps.remote;
    this.auth = deps.auth;
    this.status = deps.status ?? getSyncStatusStore();
    this.conflicts = deps.conflicts ?? getConflictSurfaces();
    this.options = { ...DEFAULT_SYNC_OPTIONS, ...deps.options };
  }

  /**
   * Run one full sync loop. Concurrent callers share the in-flight promise
   * (no overlapping push/pull).
   */
  async run(trigger: string = 'manual'): Promise<SyncRunResult> {
    if (this.disposed) {
      return emptySkip('disposed');
    }
    if (this.running) return this.running;
    this.running = this.doRun(trigger).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** Fire-and-forget after local writes — never awaits on UI path. */
  scheduleAfterLocalWrite(): void {
    void this.run('after_write').catch(() => {
      /* status store already updated */
    });
  }

  dispose(): void {
    this.disposed = true;
  }

  private async doRun(trigger: string): Promise<SyncRunResult> {
    void trigger;

    // Ensure device id exists for future local writes / diagnostics.
    await getOrCreateDeviceId(this.local);

    const pending = await this.local.listUnackedTxns(
      this.options.localHouseholdId,
    );
    this.status.setPending(pending.length > 0);

    if (!this.options.isOnline()) {
      this.status.markOffline('Device is offline — changes stay on this device');
      return emptySkip('offline');
    }

    await this.auth.initialize();
    const session = this.auth.getSession();
    if (!session) {
      // Signed-out: fully local. Not an error — offline-first.
      this.status.markSynced();
      return emptySkip('signed_out');
    }

    if (!this.remote) {
      this.status.markError(
        'Supabase is not configured (set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)',
      );
      return emptySkip('no_remote');
    }

    this.status.markSyncing('push');

    try {
      const remoteHouseholdId = await this.resolveHousehold();
      this.status.setRemoteHouseholdId(remoteHouseholdId);
      await this.local.setMeta(SYNC_META.remoteHouseholdId, remoteHouseholdId);

      // 1. Push outbox
      this.status.setPhase('push');
      const pushResult = await pushOutbox({
        local: this.local,
        remote: this.remote,
        localHouseholdId: this.options.localHouseholdId,
        remoteHouseholdId,
        userId: session.user.id,
      });

      // 2. Pull + merge (needsRefold / foldLedger)
      this.status.setPhase('pull');
      const pullResult = await pullAndMerge({
        local: this.local,
        remote: this.remote,
        localHouseholdId: this.options.localHouseholdId,
        remoteHouseholdId,
        pageSize: this.options.pageSize,
      });

      this.status.setPhase('merge');
      const refolded = pullResult.merge.results.filter((r) => r.refolded).length;
      const freshConflicts = this.conflicts.surfaceFromMerge(
        pullResult.merge.results,
      );

      // 3. Metadata LWW
      this.status.setPhase('metadata');
      const meta = await syncMetadata({
        local: this.local,
        remote: this.remote,
        localHouseholdId: this.options.localHouseholdId,
        remoteHouseholdId,
      });

      const stillPending = await this.local.listUnackedTxns(
        this.options.localHouseholdId,
      );
      this.status.setPending(stillPending.length > 0);

      const now = new Date().toISOString();
      await this.local.setMeta(SYNC_META.lastSyncedAt, now);
      this.status.markSynced(now);

      return {
        pushed: pushResult.acknowledgedClientTxnIds.length,
        pulled: pullResult.pulled,
        refoldedIngredients: refolded,
        conflicts: freshConflicts.length,
        metadataTouched:
          meta.locationsApplied +
          meta.recipesApplied +
          meta.pantryMetaApplied +
          meta.locationsPushed +
          meta.recipesPushed,
        cursor: pullResult.cursor,
        skipped: false,
      };
    } catch (err) {
      const message = sanitizeSyncError(err);
      if (err instanceof SyncOfflineError) {
        this.status.markOffline(message);
      } else if (err instanceof SyncNotAuthenticatedError) {
        this.status.markSynced();
        return emptySkip('signed_out');
      } else if (err instanceof SyncSchemaMissingError) {
        // Clear failure mode when migrations not applied.
        this.status.markError(message);
      } else {
        this.status.markError(message);
      }
      return {
        ...emptySkip('error'),
        skipReason: message,
      };
    }
  }

  private async resolveHousehold(): Promise<string> {
    if (!this.remote) {
      throw new SyncNotAuthenticatedError('No remote client');
    }
    const cached = await this.local.getMeta(SYNC_META.remoteHouseholdId);
    const ids = await this.remote.myHouseholdIds();
    if (ids.length === 0) {
      throw new SyncSchemaMissingError(
        'household_members',
        'No household membership found. Signup should create one via handle_new_user — check that migrations are applied (`supabase db push`).',
      );
    }
    if (cached && ids.includes(cached)) return cached;
    return ids[0]!;
  }
}

function emptySkip(reason: string): SyncRunResult {
  return {
    pushed: 0,
    pulled: 0,
    refoldedIngredients: 0,
    conflicts: 0,
    metadataTouched: 0,
    cursor: null,
    skipped: true,
    skipReason: reason,
  };
}
