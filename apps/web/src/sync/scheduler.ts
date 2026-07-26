/**
 * Background sync triggers: app focus / visibility, online event, after writes.
 * Never blocks UI — all network work is fire-and-forget.
 */

import type { SyncEngine } from './engine';

export type SyncSchedulerOptions = {
  engine: SyncEngine;
  /** Debounce window for after-write + focus bursts (ms). */
  debounceMs?: number;
};

/**
 * Attach document / window listeners. Returns a dispose function.
 * Safe in Node tests (no-ops when document/window missing).
 */
export function startSyncScheduler(
  options: SyncSchedulerOptions,
): () => void {
  const { engine } = options;
  const debounceMs = options.debounceMs ?? 400;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const kick = (trigger: string) => {
    if (disposed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void engine.run(trigger);
    }, debounceMs);
  };

  const onVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      kick('focus');
    }
  };

  const onFocus = () => kick('focus');
  const onOnline = () => kick('online');

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
  }

  // Initial attempt shortly after start (auth may still be resolving).
  kick('startup');

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    }
  };
}

/**
 * Call after a successful local appendTxn / recipe write.
 * Safe when engine is null (signed-out / unconfigured).
 */
export function notifyLocalWrite(engine: SyncEngine | null | undefined): void {
  engine?.scheduleAfterLocalWrite();
}
