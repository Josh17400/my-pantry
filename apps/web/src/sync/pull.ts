/**
 * Pull pantry_txns where accepted_at > cursor, ordered by accepted_at, paged.
 * Persist cursor after each successful page merge.
 */

import { mergePulledTxns, type MergePullResult } from './merge';
import type { SyncLocalPort, SyncRemotePort } from './ports';
import { EPOCH_CURSOR, SYNC_META, type RemoteTxnRow } from './types';

export type PullAndMergeArgs = {
  local: SyncLocalPort;
  remote: SyncRemotePort;
  localHouseholdId: string;
  remoteHouseholdId: string;
  pageSize: number;
  nowIso?: string;
};

export type PullAndMergeResult = {
  pulled: number;
  pages: number;
  cursor: string;
  merge: MergePullResult;
};

export async function pullAndMerge(
  args: PullAndMergeArgs,
): Promise<PullAndMergeResult> {
  const {
    local,
    remote,
    localHouseholdId,
    remoteHouseholdId,
    pageSize,
  } = args;
  const nowIso = args.nowIso ?? new Date().toISOString();

  let cursor =
    (await local.getMeta(SYNC_META.pullCursor)) ?? EPOCH_CURSOR;
  let pulled = 0;
  let pages = 0;
  const allRows: RemoteTxnRow[] = [];

  // Page until short page.
  for (;;) {
    const page = await remote.pullTxns(remoteHouseholdId, cursor, pageSize);
    pages += 1;
    allRows.push(...page.rows);
    pulled += page.rows.length;

    if (page.rows.length > 0) {
      cursor = page.nextCursor;
      await local.setMeta(SYNC_META.pullCursor, cursor);
    }

    if (page.exhausted) break;
    // Safety: empty page with not-exhausted shouldn't loop forever.
    if (page.rows.length === 0) break;
  }

  const merge =
    allRows.length === 0
      ? {
          inserted: 0,
          skippedExisting: 0,
          results: [],
          conflicts: [],
        }
      : await mergePulledTxns({
          local,
          localHouseholdId,
          remoteRows: allRows,
          nowIso,
        });

  return { pulled, pages, cursor, merge };
}

export async function getPullCursor(local: SyncLocalPort): Promise<string> {
  return (await local.getMeta(SYNC_META.pullCursor)) ?? EPOCH_CURSOR;
}

export async function setPullCursor(
  local: SyncLocalPort,
  cursor: string,
): Promise<void> {
  await local.setMeta(SYNC_META.pullCursor, cursor);
}
