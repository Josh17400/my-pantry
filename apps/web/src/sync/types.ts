/**
 * Sync layer types — client contract from supabase/SYNC.md.
 */

import type { Dimension, PantryTxn } from '@larder/core';

/** Visible UX states — never block the UI on the network. */
export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

export type SyncPhase =
  | 'idle'
  | 'push'
  | 'pull'
  | 'merge'
  | 'metadata'
  | 'done';

export type SyncState = {
  status: SyncStatus;
  phase: SyncPhase;
  /** ISO timestamp of last successful full loop, or null. */
  lastSyncedAt: string | null;
  /** Human-readable last error; never tokens. */
  lastError: string | null;
  /** True when the engine has pending local work (outbox). */
  hasPendingLocal: boolean;
  /** Remote household id when known. */
  remoteHouseholdId: string | null;
};

export type ConflictNotice = {
  /** Stable key: household|ingredient|form */
  key: string;
  householdId: string;
  ingredientId: string;
  formId: string;
  /** When first surfaced. */
  surfacedAt: string;
  message: string;
};

/** Local ledger row (camelCase, mirrors schema). */
export type LocalTxnRow = {
  id: string;
  clientTxnId: string;
  householdId: string;
  ingredientId: string;
  formId: string;
  kind: 'relative' | 'absolute';
  deltaBase: number | null;
  targetBase: number | null;
  basisCursor: string | null;
  reason: string;
  refId: string | null;
  unitPrice: number | null;
  occurredAt: string;
  acceptedAt: string | null;
  deviceId: string;
  userId: string;
};

/** Wire shape for PostgREST (snake_case). */
export type RemoteTxnRow = {
  id: string;
  client_txn_id: string;
  household_id: string;
  ingredient_id: string;
  form_id: string;
  kind: 'relative' | 'absolute';
  delta_base: number | null;
  target_base: number | null;
  basis_cursor: string | null;
  reason: string;
  ref_id: string | null;
  unit_price: number | null;
  occurred_at: string;
  accepted_at: string;
  device_id: string;
  user_id: string;
};

export type RemoteTxnInsert = Omit<RemoteTxnRow, 'accepted_at'> & {
  /** Omitted so server DEFAULT now() applies. */
  accepted_at?: never;
};

export type LocalPantryItem = {
  householdId: string;
  ingredientId: string;
  formId: string;
  locationId: string | null;
  qtyBase: number;
  dim: Dimension;
  parLevelBase: number;
  lowThresholdPct: number;
  lastVerifiedAt: string | null;
  unverifiedCookCount: number;
  openedAt: string | null;
  expiresAt: string | null;
  updatedAt: string;
  watermarkCursor: string | null;
  lastAbsoluteCursor: string | null;
  isNegative: boolean;
  conflict: boolean;
};

export type LocalLocation = {
  id: string;
  householdId: string;
  name: string;
  icon: string;
  tint: string;
  parentId: string | null;
  sortOrder: number;
  /** Local-only LWW clock when present in meta tables; else synthetic. */
  updatedAt?: string;
};

export type LocalRecipe = {
  id: string;
  householdId: string | null;
  title: string;
  servings: number;
  yieldNote: string | null;
  prepMin: number | null;
  cookMin: number | null;
  authorId: string | null;
  visibility: string;
  forkedFrom: string | null;
  tags: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LocalRecipeLine = {
  id: string;
  recipeId: string;
  sortOrder: number;
  ingredientId: string | null;
  formId: string | null;
  rawText: string;
  qty: number | null;
  unit: string | null;
  optional: boolean;
  groupId: string | null;
  substitutes: string | null;
  unknownAllergens: boolean;
  nonQuantified: boolean;
  qtyHigh: number | null;
  qtyLow: number | null;
  isRange: boolean;
};

export type LocalRecipeStep = {
  id: string;
  recipeId: string;
  sortOrder: number;
  text: string;
  durationSec: number | null;
  timerLabel: string | null;
};

export type IngredientKey = {
  householdId: string;
  ingredientId: string;
  formId: string;
};

export type MergeIngredientResult = {
  key: IngredientKey;
  refolded: boolean;
  conflict: boolean;
  qtyBase: number;
  /** Incoming txn that triggered merge, if any. */
  appliedClientTxnIds: string[];
};

export type PullPageResult = {
  rows: RemoteTxnRow[];
  nextCursor: string;
  /** True when length < pageSize — no more pages. */
  exhausted: boolean;
};

export type PushResult = {
  /** client_txn_id values the server accepted or already had (idempotent). */
  acknowledgedClientTxnIds: string[];
  /** Server accepted_at for each id when known (from returning). */
  acceptedAtByClientTxnId: Record<string, string>;
};

export type SyncRunResult = {
  pushed: number;
  pulled: number;
  refoldedIngredients: number;
  conflicts: number;
  metadataTouched: number;
  cursor: string | null;
  skipped: boolean;
  skipReason?: string;
};

export type SyncEngineOptions = {
  /** Local household id used by the app (default local-household). */
  localHouseholdId: string;
  /** Page size for pull. */
  pageSize: number;
  /** When false, skip network (tests / offline inject). */
  isOnline: () => boolean;
};

export const DEFAULT_SYNC_OPTIONS: SyncEngineOptions = {
  localHouseholdId: 'local-household',
  pageSize: 200,
  isOnline: () =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
};

export const EPOCH_CURSOR = '1970-01-01T00:00:00.000Z';

/** app_meta keys used by the sync layer. */
export const SYNC_META = {
  pullCursor: 'sync_pull_cursor',
  remoteHouseholdId: 'sync_remote_household_id',
  deviceId: 'sync_device_id',
  lastSyncedAt: 'sync_last_synced_at',
} as const;

/** Convert local row → core PantryTxn. */
export function localTxnToCore(row: LocalTxnRow): PantryTxn {
  const base = {
    id: row.id,
    clientTxnId: row.clientTxnId,
    householdId: row.householdId,
    ingredientId: row.ingredientId,
    formId: row.formId,
    refId: row.refId ?? undefined,
    unitPrice: row.unitPrice ?? undefined,
    occurredAt: row.occurredAt,
    acceptedAt: row.acceptedAt ?? undefined,
    deviceId: row.deviceId,
    userId: row.userId,
  };

  if (row.kind === 'absolute') {
    return {
      ...base,
      kind: 'absolute' as const,
      reason: 'recount' as const,
      targetBase: row.targetBase ?? 0,
      basisCursor: row.basisCursor ?? undefined,
    };
  }

  type RelativeReason =
    | 'purchase'
    | 'cook'
    | 'quick'
    | 'waste'
    | 'adjust_delta';

  return {
    ...base,
    kind: 'relative' as const,
    reason: row.reason as RelativeReason,
    deltaBase: row.deltaBase ?? 0,
  };
}

export function ingredientKeyOf(
  householdId: string,
  ingredientId: string,
  formId: string,
): string {
  return `${householdId}|${ingredientId}|${formId}`;
}
