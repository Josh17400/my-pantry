/**
 * Projection self-heal: re-fold the ledger and rewrite drifted pantry_items.
 *
 * Invariant (SPEC): projection == fold(log). The projection is a cache; once
 * an older build wrote a txn without updating qtyBase, every screen rendered
 * the stale number. This pass closes that gap without wiping user data.
 *
 * Always uses `foldLedger` from `@larder/core` — never a second fold.
 */

import {
  foldLedger,
  type FoldResult,
  type PantryTxn,
  SEED_VERSION,
} from '@larder/core';
import { eq } from 'drizzle-orm';

import {
  DEFAULT_HOUSEHOLD_ID,
  META_PROJECTION_REPAIR_STAMP,
  PROJECTION_REPAIR_VERSION,
} from './constants';
import type { AppDatabase } from './domain-repository';
import { appMeta, pantryItems, pantryTxns } from './schema';
import type { PantryItemRow } from './types';

export type ProjectionRepairChange = {
  ingredientId: string;
  formId: string;
  beforeQty: number | null;
  afterQty: number;
};

export type ProjectionRepairResult = {
  /** False when the version stamp already matches and force was not set. */
  applied: boolean;
  checked: number;
  repaired: number;
  stamp: string;
  previousStamp: string | null;
  changes: ProjectionRepairChange[];
};

/** Snapshot of fold-derived fields on a stored projection row. */
export type StoredProjectionSnapshot = {
  qtyBase: number;
  watermarkCursor: string | null;
  lastAbsoluteCursor: string | null;
  lastVerifiedAt: string | null;
  unverifiedCookCount: number;
  isNegative: boolean;
  conflict: boolean;
};

/**
 * Stamp written to app_meta after a successful pass.
 * Re-runs when repair logic version or seed version changes.
 */
export function buildProjectionRepairStamp(
  seedVersion: string = SEED_VERSION,
  repairVersion: string = PROJECTION_REPAIR_VERSION,
): string {
  return `${repairVersion}|${seedVersion}`;
}

/**
 * True when the stored cache disagrees with foldLedger on any fold-owned field.
 */
export function projectionDiffersFromFold(
  stored: StoredProjectionSnapshot | null,
  fold: FoldResult,
): boolean {
  if (stored == null) {
    // Missing projection with ledger activity (or non-zero fold) needs create.
    return fold.lastTxnCursor != null || fold.qtyBase !== 0 || fold.isNegative;
  }
  return (
    stored.qtyBase !== fold.qtyBase ||
    stored.isNegative !== fold.isNegative ||
    stored.watermarkCursor !== fold.lastTxnCursor ||
    stored.lastAbsoluteCursor !== fold.lastAbsoluteCursor ||
    stored.lastVerifiedAt !== fold.provenance.lastVerifiedAt ||
    stored.unverifiedCookCount !== fold.provenance.unverifiedCookCount ||
    stored.conflict !== fold.conflict
  );
}

export type ProjectionRepairPort = {
  listProjections(
    householdId: string,
  ): Promise<
    readonly (StoredProjectionSnapshot & {
      ingredientId: string;
      formId: string;
    })[]
  >;
  /** All ledger rows for the household (loaded once — not per item). */
  listAllTxns(householdId: string): Promise<readonly PantryTxn[]>;
  /**
   * Rewrite one projection from foldLedger. Implementations should call the
   * same helper used by appendTxn (DomainRepository.recomputeProjection).
   */
  recomputeProjection(
    householdId: string,
    ingredientId: string,
    formId: string,
  ): Promise<PantryItemRow>;
};

/**
 * Full verify/repair pass. Idempotent: a second run repairs nothing when the
 * store is already aligned with fold(log).
 */
export async function verifyAndRepairProjections(
  port: ProjectionRepairPort,
  options: { householdId?: string } = {},
): Promise<ProjectionRepairResult> {
  const householdId = options.householdId ?? DEFAULT_HOUSEHOLD_ID;
  const stamp = buildProjectionRepairStamp();

  const projections = await port.listProjections(householdId);
  const allTxns = await port.listAllTxns(householdId);

  const txnsByIngredient = new Map<string, PantryTxn[]>();
  for (const txn of allTxns) {
    const list = txnsByIngredient.get(txn.ingredientId);
    if (list) list.push(txn);
    else txnsByIngredient.set(txn.ingredientId, [txn]);
  }

  const keys = new Map<string, { ingredientId: string; formId: string }>();
  for (const p of projections) {
    keys.set(`${p.ingredientId}\0${p.formId}`, {
      ingredientId: p.ingredientId,
      formId: p.formId,
    });
  }
  for (const txn of allTxns) {
    keys.set(`${txn.ingredientId}\0${txn.formId}`, {
      ingredientId: txn.ingredientId,
      formId: txn.formId,
    });
  }

  const byKey = new Map(
    projections.map((p) => [`${p.ingredientId}\0${p.formId}`, p] as const),
  );

  let checked = 0;
  let repaired = 0;
  const changes: ProjectionRepairChange[] = [];

  for (const { ingredientId, formId } of keys.values()) {
    checked += 1;
    const log = txnsByIngredient.get(ingredientId) ?? [];
    // Match DomainRepository.recomputeProjection: fold all forms for the
    // ingredient (shared ledger), write the row for this formId.
    const fold = foldLedger(log);
    const stored = byKey.get(`${ingredientId}\0${formId}`) ?? null;

    if (!projectionDiffersFromFold(stored, fold)) {
      continue;
    }

    const beforeQty = stored?.qtyBase ?? null;
    const item = await port.recomputeProjection(
      householdId,
      ingredientId,
      formId,
    );
    repaired += 1;
    changes.push({
      ingredientId,
      formId,
      beforeQty,
      afterQty: item.qtyBase,
    });
  }

  return {
    applied: true,
    checked,
    repaired,
    stamp,
    previousStamp: null,
    changes,
  };
}

/**
 * Format the Diagnostics status line.
 * Example: "Checked 42 items, repaired 1."
 */
export function formatProjectionRepairSummary(
  result: Pick<ProjectionRepairResult, 'checked' | 'repaired'>,
): string {
  const itemWord = result.checked === 1 ? 'item' : 'items';
  return `Checked ${result.checked} ${itemWord}, repaired ${result.repaired}.`;
}

// ── Drizzle / DomainRepository adapter ────────────────────────────────────

function mapTxnRow(row: typeof pantryTxns.$inferSelect): PantryTxn {
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

async function getMeta(db: AppDatabase, key: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(appMeta)
    .where(eq(appMeta.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

async function setMeta(
  db: AppDatabase,
  key: string,
  value: string,
): Promise<void> {
  await db
    .insert(appMeta)
    .values({ key, value })
    .onConflictDoUpdate({
      target: appMeta.key,
      set: { value },
    });
}

export function createDrizzleRepairPort(
  db: AppDatabase,
  recomputeProjection: (
    householdId: string,
    ingredientId: string,
    formId: string,
  ) => Promise<PantryItemRow>,
): ProjectionRepairPort {
  return {
    async listProjections(householdId) {
      const rows = await db
        .select()
        .from(pantryItems)
        .where(eq(pantryItems.householdId, householdId));
      return rows.map((row) => ({
        ingredientId: row.ingredientId,
        formId: row.formId,
        qtyBase: row.qtyBase,
        watermarkCursor: row.watermarkCursor ?? null,
        lastAbsoluteCursor: row.lastAbsoluteCursor ?? null,
        lastVerifiedAt: row.lastVerifiedAt ?? null,
        unverifiedCookCount: row.unverifiedCookCount,
        isNegative: Boolean(row.isNegative),
        conflict: Boolean(row.conflict),
      }));
    },
    async listAllTxns(householdId) {
      const rows = await db
        .select()
        .from(pantryTxns)
        .where(eq(pantryTxns.householdId, householdId));
      return rows.map(mapTxnRow);
    },
    recomputeProjection,
  };
}

/**
 * Startup gate: run the pass once per (PROJECTION_REPAIR_VERSION, SEED_VERSION).
 * Manual Diagnostics always calls verifyAndRepairProjections with force.
 */
export async function maybeRepairProjectionsOnStartup(
  db: AppDatabase,
  recomputeProjection: (
    householdId: string,
    ingredientId: string,
    formId: string,
  ) => Promise<PantryItemRow>,
  options: { householdId?: string; force?: boolean } = {},
): Promise<ProjectionRepairResult> {
  const householdId = options.householdId ?? DEFAULT_HOUSEHOLD_ID;
  const stamp = buildProjectionRepairStamp();
  const previousStamp = await getMeta(db, META_PROJECTION_REPAIR_STAMP);

  if (previousStamp === stamp && !options.force) {
    return {
      applied: false,
      checked: 0,
      repaired: 0,
      stamp,
      previousStamp,
      changes: [],
    };
  }

  const port = createDrizzleRepairPort(db, recomputeProjection);
  const result = await verifyAndRepairProjections(port, { householdId });
  await setMeta(db, META_PROJECTION_REPAIR_STAMP, stamp);

  return {
    ...result,
    previousStamp,
  };
}

/**
 * Meta-backed gate for in-memory / IndexedDB drivers (same stamp semantics).
 */
export async function maybeRepairProjectionsWithMeta(
  port: ProjectionRepairPort,
  meta: {
    getMeta: (key: string) => string | null;
    setMeta: (key: string, value: string) => void;
  },
  options: { householdId?: string; force?: boolean } = {},
): Promise<ProjectionRepairResult> {
  const householdId = options.householdId ?? DEFAULT_HOUSEHOLD_ID;
  const stamp = buildProjectionRepairStamp();
  const previousStamp = meta.getMeta(META_PROJECTION_REPAIR_STAMP);

  if (previousStamp === stamp && !options.force) {
    return {
      applied: false,
      checked: 0,
      repaired: 0,
      stamp,
      previousStamp,
      changes: [],
    };
  }

  const result = await verifyAndRepairProjections(port, { householdId });
  meta.setMeta(META_PROJECTION_REPAIR_STAMP, stamp);

  return {
    ...result,
    previousStamp,
  };
}
