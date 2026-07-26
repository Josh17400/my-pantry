/**
 * Persist recent receipt fingerprints for household double-scan guard.
 * localStorage-backed; injectable store for tests.
 */

import {
  checkReceiptDuplicate,
  receiptFingerprint,
  toReceiptRecord,
  type ReceiptDedupeDecision,
  type ReceiptFingerprintInput,
  type ReceiptRecord,
} from './core-imports';

const STORAGE_KEY = 'tgp.receipt.fingerprints.v1';
const MAX_RECORDS = 100;

export type FingerprintStore = {
  list(): ReceiptRecord[];
  add(record: ReceiptRecord): void;
  clear(): void;
};

function readRaw(): ReceiptRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isReceiptRecord);
  } catch {
    return [];
  }
}

function isReceiptRecord(v: unknown): v is ReceiptRecord {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.store === 'string' &&
    typeof o.date === 'string' &&
    typeof o.total === 'number' &&
    typeof o.lineCount === 'number' &&
    typeof o.fingerprint === 'string'
  );
}

function writeRaw(records: readonly ReceiptRecord[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(records.slice(-MAX_RECORDS)),
    );
  } catch {
    // quota / private mode — ignore
  }
}

/** Default localStorage-backed store. */
export const localFingerprintStore: FingerprintStore = {
  list: () => readRaw(),
  add: (record) => {
    const next = readRaw().filter((r) => r.fingerprint !== record.fingerprint);
    next.push(record);
    writeRaw(next);
  },
  clear: () => {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
  },
};

/** In-memory store for tests. */
export function createMemoryFingerprintStore(
  initial: readonly ReceiptRecord[] = [],
): FingerprintStore {
  let records = [...initial];
  return {
    list: () => [...records],
    add: (record) => {
      records = records
        .filter((r) => r.fingerprint !== record.fingerprint)
        .concat(record);
    },
    clear: () => {
      records = [];
    },
  };
}

export type DuplicateCheckResult = ReceiptDedupeDecision & {
  readonly fingerprint: string;
};

/**
 * Check candidate against recent receipts.
 * Exact match → block. Near match within 7 days → warn. Else ok.
 */
export function checkDuplicateReceipt(
  candidate: ReceiptFingerprintInput,
  store: FingerprintStore = localFingerprintStore,
): DuplicateCheckResult {
  const fingerprint = receiptFingerprint(candidate);
  const decision = checkReceiptDuplicate(candidate, store.list());
  return { ...decision, fingerprint };
}

/** Record a committed receipt so future scans can de-dupe. */
export function rememberCommittedReceipt(
  candidate: ReceiptFingerprintInput,
  store: FingerprintStore = localFingerprintStore,
): ReceiptRecord {
  const record = toReceiptRecord(candidate);
  store.add(record);
  return record;
}

export { receiptFingerprint, toReceiptRecord };
