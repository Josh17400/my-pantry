/**
 * Browser DEV driver tests (memory-only; no IndexedDB in vitest node).
 * Projection must match foldLedger from @larder/core.
 */

import { foldLedger, type PantryTxn } from '@larder/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_DEVICE_ID,
  DEFAULT_HOUSEHOLD_ID,
  DEFAULT_USER_ID,
} from '../constants';
import { DevPantryRepository } from './dev';

describe('DevPantryRepository (M1-L)', () => {
  let repo: DevPantryRepository;

  beforeEach(async () => {
    repo = new DevPantryRepository({ memoryOnly: true });
  });

  afterEach(async () => {
    await repo.close();
  });

  describe('initialize + seed + fixtures', () => {
    it('initialize seeds catalog, locations, and fixtures', async () => {
      const result = await repo.initialize({ loadFixtures: true });
      expect(result.seed.seedVersion).toBeTruthy();
      expect(result.seed.skippedCatalog).toBe(false);
      expect(result.fixtures?.applied).toBe(true);
      expect(result.fixtures?.pantryItems).toBeGreaterThan(10);
      expect(result.fixtures?.recipes).toBeGreaterThanOrEqual(4);

      const domain = repo.domain();
      const items = await domain.listPantryItems();
      expect(items.length).toBeGreaterThan(10);
      expect(items.some((i) => i.ingredientName.toLowerCase().includes('milk'))).toBe(
        true,
      );

      const recipes = await domain.listRecipes(DEFAULT_HOUSEHOLD_ID);
      // 50 catalogue + 4 fixtures
      expect(recipes.length).toBeGreaterThanOrEqual(54);
      expect(recipes.filter((r) => r.source === 'catalog').length).toBe(50);
      expect(result.seed.recipesUpserted).toBeGreaterThanOrEqual(50);

      const locations = await domain.listLocations();
      expect(locations.length).toBe(7);
    });

    it('second initialize skips catalog and fixtures (idempotent)', async () => {
      await repo.initialize({ loadFixtures: true });
      const second = await repo.initialize({ loadFixtures: true });
      expect(second.seed.skippedCatalog).toBe(true);
      expect(second.seed.skippedRecipes).toBe(true);
      expect(second.fixtures?.skipped).toBe(true);

      const items = await repo.domain().listPantryItems();
      expect(items.length).toBeGreaterThan(10);

      const recipes = await repo.domain().listRecipes(DEFAULT_HOUSEHOLD_ID);
      expect(recipes.filter((r) => r.source === 'catalog')).toHaveLength(50);
    });
  });

  describe('ledger projection parity with foldLedger', () => {
    beforeEach(async () => {
      await repo.open();
      await repo.seed();
    });

    it('appendTxn updates projection to exactly foldLedger result', async () => {
      const domain = repo.domain();
      const householdId = DEFAULT_HOUSEHOLD_ID;
      const ingredientId = 'flour-ap';
      const formId = 'flour-ap-bulk';

      const t1 = await domain.appendTxn({
        clientTxnId: 't1-purchase',
        householdId,
        ingredientId,
        formId,
        kind: 'relative',
        reason: 'purchase',
        deltaBase: 1000,
        occurredAt: '2026-01-01T10:00:00.000Z',
        acceptedAt: '2026-01-01T10:00:01.000Z',
        deviceId: DEFAULT_DEVICE_ID,
        userId: DEFAULT_USER_ID,
      });
      expect(t1.inserted).toBe(true);
      expect(t1.foldQtyBase).toBe(1000);

      const t2 = await domain.appendTxn({
        clientTxnId: 't2-cook',
        householdId,
        ingredientId,
        formId,
        kind: 'relative',
        reason: 'cook',
        deltaBase: -250,
        occurredAt: '2026-01-02T18:00:00.000Z',
        deviceId: DEFAULT_DEVICE_ID,
        userId: DEFAULT_USER_ID,
      });
      expect(t2.foldQtyBase).toBe(750);

      const t3 = await domain.appendTxn({
        clientTxnId: 't3-recount',
        householdId,
        ingredientId,
        formId,
        kind: 'absolute',
        reason: 'recount',
        targetBase: 500,
        occurredAt: '2026-01-03T12:00:00.000Z',
        deviceId: DEFAULT_DEVICE_ID,
        userId: DEFAULT_USER_ID,
      });
      expect(t3.foldQtyBase).toBe(500);

      const log = await domain.listTxnsForIngredient(ingredientId, householdId);
      const fold = foldLedger(log);
      expect(t3.item.qtyBase).toBe(fold.qtyBase);
      expect(t3.item.lastVerifiedAt).toBe(fold.provenance.lastVerifiedAt);
      expect(t3.item.unverifiedCookCount).toBe(
        fold.provenance.unverifiedCookCount,
      );
      expect(t3.item.watermarkCursor).toBe(fold.lastTxnCursor);

      const item = await domain.getPantryItem(ingredientId, formId, householdId);
      expect(item?.qtyBase).toBe(fold.qtyBase);
    });

    it('duplicate clientTxnId is idempotent', async () => {
      const domain = repo.domain();
      const base = {
        clientTxnId: 'dup-1',
        householdId: DEFAULT_HOUSEHOLD_ID,
        ingredientId: 'egg',
        formId: 'egg-whole',
        kind: 'relative' as const,
        reason: 'purchase' as const,
        deltaBase: 12,
        occurredAt: '2026-01-01T10:00:00.000Z',
        deviceId: DEFAULT_DEVICE_ID,
        userId: DEFAULT_USER_ID,
      };
      const first = await domain.appendTxn(base);
      const second = await domain.appendTxn(base);
      expect(first.inserted).toBe(true);
      expect(second.inserted).toBe(false);
      expect(second.foldQtyBase).toBe(first.foldQtyBase);
    });

    it('cook relative decreases qty via foldLedger', async () => {
      const domain = repo.domain();
      const householdId = DEFAULT_HOUSEHOLD_ID;
      const ingredientId = 'pasta-spaghetti';
      const formId = 'pasta-spaghetti-bulk';

      await domain.appendTxn({
        clientTxnId: 'pasta-seed',
        householdId,
        ingredientId,
        formId,
        kind: 'absolute',
        reason: 'recount',
        targetBase: 450,
        occurredAt: '2026-01-01T10:00:00.000Z',
        deviceId: DEFAULT_DEVICE_ID,
        userId: DEFAULT_USER_ID,
      });

      const before = await domain.getPantryItem(ingredientId, formId, householdId);
      expect(before?.qtyBase).toBe(450);

      const cook = await domain.appendTxn({
        clientTxnId: 'pasta-cook',
        householdId,
        ingredientId,
        formId,
        kind: 'relative',
        reason: 'cook',
        deltaBase: -340,
        occurredAt: '2026-01-02T18:00:00.000Z',
        deviceId: DEFAULT_DEVICE_ID,
        userId: DEFAULT_USER_ID,
      });
      expect(cook.foldQtyBase).toBe(110);

      const log = await domain.listTxnsForIngredient(ingredientId, householdId);
      expect(foldLedger(log).qtyBase).toBe(110);
    });
  });

  describe('recipes + grocery', () => {
    beforeEach(async () => {
      await repo.initialize({ loadFixtures: true });
    });

    it('recipe round-trip', async () => {
      const domain = repo.domain();
      const created = await domain.createRecipe({
        householdId: DEFAULT_HOUSEHOLD_ID,
        title: 'Test Toast',
        servings: 1,
        ingredients: [
          {
            ingredientId: 'bread-sandwich',
            formId: 'bread-sandwich-slice',
            rawText: '2 slices bread',
            qty: 2,
            unit: 'each',
          },
        ],
        steps: [{ text: 'Toast it.' }],
      });
      expect(created.id).toBeTruthy();
      const got = await domain.getRecipe(created.id);
      expect(got?.title).toBe('Test Toast');
      expect(got?.ingredients).toHaveLength(1);
      expect(got?.steps).toHaveLength(1);
    });

    it('grocery list create + update + checkOff', async () => {
      const domain = repo.domain();
      const list = await domain.createGroceryList({
        householdId: DEFAULT_HOUSEHOLD_ID,
        items: [
          {
            name: 'Milk',
            category: 'dairy',
            displayQty: '1 L',
            ingredientId: 'milk',
            formId: 'milk-liquid',
          },
        ],
      });
      expect(list.items).toHaveLength(1);
      const updated = await domain.updateGroceryListItems(list.id, [
        {
          id: list.items[0]!.id,
          name: 'Milk',
          category: 'dairy',
          displayQty: '2 L',
          checked: false,
        },
        {
          name: 'Eggs',
          category: 'dairy',
          displayQty: '12',
          checked: false,
        },
      ]);
      expect(updated?.items).toHaveLength(2);
      const itemId = updated!.items[0]!.id;
      const checked = await domain.checkOffGroceryItem(itemId, true);
      expect(checked?.checked).toBe(true);
    });
  });

  describe('health probe', () => {
    it('insertBatch + verify + aggregate', async () => {
      await repo.open();
      const batch = await repo.insertBatch(50);
      expect(batch.inserted).toBe(50);
      const verified = await repo.verify(50, batch.checksum);
      expect(verified.ok).toBe(true);
      const agg = await repo.aggregateIndexed();
      expect(agg.count).toBe(50);
      await repo.cleanup();
      const after = await repo.verify(0, 0);
      expect(after.count).toBe(0);
    });
  });

  describe('reset', () => {
    it('clears product data', async () => {
      await repo.initialize({ loadFixtures: true });
      expect((await repo.domain().listPantryItems()).length).toBeGreaterThan(0);
      await repo.reset();
      // After reset, domain is open but empty until re-seed
      expect(await repo.domain().listPantryItems()).toEqual([]);
      await repo.initialize({ loadFixtures: true });
      expect((await repo.domain().listPantryItems()).length).toBeGreaterThan(0);
    });
  });
});

// Silence unused import if tree-shaken oddly
void (0 as unknown as PantryTxn);
