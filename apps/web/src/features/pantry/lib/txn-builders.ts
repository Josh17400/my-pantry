/**
 * Build AppendTxnInput payloads for pantry actions.
 * All stock writes go through usePantry().appendTxn — never mutate qty directly.
 */

import type { AbsoluteReason, RelativeReason } from '@larder/core';
import type { AppendTxnInput } from '../../../db/types';
import {
  DEFAULT_DEVICE_ID,
  DEFAULT_HOUSEHOLD_ID,
  DEFAULT_USER_ID,
} from '../../../db/constants';

export type TxnActor = {
  householdId?: string;
  deviceId?: string;
  userId?: string;
};

function actorDefaults(actor: TxnActor = {}) {
  return {
    householdId: actor.householdId ?? DEFAULT_HOUSEHOLD_ID,
    deviceId: actor.deviceId ?? DEFAULT_DEVICE_ID,
    userId: actor.userId ?? DEFAULT_USER_ID,
  };
}

/** Stable-enough client id for local ledger idempotency. */
export function newClientTxnId(prefix = 'ct'): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`;
}

export type ItemKeys = {
  ingredientId: string;
  formId: string;
};

/** Relative adjust — "add/remove this much" (reason: adjust_delta). */
export function buildAdjustTxn(
  item: ItemKeys,
  deltaBase: number,
  actor: TxnActor = {},
  occurredAt: string = new Date().toISOString(),
): AppendTxnInput {
  const a = actorDefaults(actor);
  return {
    clientTxnId: newClientTxnId('adj'),
    householdId: a.householdId,
    ingredientId: item.ingredientId,
    formId: item.formId,
    kind: 'relative',
    reason: 'adjust_delta' satisfies RelativeReason,
    deltaBase,
    occurredAt,
    deviceId: a.deviceId,
    userId: a.userId,
  };
}

/**
 * Absolute recount — "there is exactly this much" (reason: recount).
 * Semantically different from adjust; UI must keep that clear.
 */
export function buildRecountTxn(
  item: ItemKeys,
  targetBase: number,
  actor: TxnActor = {},
  opts: { basisCursor?: string; occurredAt?: string } = {},
): AppendTxnInput {
  const a = actorDefaults(actor);
  return {
    clientTxnId: newClientTxnId('rc'),
    householdId: a.householdId,
    ingredientId: item.ingredientId,
    formId: item.formId,
    kind: 'absolute',
    reason: 'recount' satisfies AbsoluteReason,
    targetBase,
    basisCursor: opts.basisCursor,
    occurredAt: opts.occurredAt ?? new Date().toISOString(),
    deviceId: a.deviceId,
    userId: a.userId,
  };
}

/** Relative waste — spoil / trash amount (negative delta). */
export function buildWasteTxn(
  item: ItemKeys,
  amountBase: number,
  actor: TxnActor = {},
  occurredAt: string = new Date().toISOString(),
): AppendTxnInput {
  const a = actorDefaults(actor);
  const delta = amountBase > 0 ? -amountBase : amountBase;
  return {
    clientTxnId: newClientTxnId('wst'),
    householdId: a.householdId,
    ingredientId: item.ingredientId,
    formId: item.formId,
    kind: 'relative',
    reason: 'waste' satisfies RelativeReason,
    deltaBase: delta,
    occurredAt,
    deviceId: a.deviceId,
    userId: a.userId,
  };
}

/**
 * Mark used up — absolute snap to zero ("there is exactly none left").
 * Prefer recount over waste so provenance re-verifies empty stock.
 */
export function buildMarkUsedUpTxn(
  item: ItemKeys,
  actor: TxnActor = {},
  opts: { basisCursor?: string; occurredAt?: string } = {},
): AppendTxnInput {
  return buildRecountTxn(item, 0, actor, opts);
}

/** Purchase — relative positive delta (manual add / restock). */
export function buildPurchaseTxn(
  item: ItemKeys,
  qtyBase: number,
  actor: TxnActor = {},
  occurredAt: string = new Date().toISOString(),
): AppendTxnInput {
  const a = actorDefaults(actor);
  return {
    clientTxnId: newClientTxnId('pur'),
    householdId: a.householdId,
    ingredientId: item.ingredientId,
    formId: item.formId,
    kind: 'relative',
    reason: 'purchase' satisfies RelativeReason,
    deltaBase: Math.abs(qtyBase),
    occurredAt,
    deviceId: a.deviceId,
    userId: a.userId,
  };
}

/**
 * Compensating txn for undo.
 * - relative → opposite adjust_delta
 * - absolute → recount back to previousQtyBase
 */
export function buildUndoTxn(
  original: AppendTxnInput,
  previousQtyBase: number,
  actor: TxnActor = {},
): AppendTxnInput {
  const a = actorDefaults(actor);
  const keys = {
    ingredientId: original.ingredientId,
    formId: original.formId,
  };

  if (original.kind === 'relative') {
    return buildAdjustTxn(keys, -original.deltaBase, a);
  }

  return buildRecountTxn(keys, previousQtyBase, a, {
    basisCursor: original.basisCursor,
  });
}

export type UndoPayload = {
  label: string;
  previousQtyBase: number;
  original: AppendTxnInput;
};
