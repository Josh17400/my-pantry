/**
 * Conflict surfacing — foldLedger reports conflict:true for concurrent recounts.
 * Surface each conflict once; don't spam, don't hide.
 */

import type { ConflictNotice, IngredientKey, MergeIngredientResult } from './types';
import { ingredientKeyOf } from './types';

export type ConflictListener = (notice: ConflictNotice) => void;

/**
 * Tracks which ingredient keys have already been shown to the user.
 * New conflicts for the same key are coalesced until dismissed.
 */
export class ConflictSurfaces {
  private active = new Map<string, ConflictNotice>();
  private listeners = new Set<ConflictListener>();

  subscribe(listener: ConflictListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  list(): ConflictNotice[] {
    return [...this.active.values()];
  }

  /**
   * Surface conflicts from a merge batch. Returns notices that are *new*
   * (first time this key was reported since last dismiss).
   */
  surfaceFromMerge(
    results: readonly MergeIngredientResult[],
    nowIso: string = new Date().toISOString(),
  ): ConflictNotice[] {
    const fresh: ConflictNotice[] = [];
    for (const r of results) {
      if (!r.conflict) continue;
      const notice = this.surfaceKey(r.key, nowIso);
      if (notice) fresh.push(notice);
    }
    return fresh;
  }

  surfaceKey(
    key: IngredientKey,
    nowIso: string = new Date().toISOString(),
  ): ConflictNotice | null {
    const id = ingredientKeyOf(
      key.householdId,
      key.ingredientId,
      key.formId,
    );
    if (this.active.has(id)) return null;

    const notice: ConflictNotice = {
      key: id,
      householdId: key.householdId,
      ingredientId: key.ingredientId,
      formId: key.formId,
      surfacedAt: nowIso,
      message:
        'Two devices recounted this item at the same time. The later recount (by time order) was kept — check the quantity.',
    };
    this.active.set(id, notice);
    for (const listener of this.listeners) {
      listener(notice);
    }
    return notice;
  }

  /** User acknowledged / dismissed a conflict for this key. */
  dismiss(key: string): void {
    this.active.delete(key);
  }

  dismissAll(): void {
    this.active.clear();
  }

  clear(): void {
    this.dismissAll();
  }
}

let defaultSurfaces: ConflictSurfaces | null = null;

export function getConflictSurfaces(): ConflictSurfaces {
  if (!defaultSurfaces) defaultSurfaces = new ConflictSurfaces();
  return defaultSurfaces;
}

export function resetConflictSurfaces(): void {
  defaultSurfaces?.clear();
  defaultSurfaces = null;
}
