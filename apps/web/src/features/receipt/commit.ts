/**
 * Commit accepted review lines as purchase txns + charge scan quota.
 * Nothing enters the pantry until this runs.
 */

import {
  DEFAULT_DEVICE_ID,
  DEFAULT_HOUSEHOLD_ID,
  DEFAULT_USER_ID,
} from '../../db/constants';
import type { AppendTxnInput } from '../../db/types';
import type { AliasStore } from './alias-store';
import { localAliasStore } from './alias-store';
import type { FingerprintStore } from './fingerprint-store';
import {
  localFingerprintStore,
  rememberCommittedReceipt,
} from './fingerprint-store';
import type { ParseClient } from './parse-client';
import { liveParseClient } from './parse-client';
import {
  aliasesToLearn,
  commitPreview,
  linesToCommit,
  type ReviewState,
} from './review-model';
import type { CommitResult } from './types';

function newClientTxnId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export type AppendTxnFn = (txn: AppendTxnInput) => Promise<void>;

export type CommitReceiptInput = {
  readonly state: ReviewState;
  readonly appendTxn: AppendTxnFn;
  readonly householdId?: string;
  readonly deviceId?: string;
  readonly userId?: string;
  readonly parseClient?: ParseClient;
  readonly aliasStore?: AliasStore;
  readonly fingerprintStore?: FingerprintStore;
  /** When true, skip server commit (local-only / offline demo). */
  readonly localOnly?: boolean;
};

export type CommitReceiptResult =
  | { readonly ok: true; readonly result: CommitResult }
  | { readonly ok: false; readonly message: string };

/**
 * Build purchase AppendTxnInput rows from accepted review lines.
 * Carries shoppingTripId via refId and unitPrice when known.
 */
export function buildPurchaseTxns(
  state: ReviewState,
  actor: {
    householdId?: string;
    deviceId?: string;
    userId?: string;
  } = {},
): AppendTxnInput[] {
  const householdId = actor.householdId ?? DEFAULT_HOUSEHOLD_ID;
  const deviceId = actor.deviceId ?? DEFAULT_DEVICE_ID;
  const userId = actor.userId ?? DEFAULT_USER_ID;
  const occurredAt = new Date().toISOString();
  const lines = linesToCommit(state);

  return lines.map((line) => {
    const txn: AppendTxnInput = {
      clientTxnId: newClientTxnId('rcp'),
      householdId,
      ingredientId: line.ingredientId!,
      formId: line.formId!,
      kind: 'relative',
      reason: 'purchase',
      deltaBase: Math.abs(line.qtyBase!),
      refId: state.shoppingTripId,
      unitPrice: line.unitPrice ?? undefined,
      occurredAt,
      deviceId,
      userId,
    };
    return txn;
  });
}

/**
 * Write pantry purchases, learn aliases, record fingerprint, charge quota.
 */
export async function commitReceipt(
  input: CommitReceiptInput,
): Promise<CommitReceiptResult> {
  const {
    state,
    appendTxn,
    householdId = DEFAULT_HOUSEHOLD_ID,
    deviceId = DEFAULT_DEVICE_ID,
    userId = DEFAULT_USER_ID,
    parseClient = liveParseClient,
    aliasStore = localAliasStore,
    fingerprintStore = localFingerprintStore,
    localOnly = false,
  } = input;

  const preview = commitPreview(state);
  const txns = buildPurchaseTxns(state, { householdId, deviceId, userId });

  try {
    for (const txn of txns) {
      await appendTxn(txn);
    }

    for (const a of aliasesToLearn(state)) {
      aliasStore.learn({
        alias: a.alias,
        ingredientId: a.ingredientId,
        householdId,
      });
    }

    if (state.storeName && state.receiptDate && state.total != null) {
      rememberCommittedReceipt(
        {
          store: state.storeName,
          date: state.receiptDate,
          total: state.total,
          lineCount: state.lines.length,
        },
        fingerprintStore,
      );
    }

    if (!localOnly && preview.added > 0) {
      const commitRes = await parseClient.commit({
        attemptId: state.attemptId,
        committedLineCount: preview.added,
      });
      if (!commitRes.ok) {
        // Pantry already written — report soft failure on quota charge.
        return {
          ok: true,
          result: {
            ...preview,
            message: `${preview.message} (quota sync: ${commitRes.message})`,
          },
        };
      }
    }

    return { ok: true, result: preview };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
