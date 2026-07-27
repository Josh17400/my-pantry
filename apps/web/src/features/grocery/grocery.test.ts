import { evaluateStock, formatQuantity } from '@larder/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_DEVICE_ID,
  DEFAULT_HOUSEHOLD_ID,
  DEFAULT_USER_ID,
} from '../../db/constants';
import { NodeSqliteRepository } from '../../db/drivers/node-sqlite';
import { usePantryStore } from '../../state/pantry-store';
import { setActiveRepository } from '../../state/repo-context';
import { resolveStockUi } from '../pantry/lib/stock-display';
import { aisleTitle } from './aisle-title';
import {
  intentSourcesFromListItems,
  isRecipeSourcedItem,
  stockSourcesFromPantry,
} from './build-sources';
import { buildDemoGroceryList, demoDisplayProof } from './demo-data';
import { coreListToItemInputs, groupItemsByAisle, isUnmergedItem } from './map-list';
import {
  applyCheckedToInputs,
  lineMatchKey,
  MAX_REBUILDS_PER_STOCK_CHANGE,
  mergeCheckedMap,
} from './merge-list-state';
import {
  manualAddSource,
  rebuildLiveGroceryList,
} from './rebuild-live-list';
import { sourceLabelsFor } from './source-labels';

/** Demo-profile list size is ~9; flood regression was 91. Fail loud if re-flooded. */
const SANE_LIST_MAX = 35;

describe('grocery feature — core consumption', () => {
  it('builds a demo list via core buildList with aisle groups and sources', () => {
    const { list, shoppingTripId } = buildDemoGroceryList(
      '2026-07-26T12:00:00.000Z',
    );

    expect(shoppingTripId).toBeTruthy();
    expect(list.shoppingTripId).toBe(shoppingTripId);
    expect(list.lines.length).toBeGreaterThan(3);
    expect(list.byAisle.length).toBeGreaterThan(1);

    // Every line must declare at least one source kind
    for (const line of list.lines) {
      expect(line.sources.length).toBeGreaterThan(0);
      expect(line.name.length).toBeGreaterThan(0);
    }

    // Ground beef shortfall should display in purchase units (lb), not raw 907 g
    const beef = list.lines.find((l) => l.ingredientId === 'ground-beef');
    expect(beef).toBeTruthy();
    expect(beef!.displayQty.toLowerCase()).toMatch(/lb|oz|g|kg/);
    expect(beef!.sources).toContain('stock-out');
    // recipe shortfall may merge into same line
    expect(
      beef!.sources.includes('recipe-shortfall') ||
        list.lines.some(
          (l) =>
            l.ingredientId === 'ground-beef' &&
            l.sources.includes('recipe-shortfall'),
        ),
    ).toBe(true);
  });

  it('demoDisplayProof uses formatQuantity purchase units', () => {
    const q = demoDisplayProof();
    expect(q).toBe(formatQuantity(907, 'mass', { locale: 'us' }));
    expect(q.toLowerCase()).not.toBe('907 g');
  });

  it('maps core lines to aisle-grouped rows and flags unmerged notes', () => {
    const { list } = buildDemoGroceryList('2026-07-26T12:00:00.000Z');
    const inputs = coreListToItemInputs(list);
    expect(inputs.length).toBe(list.lines.length);

    const rows = inputs.map((input, i) => ({
      id: input.id ?? `i${i}`,
      listId: 'l',
      shoppingTripId: list.shoppingTripId,
      ingredientId: input.ingredientId ?? null,
      formId: input.formId ?? null,
      name: input.name,
      category: input.category,
      qtyBase: input.qtyBase ?? null,
      dim: input.dim ?? null,
      displayQty: input.displayQty,
      sources: [...(input.sources ?? [])],
      recipeIds: [...(input.recipeIds ?? [])],
      checked: false,
      sortOrder: i,
      notes: input.notes ?? null,
    }));

    const aisles = groupItemsByAisle(rows);
    expect(aisles.length).toBeGreaterThan(1);
    const total = aisles.reduce((n, a) => n + a.items.length, 0);
    expect(total).toBe(rows.length);

    // No unmerged in demo fixtures typically — property still holds
    for (const r of rows) {
      if (r.notes?.startsWith('⚠')) {
        expect(isUnmergedItem(r)).toBe(true);
      }
    }
  });

  it('labels source kinds for chips (low uses text tone, not fill)', () => {
    const labels = sourceLabelsFor(['stock-low', 'recipe-shortfall', 'manual']);
    expect(labels.map((l) => l.label)).toEqual([
      'Getting low',
      'Recipe',
      'You added',
    ]);
    expect(labels.find((l) => l.kind === 'stock-low')?.tone).toBe('low');
  });

  it('pretty-prints aisle titles from seed slugs', () => {
    expect(aisleTitle('meat-seafood')).toBe('Meat & Seafood');
    expect(aisleTitle('dairy')).toBe('Dairy');
    expect(aisleTitle('baby-household')).toBe('Baby & Household');
  });
});

describe('merge-list-state — preserve user intent across rebuilds', () => {
  it('merges check-off from memory and persisted rows by match key', () => {
    const memory = [
      {
        ingredientId: 'milk',
        formId: 'milk-gallon',
        name: 'Milk',
        checked: true,
      },
      {
        ingredientId: 'eggs',
        formId: 'eggs-dozen',
        name: 'Eggs',
        checked: false,
      },
    ];
    const persisted = [
      {
        ingredientId: 'eggs',
        formId: 'eggs-dozen',
        name: 'Eggs',
        checked: true,
      },
      { ingredientId: null, formId: null, name: 'Paper towels', checked: true },
    ];
    const map = mergeCheckedMap(memory, persisted);
    expect(map.get(lineMatchKey(memory[0]!))).toBe(true);
    expect(map.get(lineMatchKey(memory[1]!))).toBe(true);
    expect(map.get('Paper towels|')).toBe(true);
  });

  it('applies checked map without dropping other input fields', () => {
    const inputs = [
      {
        id: 'a',
        name: 'Milk',
        ingredientId: 'milk',
        formId: 'milk-gallon',
        category: 'dairy',
        displayQty: '1 gal',
        sources: ['stock-low' as const],
        checked: false,
      },
      {
        id: 'b',
        name: 'Tape',
        ingredientId: undefined,
        formId: undefined,
        category: 'other',
        displayQty: '',
        sources: ['manual' as const],
        checked: false,
      },
    ];
    const checked = new Map([
      ['milk|milk-gallon', true],
      ['Tape|', true],
    ]);
    const out = applyCheckedToInputs(inputs, checked);
    expect(out[0]?.checked).toBe(true);
    expect(out[0]?.displayQty).toBe('1 gal');
    expect(out[1]?.checked).toBe(true);
    expect(out[1]?.sources).toEqual(['manual']);
  });
});

describe('live grocery rebuild — stock changes (reported sequence)', () => {
  let repo: NodeSqliteRepository;

  beforeEach(async () => {
    repo = new NodeSqliteRepository({ path: ':memory:' });
    await repo.initialize({ loadFixtures: false });
    setActiveRepository(repo);
    usePantryStore.setState({
      items: [],
      selected: null,
      loading: false,
      error: null,
      householdId: DEFAULT_HOUSEHOLD_ID,
      pantryRevision: 0,
    });
  });

  afterEach(async () => {
    setActiveRepository(null);
    await repo.close();
  });

  async function seedChicken(qtyBase: number) {
    const domain = repo.domain();
    await domain.upsertPantryItem({
      householdId: DEFAULT_HOUSEHOLD_ID,
      ingredientId: 'chicken-breast',
      formId: 'chicken-breast-bulk',
      locationId: 'loc-freezer',
      qtyBase,
      dim: 'mass',
      parLevelBase: 900,
      lowThresholdPct: 0.25,
    });
    // Absolute ledger so projection stays consistent after later adjusts.
    await domain.appendTxn({
      clientTxnId: `seed-chicken-${qtyBase}-${Date.now()}`,
      householdId: DEFAULT_HOUSEHOLD_ID,
      ingredientId: 'chicken-breast',
      formId: 'chicken-breast-bulk',
      kind: 'absolute',
      reason: 'recount',
      targetBase: qtyBase,
      occurredAt: new Date().toISOString(),
      deviceId: DEFAULT_DEVICE_ID,
      userId: DEFAULT_USER_ID,
    });
  }

  it('after removing all stock, list includes the item as stock-out without manual Refresh semantics', async () => {
    const domain = repo.domain();
    await seedChicken(900);

    // Initial list while stock is ok — chicken should NOT be stock-out.
    const before = await rebuildLiveGroceryList({
      domain,
      householdId: DEFAULT_HOUSEHOLD_ID,
    });
    expect(
      before.items.some(
        (i) =>
          i.ingredientId === 'chicken-breast' &&
          i.sources.includes('stock-out'),
      ),
    ).toBe(false);

    // Owner path: open item → remove all (store appendTxn / recount to 0).
    const revBefore = usePantryStore.getState().pantryRevision;
    await usePantryStore.getState().appendTxn({
      clientTxnId: `zero-chicken-${Date.now()}`,
      householdId: DEFAULT_HOUSEHOLD_ID,
      ingredientId: 'chicken-breast',
      formId: 'chicken-breast-bulk',
      kind: 'absolute',
      reason: 'recount',
      targetBase: 0,
      occurredAt: new Date().toISOString(),
      deviceId: DEFAULT_DEVICE_ID,
      userId: DEFAULT_USER_ID,
    });
    const revAfter = usePantryStore.getState().pantryRevision;
    expect(revAfter).toBe(revBefore + 1);

    // Projection truth after write.
    const item = await domain.getPantryItem(
      'chicken-breast',
      'chicken-breast-bulk',
      DEFAULT_HOUSEHOLD_ID,
    );
    expect(item?.qtyBase).toBe(0);
    expect(evaluateStock(item!.qtyBase, item!.parLevelBase).status).toBe('out');
    expect(
      resolveStockUi({
        qtyBase: item!.qtyBase,
        parLevelBase: item!.parLevelBase,
        lowThresholdPct: item!.lowThresholdPct,
      }).label,
    ).toBe('Out');
    expect(
      resolveStockUi({
        qtyBase: item!.qtyBase,
        parLevelBase: item!.parLevelBase,
        lowThresholdPct: item!.lowThresholdPct,
      }).label,
    ).not.toBe('Plenty');

    // Navigate to Lists without pressing Refresh → rebuild from revision/mount.
    const after = await rebuildLiveGroceryList({
      domain,
      householdId: DEFAULT_HOUSEHOLD_ID,
      prevItems: before.items,
    });
    const chicken = after.items.find(
      (i) => i.ingredientId === 'chicken-breast',
    );
    expect(chicken).toBeTruthy();
    expect(chicken!.sources).toContain('stock-out');
    expect(after.stockOutIngredientIds).toContain('chicken-breast');
  });

  it('preserves check-off state and manual adds across a stock-driven rebuild', async () => {
    const domain = repo.domain();
    await seedChicken(0);

    // Stock-out chicken + a manual line on first build.
    const manual = manualAddSource({ name: 'Paper towels', category: 'other' });
    const first = await rebuildLiveGroceryList({
      domain,
      householdId: DEFAULT_HOUSEHOLD_ID,
      manualSources: [manual],
    });

    const chicken = first.items.find(
      (i) => i.ingredientId === 'chicken-breast',
    );
    expect(chicken).toBeTruthy();
    const towels = first.items.find((i) => i.name === 'Paper towels');
    expect(towels).toBeTruthy();

    // Tick three lines (chicken + towels + any third if present; if not, tick chicken twice is still one).
    const toCheck = first.items.slice(0, Math.min(3, first.items.length));
    const checkedPrev = first.items.map((row) => ({
      ...row,
      checked: toCheck.some((t) => t.id === row.id),
    }));

    // Persist checks as the screen would.
    for (const row of toCheck) {
      await domain.checkOffGroceryItem(row.id, true);
    }

    // Another stock write elsewhere, then rebuild (revision bump).
    await usePantryStore.getState().appendTxn({
      clientTxnId: `rezero-${Date.now()}`,
      householdId: DEFAULT_HOUSEHOLD_ID,
      ingredientId: 'chicken-breast',
      formId: 'chicken-breast-bulk',
      kind: 'absolute',
      reason: 'recount',
      targetBase: 0,
      occurredAt: new Date().toISOString(),
      deviceId: DEFAULT_DEVICE_ID,
      userId: DEFAULT_USER_ID,
    });

    const second = await rebuildLiveGroceryList({
      domain,
      householdId: DEFAULT_HOUSEHOLD_ID,
      manualSources: [manual],
      prevItems: checkedPrev,
    });

    // Manual still present.
    expect(second.items.some((i) => i.name === 'Paper towels')).toBe(true);

    // Checked state survived for every previously ticked match key.
    for (const prev of toCheck) {
      const key = lineMatchKey(prev);
      const match = second.items.find((i) => lineMatchKey(i) === key);
      expect(match, `missing line for ${key}`).toBeTruthy();
      expect(match!.checked).toBe(true);
    }
  });

  it('rebuild does not bump pantryRevision (no rebuild loop)', async () => {
    const domain = repo.domain();
    await seedChicken(0);

    await usePantryStore.getState().load();
    const rev = usePantryStore.getState().pantryRevision;
    expect(rev).toBeGreaterThan(0);

    let rebuilds = 0;
    const run = async () => {
      rebuilds += 1;
      await rebuildLiveGroceryList({
        domain,
        householdId: DEFAULT_HOUSEHOLD_ID,
      });
    };

    // One stock-change reaction: at most a small bounded number of rebuilds.
    await run();
    // Rebuilding must not advance the revision.
    expect(usePantryStore.getState().pantryRevision).toBe(rev);

    // Simulate the screen reacting once to the revision (not recursively).
    await run();
    expect(usePantryStore.getState().pantryRevision).toBe(rev);
    expect(rebuilds).toBeLessThanOrEqual(MAX_REBUILDS_PER_STOCK_CHANGE);
  });

  it('stockSourcesFromPantry maps qty 0 → stock-out (never Plenty path)', () => {
    const sources = stockSourcesFromPantry([
      {
        householdId: DEFAULT_HOUSEHOLD_ID,
        ingredientId: 'chicken-breast',
        formId: 'chicken-breast-bulk',
        locationId: null,
        qtyBase: 0,
        dim: 'mass',
        parLevelBase: 900,
        lowThresholdPct: 0.25,
        lastVerifiedAt: null,
        unverifiedCookCount: 0,
        openedAt: null,
        expiresAt: null,
        updatedAt: new Date().toISOString(),
        watermarkCursor: null,
        lastAbsoluteCursor: null,
        isNegative: false,
        conflict: false,
        ingredientName: 'Chicken breast',
        formName: 'bulk',
        locationName: null,
      },
    ]);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.kind).toBe('stock-out');
  });
});

describe('live grocery — recipe intent only (no catalogue flood)', () => {
  let repo: NodeSqliteRepository;

  beforeEach(async () => {
    repo = new NodeSqliteRepository({ path: ':memory:' });
    // Seed 50 catalogue recipes + fixture pantry/recipes (54+ total).
    await repo.initialize({ loadFixtures: true });
    setActiveRepository(repo);
    usePantryStore.setState({
      items: [],
      selected: null,
      loading: false,
      error: null,
      householdId: DEFAULT_HOUSEHOLD_ID,
      pantryRevision: 0,
    });
  });

  afterEach(async () => {
    setActiveRepository(null);
    await repo.close();
  });

  it('with 50+ catalogue recipes and no user action, list has zero recipe-sourced lines', async () => {
    const domain = repo.domain();
    const recipes = await domain.listRecipes(DEFAULT_HOUSEHOLD_ID);
    expect(recipes.length).toBeGreaterThanOrEqual(50);

    const result = await rebuildLiveGroceryList({
      domain,
      householdId: DEFAULT_HOUSEHOLD_ID,
    });

    const recipeLines = result.items.filter(isRecipeSourcedItem);
    expect(recipeLines).toHaveLength(0);

    // No flood markers from baking / beverage catalogue recipes.
    expect(
      result.items.some((i) =>
        /chocolate chips|vanilla extract|bottled water/i.test(i.name),
      ),
    ).toBe(false);

    // Backbone is stock low/out (+ optional reorder) only.
    for (const item of result.items) {
      const allowed = item.sources.every(
        (s) =>
          s === 'stock-low' ||
          s === 'stock-out' ||
          s === 'reorder' ||
          s === 'manual',
      );
      expect(allowed, `${item.name}: ${item.sources.join(',')}`).toBe(true);
    }

    // Sane band for fixture pantry (order of ~9, not 91).
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.length).toBeLessThanOrEqual(SANE_LIST_MAX);
  });

  it('after Add-missing-style write for one recipe, only that recipe\'s shortfalls appear', async () => {
    const domain = repo.domain();

    // Baseline: no recipe lines.
    const baseline = await rebuildLiveGroceryList({
      domain,
      householdId: DEFAULT_HOUSEHOLD_ID,
    });
    expect(baseline.items.filter(isRecipeSourcedItem)).toHaveLength(0);
    const baselineSize = baseline.items.length;

    // Simulate "Add missing to grocery" for a single known recipe
    // (garlic pasta fixture — parmesan shortfall is a classic demo line).
    const recipeId = 'fixture-recipe-garlic-pasta';
    const recipe = await domain.getRecipe(recipeId);
    expect(recipe).toBeTruthy();

    const shortfallItems = [
      {
        ingredientId: 'parmesan',
        formId: 'parmesan-grated',
        name: 'Parmesan',
        category: 'dairy',
        qtyBase: 50,
        dim: 'mass' as const,
        displayQty: '50 g',
        sources: ['recipe-shortfall' as const],
        recipeIds: [recipeId],
        notes: 'For Garlic Butter Pasta',
      },
      {
        ingredientId: 'pasta-spaghetti',
        formId: 'pasta-spaghetti-bulk',
        name: 'Spaghetti',
        category: 'grains-pasta',
        qtyBase: 400,
        dim: 'mass' as const,
        displayQty: '400 g',
        sources: ['recipe-shortfall' as const],
        recipeIds: [recipeId],
        notes: 'For Garlic Butter Pasta',
      },
    ];

    const existing = await domain.getActiveGroceryList(DEFAULT_HOUSEHOLD_ID);
    expect(existing).toBeTruthy();
    await domain.updateGroceryListItems(existing!.id, [
      ...existing!.items.map((row) => ({
        id: row.id,
        ingredientId: row.ingredientId,
        formId: row.formId,
        name: row.name,
        category: row.category,
        qtyBase: row.qtyBase,
        dim: row.dim,
        displayQty: row.displayQty,
        sources: row.sources,
        recipeIds: row.recipeIds,
        checked: row.checked,
        sortOrder: row.sortOrder,
        notes: row.notes,
      })),
      ...shortfallItems,
    ]);

    const afterAdd = await rebuildLiveGroceryList({
      domain,
      householdId: DEFAULT_HOUSEHOLD_ID,
      prevItems: baseline.items,
    });

    const recipeLines = afterAdd.items.filter(isRecipeSourcedItem);
    expect(recipeLines.length).toBeGreaterThanOrEqual(1);

    // Every recipe-sourced line attributes to that recipe only.
    for (const line of recipeLines) {
      expect(line.recipeIds).toContain(recipeId);
      expect(
        line.recipeIds.every((id) => id === recipeId),
        `unexpected recipeIds ${line.recipeIds.join(',')}`,
      ).toBe(true);
    }

    // Parmesan from that recipe is present with Recipe provenance.
    const parm = afterAdd.items.find((i) => i.ingredientId === 'parmesan');
    expect(parm).toBeTruthy();
    expect(parm!.sources).toContain('recipe-shortfall');
    expect(parm!.recipeIds).toContain(recipeId);

    // List stays in a sane band (baseline + a few shortfalls, not catalogue flood).
    expect(afterAdd.items.length).toBeLessThanOrEqual(
      Math.max(baselineSize + shortfallItems.length + 5, SANE_LIST_MAX),
    );
    expect(afterAdd.items.length).toBeLessThan(50);
  });

  it('stock-driven rebuild preserves recipe items, manual adds, and check-offs', async () => {
    const domain = repo.domain();

    const manual = manualAddSource({ name: 'Paper towels', category: 'other' });
    const first = await rebuildLiveGroceryList({
      domain,
      householdId: DEFAULT_HOUSEHOLD_ID,
      manualSources: [manual],
    });

    const recipeId = 'fixture-recipe-garlic-pasta';
    const shortfall = {
      ingredientId: 'parmesan',
      formId: 'parmesan-grated',
      name: 'Parmesan',
      category: 'dairy',
      qtyBase: 50,
      dim: 'mass' as const,
      displayQty: '50 g',
      sources: ['recipe-shortfall' as const],
      recipeIds: [recipeId],
      notes: 'For Garlic Butter Pasta',
    };

    const list = await domain.getActiveGroceryList(DEFAULT_HOUSEHOLD_ID);
    await domain.updateGroceryListItems(list!.id, [
      ...list!.items.map((row) => ({
        id: row.id,
        ingredientId: row.ingredientId,
        formId: row.formId,
        name: row.name,
        category: row.category,
        qtyBase: row.qtyBase,
        dim: row.dim,
        displayQty: row.displayQty,
        sources: row.sources,
        recipeIds: row.recipeIds,
        checked: row.checked,
        sortOrder: row.sortOrder,
        notes: row.notes,
      })),
      shortfall,
    ]);

    // Rebuild to fold the recipe write into aggregation (as Lists would).
    const withRecipe = await rebuildLiveGroceryList({
      domain,
      householdId: DEFAULT_HOUSEHOLD_ID,
      manualSources: [manual],
      prevItems: first.items,
    });

    expect(withRecipe.items.some((i) => i.name === 'Paper towels')).toBe(true);
    expect(
      withRecipe.items.some(
        (i) =>
          i.ingredientId === 'parmesan' &&
          i.sources.includes('recipe-shortfall'),
      ),
    ).toBe(true);

    // Tick a few lines including the recipe one and manual.
    const toCheck = withRecipe.items.filter(
      (i) =>
        i.name === 'Paper towels' ||
        i.ingredientId === 'parmesan' ||
        i.sources.includes('stock-out'),
    ).slice(0, 3);
    expect(toCheck.length).toBeGreaterThanOrEqual(2);

    for (const row of toCheck) {
      await domain.checkOffGroceryItem(row.id, true);
    }
    const checkedPrev = withRecipe.items.map((row) => ({
      ...row,
      checked: toCheck.some((t) => t.id === row.id) || row.checked,
    }));

    // Stock write elsewhere → revision-driven rebuild must not drop intent.
    await domain.upsertPantryItem({
      householdId: DEFAULT_HOUSEHOLD_ID,
      ingredientId: 'chicken-breast',
      formId: 'chicken-breast-bulk',
      locationId: 'loc-freezer',
      qtyBase: 0,
      dim: 'mass',
      parLevelBase: 900,
      lowThresholdPct: 0.25,
    });
    await domain.appendTxn({
      clientTxnId: `zero-chicken-flood-${Date.now()}`,
      householdId: DEFAULT_HOUSEHOLD_ID,
      ingredientId: 'chicken-breast',
      formId: 'chicken-breast-bulk',
      kind: 'absolute',
      reason: 'recount',
      targetBase: 0,
      occurredAt: new Date().toISOString(),
      deviceId: DEFAULT_DEVICE_ID,
      userId: DEFAULT_USER_ID,
    });

    const second = await rebuildLiveGroceryList({
      domain,
      householdId: DEFAULT_HOUSEHOLD_ID,
      manualSources: [manual],
      prevItems: checkedPrev,
    });

    expect(second.items.some((i) => i.name === 'Paper towels')).toBe(true);
    const parm = second.items.find((i) => i.ingredientId === 'parmesan');
    expect(parm).toBeTruthy();
    expect(parm!.sources).toContain('recipe-shortfall');
    expect(parm!.recipeIds).toContain(recipeId);

    for (const prev of toCheck) {
      const key = lineMatchKey(prev);
      const match = second.items.find((i) => lineMatchKey(i) === key);
      expect(match, `missing line for ${key}`).toBeTruthy();
      expect(match!.checked).toBe(true);
    }

    // Chicken stock-out appeared without wiping the list.
    expect(
      second.items.some(
        (i) =>
          i.ingredientId === 'chicken-breast' &&
          i.sources.includes('stock-out'),
      ),
    ).toBe(true);

    expect(second.items.length).toBeLessThanOrEqual(SANE_LIST_MAX + 5);
  });

  it('intentSourcesFromListItems rehydrates recipe + manual without stock kinds', () => {
    const sources = intentSourcesFromListItems([
      {
        name: 'Parmesan',
        ingredientId: 'parmesan',
        formId: 'parmesan-grated',
        category: 'dairy',
        qtyBase: 50,
        dim: 'mass',
        sources: ['recipe-shortfall', 'stock-out'],
        recipeIds: ['fixture-recipe-garlic-pasta'],
        notes: 'For Garlic Butter Pasta',
      },
      {
        name: 'Paper towels',
        category: 'other',
        qtyBase: null,
        dim: null,
        sources: ['manual'],
        recipeIds: [],
      },
      {
        name: 'Yogurt',
        ingredientId: 'yogurt-plain',
        formId: 'yogurt-plain-bulk',
        sources: ['stock-out'],
        recipeIds: [],
        qtyBase: 500,
        dim: 'mass',
      },
    ]);

    expect(sources.some((s) => s.kind === 'stock-out')).toBe(false);
    expect(sources.filter((s) => s.kind === 'manual')).toHaveLength(1);
    const recipe = sources.filter((s) => s.kind === 'recipe-shortfall');
    expect(recipe).toHaveLength(1);
    // Attribution-only when stock co-owned the line (no qty double-count).
    expect(recipe[0]?.qtyBase).toBeUndefined();
    expect(recipe[0]?.recipeId).toBe('fixture-recipe-garlic-pasta');
  });
});

describe('pantryRevision — store write semantics', () => {
  let repo: NodeSqliteRepository;

  beforeEach(async () => {
    repo = new NodeSqliteRepository({ path: ':memory:' });
    await repo.initialize({ loadFixtures: false });
    setActiveRepository(repo);
    usePantryStore.setState({
      items: [],
      selected: null,
      loading: false,
      error: null,
      householdId: DEFAULT_HOUSEHOLD_ID,
      pantryRevision: 0,
    });
  });

  afterEach(async () => {
    setActiveRepository(null);
    await repo.close();
  });

  it('bumps on appendTxn and load; not on getOne', async () => {
    const domain = repo.domain();
    await domain.upsertPantryItem({
      householdId: DEFAULT_HOUSEHOLD_ID,
      ingredientId: 'milk',
      formId: 'milk-gallon',
      qtyBase: 1000,
      dim: 'volume',
      parLevelBase: 3785,
    });

    expect(usePantryStore.getState().pantryRevision).toBe(0);
    await usePantryStore.getState().load();
    expect(usePantryStore.getState().pantryRevision).toBe(1);

    await usePantryStore.getState().appendTxn({
      clientTxnId: `adj-${Date.now()}`,
      householdId: DEFAULT_HOUSEHOLD_ID,
      ingredientId: 'milk',
      formId: 'milk-gallon',
      kind: 'relative',
      reason: 'adjust_delta',
      deltaBase: -100,
      occurredAt: new Date().toISOString(),
      deviceId: DEFAULT_DEVICE_ID,
      userId: DEFAULT_USER_ID,
    });
    expect(usePantryStore.getState().pantryRevision).toBe(2);

    const beforeGet = usePantryStore.getState().pantryRevision;
    await usePantryStore.getState().getOne('milk', 'milk-gallon');
    expect(usePantryStore.getState().pantryRevision).toBe(beforeGet);
  });
});
