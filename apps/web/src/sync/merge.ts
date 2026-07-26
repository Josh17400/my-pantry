/**
 * Merge pull results into the local ledger and re-project.
 *
 * Crux (SYNC.md): fold order is (occurred_at, device_id, client_txn_id);
 * pull cursor is accepted_at. Arrival order ≠ fold order.
 *
 * For each affected ingredient, call needsRefold; when true, foldLedger.
 */

import {
  applyIncomingTxn,
  DEFAULT_LOW_THRESHOLD_PCT,
  type Dimension,
  emptyProjection,
  foldLedger,
  needsRefold,
  type PantryTxn,
  projectionMatchesFold,
  txnCursor,
} from '@larder/core';

import { remoteTxnToLocal } from './mapping';
import type { SyncLocalPort } from './ports';
import {
  type IngredientKey,
  type LocalPantryItem,
  type LocalTxnRow,
  localTxnToCore,
  type MergeIngredientResult,
  type RemoteTxnRow,
} from './types';

export type MergePullOptions = {
  local: SyncLocalPort;
  localHouseholdId: string;
  remoteRows: readonly RemoteTxnRow[];
  nowIso?: string;
};

export type MergePullResult = {
  inserted: number;
  skippedExisting: number;
  results: MergeIngredientResult[];
  conflicts: MergeIngredientResult[];
};

/**
 * Union remote rows into the local log, then project per ingredient/form.
 */
export async function mergePulledTxns(
  options: MergePullOptions,
): Promise<MergePullResult> {
  const { local, localHouseholdId, remoteRows } = options;
  const nowIso = options.nowIso ?? new Date().toISOString();

  let inserted = 0;
  let skippedExisting = 0;

  // Group by ingredient (fold is per ingredient log).
  const byIngredient = new Map<string, LocalTxnRow[]>();

  for (const remote of remoteRows) {
    const row = remoteTxnToLocal(remote, localHouseholdId);
    const status = await local.insertTxnIfAbsent(row);
    if (status === 'inserted') inserted += 1;
    else skippedExisting += 1;

    const key = row.ingredientId;
    const list = byIngredient.get(key) ?? [];
    list.push(row);
    byIngredient.set(key, list);
  }

  const results: MergeIngredientResult[] = [];
  const conflicts: MergeIngredientResult[] = [];

  for (const [ingredientId, incomingRows] of byIngredient) {
    // Re-project each distinct form touched; fold uses all forms' txns for the
    // ingredient (matches DomainRepository.recomputeProjection).
    const forms = new Set(incomingRows.map((r) => r.formId));
    const fullLogRows = await local.listTxnsForIngredient(
      localHouseholdId,
      ingredientId,
    );
    const fullLog: PantryTxn[] = fullLogRows.map(localTxnToCore);

    for (const formId of forms) {
      const formIncoming = incomingRows.filter((r) => r.formId === formId);
      const mergeResult = await projectIngredientForm({
        local,
        localHouseholdId,
        ingredientId,
        formId,
        fullLog,
        incoming: formIncoming.map(localTxnToCore),
        nowIso,
      });
      results.push(mergeResult);
      if (mergeResult.conflict) conflicts.push(mergeResult);
    }
  }

  return { inserted, skippedExisting, results, conflicts };
}

async function projectIngredientForm(args: {
  local: SyncLocalPort;
  localHouseholdId: string;
  ingredientId: string;
  formId: string;
  fullLog: readonly PantryTxn[];
  incoming: readonly PantryTxn[];
  nowIso: string;
}): Promise<MergeIngredientResult> {
  const {
    local,
    localHouseholdId,
    ingredientId,
    formId,
    fullLog,
    incoming,
    nowIso,
  } = args;

  const key: IngredientKey = {
    householdId: localHouseholdId,
    ingredientId,
    formId,
  };

  const existing = await local.getPantryItem(
    localHouseholdId,
    ingredientId,
    formId,
  );

  let cache = existing
    ? toProjectionCache(existing)
    : emptyProjection({
        householdId: localHouseholdId,
        ingredientId,
        formId,
        dim: 'mass' as Dimension,
      });

  // Apply each incoming in *arrival* order for the needsRefold decision,
  // but always re-fold against the full union log when required.
  let anyRefold = false;
  let lastConflict = false;
  let lastQty = cache.qtyBase;

  // Sort incoming by accepted_at is not available on PantryTxn reliably for
  // all paths; use the order they appear in the pull page (caller order).
  for (const txn of incoming) {
    const mustRefold = needsRefold(cache.watermarkCursor, txn);
    if (mustRefold) {
      anyRefold = true;
      // Full re-fold of the union log — not arrival-order deltas.
      const fold = foldLedger(fullLog, { nowIso });
      cache = {
        householdId: localHouseholdId,
        ingredientId,
        formId,
        qtyBase: fold.qtyBase,
        dim: cache.dim,
        watermarkCursor: fold.lastTxnCursor,
        lastAbsoluteCursor: fold.lastAbsoluteCursor,
        provenance: fold.provenance,
        isNegative: fold.isNegative,
        conflict: fold.conflict,
      };
      lastConflict = fold.conflict;
      lastQty = fold.qtyBase;
    } else {
      const applied = applyIncomingTxn(cache, txn, fullLog, { nowIso });
      cache = applied.cache;
      if (applied.refolded) anyRefold = true;
      if (applied.fold) {
        lastConflict = applied.fold.conflict;
      }
      lastQty = cache.qtyBase;
    }
  }

  // Safety: if multiple out-of-order events in one page, ensure invariant.
  if (!projectionMatchesFold(cache, fullLog)) {
    anyRefold = true;
    const fold = foldLedger(fullLog, { nowIso });
    cache = {
      householdId: localHouseholdId,
      ingredientId,
      formId,
      qtyBase: fold.qtyBase,
      dim: cache.dim,
      watermarkCursor: fold.lastTxnCursor,
      lastAbsoluteCursor: fold.lastAbsoluteCursor,
      provenance: fold.provenance,
      isNegative: fold.isNegative,
      conflict: fold.conflict,
    };
    lastConflict = fold.conflict;
    lastQty = fold.qtyBase;
  }

  const dim = cache.dim;
  const item: LocalPantryItem = {
    householdId: localHouseholdId,
    ingredientId,
    formId,
    locationId: existing?.locationId ?? null,
    qtyBase: cache.qtyBase,
    dim,
    parLevelBase: existing?.parLevelBase ?? Math.max(cache.qtyBase, 0),
    lowThresholdPct: existing?.lowThresholdPct ?? DEFAULT_LOW_THRESHOLD_PCT,
    lastVerifiedAt: cache.provenance.lastVerifiedAt,
    unverifiedCookCount: cache.provenance.unverifiedCookCount,
    openedAt: existing?.openedAt ?? null,
    expiresAt: existing?.expiresAt ?? null,
    updatedAt: nowIso,
    watermarkCursor: cache.watermarkCursor,
    lastAbsoluteCursor: cache.lastAbsoluteCursor,
    isNegative: cache.isNegative,
    conflict: cache.conflict,
  };

  await local.upsertProjection(item);

  return {
    key,
    refolded: anyRefold,
    conflict: lastConflict || cache.conflict,
    qtyBase: lastQty,
    appliedClientTxnIds: incoming.map((t) => t.clientTxnId),
  };
}

function toProjectionCache(item: LocalPantryItem) {
  return {
    householdId: item.householdId,
    ingredientId: item.ingredientId,
    formId: item.formId,
    qtyBase: item.qtyBase,
    dim: item.dim,
    watermarkCursor: item.watermarkCursor,
    lastAbsoluteCursor: item.lastAbsoluteCursor,
    provenance: {
      lastVerifiedAt: item.lastVerifiedAt,
      unverifiedCookCount: item.unverifiedCookCount,
      confidence: 'verified' as const,
    },
    isNegative: item.isNegative,
    conflict: item.conflict,
  };
}

/**
 * Pure helper for tests: given an existing watermark + full log after merge,
 * decide whether needsRefold fires and what fold produces.
 */
export function evaluateOutOfOrderMerge(args: {
  existingWatermark: string | null;
  existingQty: number;
  dim: Dimension;
  householdId: string;
  ingredientId: string;
  formId: string;
  fullLog: readonly PantryTxn[];
  incoming: PantryTxn;
}): {
  needs: boolean;
  foldQty: number;
  /** Wrong result if someone naively did qty += delta in arrival order. */
  naiveArrivalQty: number;
  watermarkAfter: string | null;
  conflict: boolean;
} {
  const needs = needsRefold(args.existingWatermark, args.incoming);
  const fold = foldLedger(args.fullLog);
  const naiveArrivalQty =
    args.incoming.kind === 'relative'
      ? args.existingQty + args.incoming.deltaBase
      : args.incoming.targetBase;

  return {
    needs,
    foldQty: fold.qtyBase,
    naiveArrivalQty,
    watermarkAfter: fold.lastTxnCursor,
    conflict: fold.conflict,
  };
}

export { foldLedger, needsRefold, projectionMatchesFold,txnCursor };
