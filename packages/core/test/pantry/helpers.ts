/**
 * Test helpers for pantry ledger tests.
 * Seeded PRNG only — Math.random() is forbidden in property tests.
 */

import type {
  AbsoluteTxn,
  PantryTxn,
  RelativeReason,
  RelativeTxn,
} from '../../src/pantry/types';

/** Mulberry32 — deterministic PRNG from a 32-bit seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle with seeded RNG. Does not mutate input. */
export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

export const shuffleCopy = shuffle;

const HOUSEHOLD = 'hh-test';
const ING = 'ing-flour';
const FORM = 'form-flour-allpurpose';
const USER = 'user-1';

let seq = 0;

export function resetSeq(): void {
  seq = 0;
}

function nextId(): string {
  seq += 1;
  return `id-${seq}`;
}

export type RelOpts = {
  clientTxnId?: string;
  deltaBase: number;
  reason?: RelativeReason;
  occurredAt: string;
  deviceId?: string;
  householdId?: string;
  ingredientId?: string;
  formId?: string;
  userId?: string;
  id?: string;
  refId?: string;
};

export function rel(opts: RelOpts): RelativeTxn {
  return {
    kind: 'relative',
    id: opts.id ?? nextId(),
    clientTxnId:
      opts.clientTxnId ?? `c-${opts.occurredAt}-${opts.deltaBase}-${nextId()}`,
    householdId: opts.householdId ?? HOUSEHOLD,
    ingredientId: opts.ingredientId ?? ING,
    formId: opts.formId ?? FORM,
    reason: opts.reason ?? (opts.deltaBase >= 0 ? 'purchase' : 'cook'),
    deltaBase: opts.deltaBase,
    occurredAt: opts.occurredAt,
    deviceId: opts.deviceId ?? 'device-a',
    userId: opts.userId ?? USER,
    refId: opts.refId,
  };
}

export type AbsOpts = {
  clientTxnId?: string;
  targetBase: number;
  occurredAt: string;
  deviceId?: string;
  basisCursor?: string;
  householdId?: string;
  ingredientId?: string;
  formId?: string;
  userId?: string;
  id?: string;
};

export function abs(opts: AbsOpts): AbsoluteTxn {
  return {
    kind: 'absolute',
    id: opts.id ?? nextId(),
    clientTxnId:
      opts.clientTxnId ??
      `c-abs-${opts.occurredAt}-${opts.targetBase}-${nextId()}`,
    householdId: opts.householdId ?? HOUSEHOLD,
    ingredientId: opts.ingredientId ?? ING,
    formId: opts.formId ?? FORM,
    reason: 'recount',
    targetBase: opts.targetBase,
    basisCursor: opts.basisCursor,
    occurredAt: opts.occurredAt,
    deviceId: opts.deviceId ?? 'device-a',
    userId: opts.userId ?? USER,
  };
}

/** ISO helper: day offset from a fixed epoch for readable tests. */
export function day(n: number, hour = 12): string {
  const base = Date.UTC(2024, 0, 1, hour, 0, 0);
  return new Date(base + n * 86_400_000).toISOString();
}

export function sumRelativeDeltasLocal(txns: readonly PantryTxn[]): number {
  let s = 0;
  const seen = new Set<string>();
  for (const t of txns) {
    if (seen.has(t.clientTxnId)) continue;
    seen.add(t.clientTxnId);
    if (t.kind === 'relative') s += t.deltaBase;
  }
  return s;
}
