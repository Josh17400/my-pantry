/**
 * Visible sync state: synced / syncing / offline / error.
 * Never blocks the UI — consumers subscribe and render badges only.
 */

import type { SyncPhase, SyncState, SyncStatus } from './types';

export type SyncStateListener = (state: SyncState) => void;

const INITIAL: SyncState = {
  status: 'synced',
  phase: 'idle',
  lastSyncedAt: null,
  lastError: null,
  hasPendingLocal: false,
  remoteHouseholdId: null,
};

export class SyncStatusStore {
  private state: SyncState = { ...INITIAL };
  private listeners = new Set<SyncStateListener>();

  getState(): SyncState {
    return this.state;
  }

  subscribe(listener: SyncStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setStatus(status: SyncStatus, patch?: Partial<SyncState>): void {
    this.patch({ status, ...patch });
  }

  setPhase(phase: SyncPhase): void {
    this.patch({ phase });
  }

  setPending(hasPendingLocal: boolean): void {
    this.patch({ hasPendingLocal });
  }

  setRemoteHouseholdId(id: string | null): void {
    this.patch({ remoteHouseholdId: id });
  }

  markSyncing(phase: SyncPhase = 'push'): void {
    this.patch({ status: 'syncing', phase, lastError: null });
  }

  markSynced(at: string = new Date().toISOString()): void {
    this.patch({
      status: 'synced',
      phase: 'done',
      lastSyncedAt: at,
      lastError: null,
    });
  }

  markOffline(message?: string): void {
    this.patch({
      status: 'offline',
      phase: 'idle',
      lastError: message ?? null,
    });
  }

  markError(message: string): void {
    this.patch({
      status: 'error',
      phase: 'idle',
      lastError: message,
    });
  }

  reset(): void {
    this.state = { ...INITIAL };
    this.emit();
  }

  patch(partial: Partial<SyncState>): void {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

let defaultStore: SyncStatusStore | null = null;

export function getSyncStatusStore(): SyncStatusStore {
  if (!defaultStore) defaultStore = new SyncStatusStore();
  return defaultStore;
}

export function resetSyncStatusStore(): void {
  defaultStore?.reset();
  defaultStore = null;
}
