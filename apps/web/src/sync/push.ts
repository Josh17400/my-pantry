/**
 * Push local outbox → server.
 * ON CONFLICT (household_id, client_txn_id) DO NOTHING — retries are free.
 * Mark local accepted_at only after the server confirms the request.
 */

import { localTxnToRemoteInsert } from './mapping';
import type { SyncLocalPort, SyncRemotePort } from './ports';
import type { PushResult } from './types';

export type PushOutboxArgs = {
  local: SyncLocalPort;
  remote: SyncRemotePort;
  localHouseholdId: string;
  remoteHouseholdId: string;
  /** auth.uid() — required by RLS. */
  userId: string;
};

export type PushOutboxResult = PushResult & {
  attempted: number;
};

export async function pushOutbox(
  args: PushOutboxArgs,
): Promise<PushOutboxResult> {
  const {
    local,
    remote,
    localHouseholdId,
    remoteHouseholdId,
    userId,
  } = args;

  const pending = await local.listUnackedTxns(localHouseholdId);
  if (pending.length === 0) {
    return {
      attempted: 0,
      acknowledgedClientTxnIds: [],
      acceptedAtByClientTxnId: {},
    };
  }

  const inserts = pending.map((row) =>
    localTxnToRemoteInsert(row, remoteHouseholdId, userId),
  );

  const result = await remote.pushTxns(inserts);

  // Mark acknowledged only after server confirms (request success).
  for (const clientTxnId of result.acknowledgedClientTxnIds) {
    const acceptedAt =
      result.acceptedAtByClientTxnId[clientTxnId] ?? new Date().toISOString();
    await local.markTxnAccepted(localHouseholdId, clientTxnId, acceptedAt);
  }

  return {
    attempted: pending.length,
    ...result,
  };
}
