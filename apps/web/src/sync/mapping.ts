/**
 * Boundary maps: local camelCase ↔ remote snake_case (PostgREST).
 * Local household stays DEFAULT_HOUSEHOLD_ID; remote uses real household id.
 */

import type { LocalTxnRow, RemoteTxnInsert, RemoteTxnRow } from './types';

/** Normalize server timestamptz to ISO-8601 with Z when possible. */
export function toIso(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString();
}

export function remoteTxnToLocal(
  remote: RemoteTxnRow,
  localHouseholdId: string,
): LocalTxnRow {
  return {
    id: remote.id,
    clientTxnId: remote.client_txn_id,
    householdId: localHouseholdId,
    ingredientId: remote.ingredient_id,
    formId: remote.form_id,
    kind: remote.kind,
    deltaBase: remote.delta_base,
    targetBase: remote.target_base,
    basisCursor: remote.basis_cursor,
    reason: remote.reason,
    refId: remote.ref_id,
    unitPrice: remote.unit_price,
    occurredAt: toIso(remote.occurred_at) ?? remote.occurred_at,
    acceptedAt: toIso(remote.accepted_at) ?? remote.accepted_at,
    deviceId: remote.device_id,
    userId: remote.user_id,
  };
}

/**
 * Build a server insert from a local outbox row.
 * Omits accepted_at so the server clock applies.
 */
export function localTxnToRemoteInsert(
  local: LocalTxnRow,
  remoteHouseholdId: string,
  userId: string,
): RemoteTxnInsert {
  return {
    id: local.id,
    client_txn_id: local.clientTxnId,
    household_id: remoteHouseholdId,
    ingredient_id: local.ingredientId,
    form_id: local.formId,
    kind: local.kind,
    delta_base: local.deltaBase,
    target_base: local.targetBase,
    basis_cursor: local.basisCursor,
    reason: local.reason,
    ref_id: local.refId,
    unit_price: local.unitPrice,
    occurred_at: local.occurredAt,
    device_id: local.deviceId,
    user_id: userId,
  };
}

/** LWW: true when remote timestamp is strictly newer than local. */
export function remoteWinsLww(
  localUpdatedAt: string | null | undefined,
  remoteUpdatedAt: string | null | undefined,
): boolean {
  if (remoteUpdatedAt == null || remoteUpdatedAt === '') return false;
  if (localUpdatedAt == null || localUpdatedAt === '') return true;
  const localMs = Date.parse(localUpdatedAt);
  const remoteMs = Date.parse(remoteUpdatedAt);
  if (Number.isNaN(remoteMs)) return false;
  if (Number.isNaN(localMs)) return true;
  return remoteMs > localMs;
}

/** Equal or local newer → keep local (push side). */
export function localWinsLww(
  localUpdatedAt: string | null | undefined,
  remoteUpdatedAt: string | null | undefined,
): boolean {
  return !remoteWinsLww(localUpdatedAt, remoteUpdatedAt);
}
