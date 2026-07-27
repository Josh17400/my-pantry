/**
 * Projection self-heal: corrupt qtyBase, repair from foldLedger, grocery path.
 */

import { evaluateStock, foldLedger, SEED_VERSION } from '@larder/core';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { rebuildLiveGroceryList } from '../features/grocery/rebuild-live-list';
import { resolveStockUi } from '../features/pantry/lib/stock-display';
import {
  DEFAULT_DEVICE_ID,
  DEFAULT_HOUSEHOLD_ID,
  DEFAULT_USER_ID,
  META_PROJECTION_REPAIR_STAMP,
  PROJECTION_REPAIR_VERSION,
} from './constants';
import { NodeSqliteRepository } from './drivers/node-sqlite';
import {
  buildProjectionRepairStamp,
  formatProjectionRepairSummary,
  projectionDiffersFromFold,
} from './projection-repair';
import { appMeta, pantryItems } from './schema';

describe('projectionDiffersFromFold', () => {
  it('detects qtyBase drift', () => {
    const fold = foldLedger([
      {
        id: 't1',
        clientTxnId: 'c1',
        householdId: 'h',
        ingredientId: 'ing',
        formId: 'form',
        kind: 'absolute',
        reason: 'recount',
        targetBase: 0,
        occurredAt: '2026-01-01T00:00:00.000Z',
        deviceId: 'd',
        userId: 'u',
      },
    ]);
    expect(
      projectionDiffersFromFold(
        {
          qtyBase: 900,
          watermarkCursor: fold.lastTxnCursor,
          lastAbsoluteCursor: fold.lastAbsoluteCursor,
          lastVerifiedAt: fold.provenance.lastVerifiedAt,
          unverifiedCookCount: fold.provenance.unverifiedCookCount,
          isNegative: false,
          conflict: false,
        },
        fold,
      ),
    ).toBe(true);
    expect(
      projectionDiffersFromFold(
        {
          qtyBase: 0,
          watermarkCursor: fold.lastTxnCursor,
          lastAbsoluteCursor: fold.lastAbsoluteCursor,
          lastVerifiedAt: fold.provenance.lastVerifiedAt,
          unverifiedCookCount: fold.provenance.unverifiedCookCount,
          isNegative: false,
          conflict: false,
        },
        fold,
      ),
    ).toBe(false);
  });
});

describe('formatProjectionRepairSummary', () => {
  it('matches Diagnostics copy', () => {
    expect(formatProjectionRepairSummary({ checked: 42, repaired: 1 })).toBe(
      'Checked 42 items, repaired 1.',
    );
    expect(formatProjectionRepairSummary({ checked: 1, repaired: 0 })).toBe(
      'Checked 1 item, repaired 0.',
    );
  });
});

describe('buildProjectionRepairStamp', () => {
  it('combines repair version and seed version', () => {
    expect(buildProjectionRepairStamp()).toBe(
      `${PROJECTION_REPAIR_VERSION}|${SEED_VERSION}`,
    );
  });
});

describe('verifyAndRepairProjections (domain)', () => {
  let repo: NodeSqliteRepository;

  beforeEach(async () => {
    repo = new NodeSqliteRepository({ path: ':memory:' });
    await repo.initialize({ loadFixtures: false });
  });

  afterEach(async () => {
    await repo.close();
  });

  async function seedChickenWithLedger(qtyBase: number) {
    const domain = repo.domain();
    await domain.appendTxn({
      clientTxnId: `seed-chicken-${qtyBase}`,
      householdId: DEFAULT_HOUSEHOLD_ID,
      ingredientId: 'chicken-breast',
      formId: 'chicken-breast-bulk',
      kind: 'absolute',
      reason: 'recount',
      targetBase: qtyBase,
      occurredAt: '2026-06-01T12:00:00.000Z',
      deviceId: DEFAULT_DEVICE_ID,
      userId: DEFAULT_USER_ID,
    });
  }

  /** Owner situation: ledger says 0, projection still shows Plenty qty. */
  async function corruptChickenProjection(wrongQty: number) {
    const db = repo.drizzle;
    await db
      .update(pantryItems)
      .set({
        qtyBase: wrongQty,
        isNegative: false,
      })
      .where(
        and(
          eq(pantryItems.householdId, DEFAULT_HOUSEHOLD_ID),
          eq(pantryItems.ingredientId, 'chicken-breast'),
          eq(pantryItems.formId, 'chicken-breast-bulk'),
        ),
      );
  }

  it('restores a corrupted projection to fold(log) — owner Plenty-at-0 case', async () => {
    const domain = repo.domain();
    // True stock empty (absolute 0 after having had stock).
    await seedChickenWithLedger(900);
    await domain.appendTxn({
      clientTxnId: 'empty-chicken',
      householdId: DEFAULT_HOUSEHOLD_ID,
      ingredientId: 'chicken-breast',
      formId: 'chicken-breast-bulk',
      kind: 'absolute',
      reason: 'recount',
      targetBase: 0,
      occurredAt: '2026-06-02T12:00:00.000Z',
      deviceId: DEFAULT_DEVICE_ID,
      userId: DEFAULT_USER_ID,
    });

    const log = await domain.listTxnsForIngredient(
      'chicken-breast',
      DEFAULT_HOUSEHOLD_ID,
    );
    expect(foldLedger(log).qtyBase).toBe(0);

    // Stale cache: still Plenty-level quantity.
    await corruptChickenProjection(900);
    const stale = await domain.getPantryItem(
      'chicken-breast',
      'chicken-breast-bulk',
      DEFAULT_HOUSEHOLD_ID,
    );
    expect(stale?.qtyBase).toBe(900);
    expect(
      resolveStockUi({
        qtyBase: stale!.qtyBase,
        parLevelBase: stale!.parLevelBase,
        lowThresholdPct: stale!.lowThresholdPct,
      }).label,
    ).toBe('Plenty');

    const result = await domain.verifyAndRepairProjections({ force: true });
    expect(result.applied).toBe(true);
    expect(result.repaired).toBeGreaterThanOrEqual(1);
    expect(
      result.changes.some(
        (c) =>
          c.ingredientId === 'chicken-breast' &&
          c.beforeQty === 900 &&
          c.afterQty === 0,
      ),
    ).toBe(true);

    const fixed = await domain.getPantryItem(
      'chicken-breast',
      'chicken-breast-bulk',
      DEFAULT_HOUSEHOLD_ID,
    );
    expect(fixed?.qtyBase).toBe(foldLedger(log).qtyBase);
    expect(fixed?.qtyBase).toBe(0);
    expect(evaluateStock(fixed!.qtyBase, fixed!.parLevelBase).status).toBe(
      'out',
    );
    expect(
      resolveStockUi({
        qtyBase: fixed!.qtyBase,
        parLevelBase: fixed!.parLevelBase,
        lowThresholdPct: fixed!.lowThresholdPct,
      }).label,
    ).toBe('Out');
  });

  it('repaired Out item reaches the grocery list as stock-out', async () => {
    const domain = repo.domain();
    await seedChickenWithLedger(900);
    await domain.appendTxn({
      clientTxnId: 'empty-for-grocery',
      householdId: DEFAULT_HOUSEHOLD_ID,
      ingredientId: 'chicken-breast',
      formId: 'chicken-breast-bulk',
      kind: 'absolute',
      reason: 'recount',
      targetBase: 0,
      occurredAt: '2026-06-03T12:00:00.000Z',
      deviceId: DEFAULT_DEVICE_ID,
      userId: DEFAULT_USER_ID,
    });
    await corruptChickenProjection(1800);

    // Before repair: wrong qty, not out.
    const beforeItem = await domain.getPantryItem(
      'chicken-breast',
      'chicken-breast-bulk',
      DEFAULT_HOUSEHOLD_ID,
    );
    expect(beforeItem?.qtyBase).toBe(1800);

    await domain.verifyAndRepairProjections({ force: true });

    const after = await rebuildLiveGroceryList({
      domain,
      householdId: DEFAULT_HOUSEHOLD_ID,
    });
    const chicken = after.items.find(
      (i) => i.ingredientId === 'chicken-breast',
    );
    expect(chicken).toBeTruthy();
    expect(chicken!.sources).toContain('stock-out');
    expect(after.stockOutIngredientIds).toContain('chicken-breast');
  });

  it('is idempotent — second run repairs nothing', async () => {
    const domain = repo.domain();
    await seedChickenWithLedger(500);
    await corruptChickenProjection(999);

    const first = await domain.verifyAndRepairProjections({ force: true });
    expect(first.repaired).toBeGreaterThanOrEqual(1);

    const second = await domain.verifyAndRepairProjections({ force: true });
    expect(second.applied).toBe(true);
    expect(second.repaired).toBe(0);
    expect(second.checked).toBe(first.checked);
  });

  it('respects absolute recount checkpoint (does not resurrect pre-checkpoint history)', async () => {
    const domain = repo.domain();
    // Junk history that would sum to a large number if not checkpointed.
    await domain.appendTxn({
      clientTxnId: 'junk-purchase',
      householdId: DEFAULT_HOUSEHOLD_ID,
      ingredientId: 'flour-ap',
      formId: 'flour-ap-bulk',
      kind: 'relative',
      reason: 'purchase',
      deltaBase: 10_000,
      occurredAt: '2026-01-01T00:00:00.000Z',
      deviceId: DEFAULT_DEVICE_ID,
      userId: DEFAULT_USER_ID,
    });
    await domain.appendTxn({
      clientTxnId: 'checkpoint-recount',
      householdId: DEFAULT_HOUSEHOLD_ID,
      ingredientId: 'flour-ap',
      formId: 'flour-ap-bulk',
      kind: 'absolute',
      reason: 'recount',
      targetBase: 200,
      occurredAt: '2026-02-01T00:00:00.000Z',
      deviceId: DEFAULT_DEVICE_ID,
      userId: DEFAULT_USER_ID,
    });
    await domain.appendTxn({
      clientTxnId: 'after-cook',
      householdId: DEFAULT_HOUSEHOLD_ID,
      ingredientId: 'flour-ap',
      formId: 'flour-ap-bulk',
      kind: 'relative',
      reason: 'cook',
      deltaBase: -50,
      occurredAt: '2026-02-02T00:00:00.000Z',
      deviceId: DEFAULT_DEVICE_ID,
      userId: DEFAULT_USER_ID,
    });

    const log = await domain.listTxnsForIngredient(
      'flour-ap',
      DEFAULT_HOUSEHOLD_ID,
    );
    const truth = foldLedger(log);
    expect(truth.qtyBase).toBe(150);
    expect(truth.txnsSkipped).toBeGreaterThan(0);

    // Corrupt toward the pre-checkpoint sum.
    await repo.drizzle
      .update(pantryItems)
      .set({ qtyBase: 10_000 })
      .where(
        and(
          eq(pantryItems.householdId, DEFAULT_HOUSEHOLD_ID),
          eq(pantryItems.ingredientId, 'flour-ap'),
          eq(pantryItems.formId, 'flour-ap-bulk'),
        ),
      );

    await domain.verifyAndRepairProjections({ force: true });
    const fixed = await domain.getPantryItem(
      'flour-ap',
      'flour-ap-bulk',
      DEFAULT_HOUSEHOLD_ID,
    );
    expect(fixed?.qtyBase).toBe(150);
    expect(fixed?.qtyBase).not.toBe(9950);
    expect(fixed?.qtyBase).not.toBe(10_000);
  });

  it('version stamp prevents re-running on every launch', async () => {
    const domain = repo.domain();
    await seedChickenWithLedger(100);
    await corruptChickenProjection(50);

    // First startup-style call (no force): runs and stamps.
    const first = await domain.verifyAndRepairProjections({ force: false });
    // After initialize(), stamp may already be set with repaired:0. Force a
    // clear stamp to simulate pre-heal install, then re-corrupt.
    await repo.drizzle
      .delete(appMeta)
      .where(eq(appMeta.key, META_PROJECTION_REPAIR_STAMP));
    await corruptChickenProjection(50);

    const afterClear = await domain.verifyAndRepairProjections({
      force: false,
    });
    expect(afterClear.applied).toBe(true);
    expect(afterClear.repaired).toBeGreaterThanOrEqual(1);
    expect(afterClear.stamp).toBe(buildProjectionRepairStamp());

    const metaRows = await repo.drizzle
      .select()
      .from(appMeta)
      .where(eq(appMeta.key, META_PROJECTION_REPAIR_STAMP))
      .limit(1);
    expect(metaRows[0]?.value).toBe(buildProjectionRepairStamp());

    // Second launch: stamp matches → skip entirely.
    const second = await domain.verifyAndRepairProjections({ force: false });
    expect(second.applied).toBe(false);
    expect(second.checked).toBe(0);
    expect(second.repaired).toBe(0);
    expect(second.previousStamp).toBe(buildProjectionRepairStamp());

    // Silence unused first (initialize already stamped).
    expect(first.stamp).toBe(buildProjectionRepairStamp());
  });
});
