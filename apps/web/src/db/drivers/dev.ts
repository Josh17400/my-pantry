/**
 * Browser DEV driver — plain TypeScript store + IndexedDB persistence.
 *
 * Replaces the Supabase stub for local product review when:
 *   - not native (Capacitor WebView uses drivers/native.ts)
 *   - and (import.meta.env.DEV || hostname is localhost / 127.0.0.1)
 *
 * Production web on a real host still uses WebPantryRepository (online companion).
 *
 * Projection qty is always recomputed via `foldLedger` from `@larder/core` —
 * same function the native DomainRepository uses. No second fold.
 */

import {
  DEFAULT_LOW_THRESHOLD_PCT,
  type Dimension,
  foldLedger,
  type PantryTxn,
  SEED_VERSION,
  seedEdges,
  seedForms,
  seedIngredients,
  seedPackages,
} from '@larder/core';

import {
  DEFAULT_DEVICE_ID,
  DEFAULT_HOUSEHOLD_ID,
  DEFAULT_LOCATION_IDS,
  DEFAULT_USER_ID,
  LOCATIONS_TREE_VERSION,
  META_FIXTURES_VERSION,
  META_LOCATIONS_SEEDED,
  META_LOCATIONS_TREE_VERSION,
  META_RECIPE_SEED_VERSION,
  META_SEED_VERSION,
  RECIPE_SEED_VERSION,
} from '../constants';
import { DEFAULT_LOCATIONS } from '../default-locations';
import type { DomainRepository } from '../domain-repository';
import {
  buildFixtureItems,
  buildFixtureRecipes,
  type FixtureResult,
  FIXTURES_VERSION,
} from '../fixtures';
import { newId } from '../id';
import { applyLocationsTreeMigration } from '../locations-migration';
import {
  maybeRepairProjectionsWithMeta,
  type ProjectionRepairPort,
  type ProjectionRepairResult,
} from '../projection-repair';
import {
  type AggregateResult,
  batchValues,
  computeChecksum,
  type InitializeResult,
  type PantryRepository,
  type VerifyResult,
} from '../repository';
import type { SeedResult } from '../seed';
import { recipeSource, seedStarterRecipes } from '../seed-recipes';
import type {
  AppendTxnInput,
  AppendTxnResult,
  GroceryListItemInput,
  GroceryListItemRow,
  GroceryListView,
  LocationRow,
  LocationWrite,
  PantryItemRow,
  PantryItemUpsert,
  PantryItemView,
  RecipeDetail,
  RecipeSummary,
  RecipeWrite,
  UserAliasRow,
} from '../types';
import {
  deleteDevDatabase,
  DEV_IDB_NAME,
  type DevSnapshot,
  DevStore,
  emptySnapshot,
  type FormRec,
  type GroceryItemRec,
  loadSnapshot,
  type LocationRec,
  type PantryItemRec,
  type RecipeLineRec,
  type RecipeRec,
  type RecipeStepRec,
  type TxnRec,
} from './dev-store';

// ── Selection helpers ───────────────────────────────────────────────────────

export { shouldUseBrowserDevDriver } from './dev-gate';

/** Clear IndexedDB so the next open reseeds. Also usable from the console. */
export async function resetDevDatabase(dbName: string = DEV_IDB_NAME): Promise<void> {
  await deleteDevDatabase(dbName);
}

// ── Mappers (mirror domain-repository) ──────────────────────────────────────

function asDim(value: string): Dimension {
  if (value === 'mass' || value === 'volume' || value === 'count') {
    return value;
  }
  throw new Error(`Invalid dimension: ${value}`);
}

function mapLocation(row: LocationRec): LocationRow {
  return {
    id: row.id,
    householdId: row.householdId,
    name: row.name,
    icon: row.icon,
    tint: row.tint,
    parentId: row.parentId,
    sortOrder: row.sortOrder,
  };
}

function mapPantryItem(row: PantryItemRec): PantryItemRow {
  return {
    householdId: row.householdId,
    ingredientId: row.ingredientId,
    formId: row.formId,
    locationId: row.locationId,
    qtyBase: row.qtyBase,
    dim: asDim(row.dim),
    parLevelBase: row.parLevelBase,
    lowThresholdPct: row.lowThresholdPct,
    lastVerifiedAt: row.lastVerifiedAt,
    unverifiedCookCount: row.unverifiedCookCount,
    openedAt: row.openedAt,
    expiresAt: row.expiresAt,
    updatedAt: row.updatedAt,
    watermarkCursor: row.watermarkCursor,
    lastAbsoluteCursor: row.lastAbsoluteCursor,
    isNegative: row.isNegative,
    conflict: row.conflict,
  };
}

function mapTxnRow(row: TxnRec): PantryTxn {
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

function mapGroceryItem(row: GroceryItemRec): GroceryListItemRow {
  return {
    id: row.id,
    listId: row.listId,
    shoppingTripId: row.shoppingTripId,
    ingredientId: row.ingredientId,
    formId: row.formId,
    name: row.name,
    category: row.category,
    qtyBase: row.qtyBase,
    dim: row.dim ? asDim(row.dim) : null,
    displayQty: row.displayQty,
    sources: parseJsonArray(row.sources),
    recipeIds: parseJsonArray(row.recipeIds),
    checked: row.checked,
    sortOrder: row.sortOrder,
    notes: row.notes,
  };
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (value == null || value === '') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x));
  } catch {
    return [];
  }
}

function stringifyJsonArray(value: readonly string[] | undefined | null): string | null {
  if (value == null) return null;
  return JSON.stringify([...value]);
}

// ── Domain over DevStore ────────────────────────────────────────────────────

/**
 * Product domain ops over the in-memory snapshot.
 * Public method surface matches DomainRepository so stores can call it.
 */
export class DevDomainRepository {
  constructor(private readonly store: DevStore) {}

  private get s(): DevSnapshot {
    return this.store.snapshot;
  }

  // ── Locations ───────────────────────────────────────────────────────────

  async listLocations(
    householdId: string = DEFAULT_HOUSEHOLD_ID,
  ): Promise<LocationRow[]> {
    return this.s.locations
      .filter((l) => l.householdId === householdId)
      .slice()
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      )
      .map(mapLocation);
  }

  async getLocation(id: string): Promise<LocationRow | null> {
    const row = this.s.locations.find((l) => l.id === id);
    return row ? mapLocation(row) : null;
  }

  async createLocation(input: LocationWrite): Promise<LocationRow> {
    const id = input.id ?? newId('loc');
    const row: LocationRec = {
      id,
      householdId: input.householdId,
      name: input.name,
      icon: input.icon ?? 'box',
      tint: input.tint ?? '#8B9A7D',
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder ?? 100,
    };
    this.s.locations.push(row);
    await this.store.persist();
    return mapLocation(row);
  }

  async updateLocation(
    id: string,
    patch: Partial<Omit<LocationWrite, 'id' | 'householdId'>>,
  ): Promise<LocationRow | null> {
    const existing = this.s.locations.find((l) => l.id === id);
    if (!existing) return null;
    existing.name = patch.name ?? existing.name;
    existing.icon = patch.icon ?? existing.icon;
    existing.tint = patch.tint ?? existing.tint;
    if (patch.parentId !== undefined) existing.parentId = patch.parentId;
    if (patch.sortOrder !== undefined) existing.sortOrder = patch.sortOrder;
    await this.store.persist();
    return mapLocation(existing);
  }

  async deleteLocation(id: string): Promise<boolean> {
    this.s.locations = this.s.locations.filter((l) => l.id !== id);
    await this.store.persist();
    return true;
  }

  // ── Pantry projection ───────────────────────────────────────────────────

  private enrichItem(item: PantryItemRec): PantryItemView {
    const ing = this.s.ingredients.find((i) => i.id === item.ingredientId);
    const form = this.s.forms.find((f) => f.id === item.formId);
    const loc = item.locationId
      ? this.s.locations.find((l) => l.id === item.locationId)
      : undefined;
    return {
      ...mapPantryItem(item),
      ingredientName: ing?.name ?? item.ingredientId,
      formName: form?.form ?? null,
      locationName: loc?.name ?? null,
    };
  }

  async listPantryItems(
    householdId: string = DEFAULT_HOUSEHOLD_ID,
  ): Promise<PantryItemView[]> {
    const rows = this.s.pantryItems
      .filter((p) => p.householdId === householdId)
      .map((p) => this.enrichItem(p));
    rows.sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));
    return rows;
  }

  async listPantryByLocation(
    locationId: string,
    householdId: string = DEFAULT_HOUSEHOLD_ID,
  ): Promise<PantryItemView[]> {
    const all = await this.listPantryItems(householdId);
    return all.filter((i) => i.locationId === locationId);
  }

  async getPantryItem(
    ingredientId: string,
    formId: string,
    householdId: string = DEFAULT_HOUSEHOLD_ID,
  ): Promise<PantryItemView | null> {
    const row = this.s.pantryItems.find(
      (p) =>
        p.householdId === householdId &&
        p.ingredientId === ingredientId &&
        p.formId === formId,
    );
    return row ? this.enrichItem(row) : null;
  }

  async searchPantryByName(
    query: string,
    householdId: string = DEFAULT_HOUSEHOLD_ID,
  ): Promise<PantryItemView[]> {
    if (query.trim() === '') {
      return this.listPantryItems(householdId);
    }
    const q = query.trim().toLowerCase();
    const all = await this.listPantryItems(householdId);
    return all.filter(
      (i) =>
        i.ingredientName.toLowerCase().includes(q) ||
        (i.formName?.toLowerCase().includes(q) ?? false),
    );
  }

  async upsertPantryItem(input: PantryItemUpsert): Promise<PantryItemRow> {
    const now = new Date().toISOString();
    const existing = await this.getPantryItem(
      input.ingredientId,
      input.formId,
      input.householdId,
    );

    const row: PantryItemRec = {
      householdId: input.householdId,
      ingredientId: input.ingredientId,
      formId: input.formId,
      locationId:
        input.locationId !== undefined
          ? input.locationId
          : (existing?.locationId ?? null),
      qtyBase: input.qtyBase,
      dim: input.dim,
      parLevelBase:
        input.parLevelBase ?? existing?.parLevelBase ?? input.qtyBase,
      lowThresholdPct:
        input.lowThresholdPct ??
        existing?.lowThresholdPct ??
        DEFAULT_LOW_THRESHOLD_PCT,
      lastVerifiedAt:
        input.lastVerifiedAt !== undefined
          ? input.lastVerifiedAt
          : (existing?.lastVerifiedAt ?? null),
      unverifiedCookCount:
        input.unverifiedCookCount ?? existing?.unverifiedCookCount ?? 0,
      openedAt:
        input.openedAt !== undefined
          ? input.openedAt
          : (existing?.openedAt ?? null),
      expiresAt:
        input.expiresAt !== undefined
          ? input.expiresAt
          : (existing?.expiresAt ?? null),
      updatedAt: now,
      watermarkCursor: existing?.watermarkCursor ?? null,
      lastAbsoluteCursor: existing?.lastAbsoluteCursor ?? null,
      isNegative: input.qtyBase < 0,
      conflict: existing?.conflict ?? false,
    };

    const idx = this.s.pantryItems.findIndex(
      (p) =>
        p.householdId === row.householdId &&
        p.ingredientId === row.ingredientId &&
        p.formId === row.formId,
    );
    if (idx >= 0) {
      this.s.pantryItems[idx] = row;
    } else {
      this.s.pantryItems.push(row);
    }
    await this.store.persist();
    return mapPantryItem(row);
  }

  // ── Ledger ──────────────────────────────────────────────────────────────

  /**
   * Append a txn and recompute the projection with `foldLedger` from core.
   * Same semantics as DomainRepository.appendTxn.
   */
  async appendTxn(input: AppendTxnInput): Promise<AppendTxnResult> {
    const id = input.id ?? newId('txn');
    const insertValues: TxnRec = {
      id,
      clientTxnId: input.clientTxnId,
      householdId: input.householdId,
      ingredientId: input.ingredientId,
      formId: input.formId,
      kind: input.kind,
      deltaBase: input.kind === 'relative' ? input.deltaBase : null,
      targetBase: input.kind === 'absolute' ? input.targetBase : null,
      basisCursor:
        input.kind === 'absolute' ? (input.basisCursor ?? null) : null,
      reason: input.reason,
      refId: input.refId ?? null,
      unitPrice: input.unitPrice ?? null,
      occurredAt: input.occurredAt,
      acceptedAt: input.acceptedAt ?? null,
      deviceId: input.deviceId,
      userId: input.userId,
    };

    let inserted = true;
    const dup = this.s.pantryTxns.find(
      (t) =>
        t.householdId === insertValues.householdId &&
        t.clientTxnId === insertValues.clientTxnId,
    );
    if (dup) {
      inserted = false;
    } else {
      this.s.pantryTxns.push(insertValues);
    }

    const item = await this.recomputeProjection(
      input.householdId,
      input.ingredientId,
      input.formId,
    );

    return {
      inserted,
      item,
      foldQtyBase: item.qtyBase,
    };
  }

  /**
   * Load the ingredient's ledger and set pantry_items from foldLedger.
   * This is the only path that sets qtyBase from stock truth.
   */
  async recomputeProjection(
    householdId: string,
    ingredientId: string,
    formId: string,
  ): Promise<PantryItemRow> {
    const txnRows = this.s.pantryTxns.filter(
      (t) => t.householdId === householdId && t.ingredientId === ingredientId,
    );
    const txns: PantryTxn[] = txnRows.map(mapTxnRow);
    // ── Projection parity with native: only foldLedger from @larder/core ──
    const fold = foldLedger(txns);

    const form: FormRec | undefined = this.s.forms.find((f) => f.id === formId);
    const dim: Dimension = form ? asDim(form.dim) : 'mass';

    const existing = await this.getPantryItem(ingredientId, formId, householdId);
    const now = new Date().toISOString();

    const row: PantryItemRec = {
      householdId,
      ingredientId,
      formId,
      locationId: existing?.locationId ?? DEFAULT_LOCATION_IDS.pantry,
      qtyBase: fold.qtyBase,
      dim,
      parLevelBase: existing?.parLevelBase ?? Math.max(fold.qtyBase, 0),
      lowThresholdPct: existing?.lowThresholdPct ?? DEFAULT_LOW_THRESHOLD_PCT,
      lastVerifiedAt: fold.provenance.lastVerifiedAt,
      unverifiedCookCount: fold.provenance.unverifiedCookCount,
      openedAt: existing?.openedAt ?? null,
      expiresAt: existing?.expiresAt ?? null,
      updatedAt: now,
      watermarkCursor: fold.lastTxnCursor,
      lastAbsoluteCursor: fold.lastAbsoluteCursor,
      isNegative: fold.isNegative,
      conflict: fold.conflict,
    };

    const idx = this.s.pantryItems.findIndex(
      (p) =>
        p.householdId === householdId &&
        p.ingredientId === ingredientId &&
        p.formId === formId,
    );
    if (idx >= 0) {
      this.s.pantryItems[idx] = row;
    } else {
      this.s.pantryItems.push(row);
    }
    await this.store.persist();
    return mapPantryItem(row);
  }

  async listTxnsForIngredient(
    ingredientId: string,
    householdId: string = DEFAULT_HOUSEHOLD_ID,
  ): Promise<PantryTxn[]> {
    return this.s.pantryTxns
      .filter(
        (t) => t.householdId === householdId && t.ingredientId === ingredientId,
      )
      .map(mapTxnRow);
  }

  /**
   * Verify every projection against foldLedger and rewrite drift.
   * Same semantics as DomainRepository.verifyAndRepairProjections.
   */
  async verifyAndRepairProjections(
    options: { householdId?: string; force?: boolean } = {},
  ): Promise<ProjectionRepairResult> {
    const store = this.store;
    const snap = this.s;
    const recompute = (
      householdId: string,
      ingredientId: string,
      formId: string,
    ) => this.recomputeProjection(householdId, ingredientId, formId);
    const port: ProjectionRepairPort = {
      async listProjections(householdId) {
        return snap.pantryItems
          .filter((p) => p.householdId === householdId)
          .map((p) => ({
            ingredientId: p.ingredientId,
            formId: p.formId,
            qtyBase: p.qtyBase,
            watermarkCursor: p.watermarkCursor,
            lastAbsoluteCursor: p.lastAbsoluteCursor,
            lastVerifiedAt: p.lastVerifiedAt,
            unverifiedCookCount: p.unverifiedCookCount,
            isNegative: p.isNegative,
            conflict: p.conflict,
          }));
      },
      async listAllTxns(householdId) {
        return snap.pantryTxns
          .filter((t) => t.householdId === householdId)
          .map(mapTxnRow);
      },
      recomputeProjection: recompute,
    };
    const result = await maybeRepairProjectionsWithMeta(
      port,
      {
        getMeta: (key) => store.getMeta(key),
        setMeta: (key, value) => {
          store.setMeta(key, value);
        },
      },
      options,
    );
    // setMeta is in-memory only until persist; keep stamp durable.
    await store.persist();
    return result;
  }

  // ── Recipes ─────────────────────────────────────────────────────────────

  async listRecipes(householdId?: string | null): Promise<RecipeSummary[]> {
    let rows = this.s.recipes.slice();
    if (householdId != null && householdId !== '') {
      rows = rows.filter(
        (r) => r.householdId === householdId || r.householdId == null,
      );
    }
    rows.sort((a, b) => a.title.localeCompare(b.title));
    return rows.map((r) => {
      const tags = parseJsonArray(r.tags);
      const authorId = r.authorId;
      const householdId = r.householdId;
      return {
        id: r.id,
        householdId,
        title: r.title,
        servings: r.servings,
        prepMin: r.prepMin,
        cookMin: r.cookMin,
        visibility: r.visibility,
        authorId,
        tags,
        imageUrl: r.imageUrl,
        updatedAt: r.updatedAt,
        source: recipeSource({ householdId, authorId, tags }),
      };
    });
  }

  async getRecipe(id: string): Promise<RecipeDetail | null> {
    const r = this.s.recipes.find((x) => x.id === id);
    if (!r) return null;

    const lines = this.s.recipeLines
      .filter((l) => l.recipeId === id)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const steps = this.s.recipeSteps
      .filter((s) => s.recipeId === id)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const tags = parseJsonArray(r.tags);
    const authorId = r.authorId;
    const householdId = r.householdId;

    return {
      id: r.id,
      householdId,
      title: r.title,
      servings: r.servings,
      prepMin: r.prepMin,
      cookMin: r.cookMin,
      visibility: r.visibility,
      authorId,
      tags,
      imageUrl: r.imageUrl,
      updatedAt: r.updatedAt,
      source: recipeSource({ householdId, authorId, tags }),
      yieldNote: r.yieldNote,
      forkedFrom: r.forkedFrom,
      createdAt: r.createdAt,
      ingredients: lines.map((line) => ({
        id: line.id,
        sortOrder: line.sortOrder,
        ingredientId: line.ingredientId ?? undefined,
        formId: line.formId ?? undefined,
        rawText: line.rawText,
        qty: line.qty,
        unit: line.unit,
        optional: line.optional,
        group: line.groupId ?? undefined,
        substitutes: parseJsonArray(line.substitutes),
        unknownAllergens: line.unknownAllergens,
        nonQuantified: line.nonQuantified,
        qtyHigh: line.qtyHigh ?? undefined,
        qtyLow: line.qtyLow ?? undefined,
        isRange: line.isRange,
      })),
      steps: steps.map((s) => ({
        id: s.id,
        sortOrder: s.sortOrder,
        text: s.text,
        durationSec: s.durationSec ?? undefined,
        timerLabel: s.timerLabel ?? undefined,
      })),
    };
  }

  async createRecipe(input: RecipeWrite): Promise<RecipeDetail> {
    const id = input.id ?? newId('recipe');
    const now = new Date().toISOString();
    const rec: RecipeRec = {
      id,
      householdId: input.householdId ?? null,
      title: input.title,
      servings: input.servings,
      yieldNote: input.yieldNote ?? null,
      prepMin: input.prepMin ?? null,
      cookMin: input.cookMin ?? null,
      authorId: input.authorId ?? null,
      visibility: input.visibility ?? 'private',
      forkedFrom: input.forkedFrom ?? null,
      tags: stringifyJsonArray(input.tags ?? []),
      imageUrl: input.imageUrl ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.s.recipes.push(rec);
    this.replaceRecipeChildren(id, input);
    await this.store.persist();
    const detail = await this.getRecipe(id);
    if (!detail) throw new Error('Failed to read recipe after create');
    return detail;
  }

  async updateRecipe(
    id: string,
    input: RecipeWrite,
  ): Promise<RecipeDetail | null> {
    const existing = await this.getRecipe(id);
    if (!existing) return null;
    const r = this.s.recipes.find((x) => x.id === id);
    if (!r) return null;
    const now = new Date().toISOString();
    r.householdId = input.householdId ?? existing.householdId;
    r.title = input.title;
    r.servings = input.servings;
    r.yieldNote = input.yieldNote ?? null;
    r.prepMin = input.prepMin ?? null;
    r.cookMin = input.cookMin ?? null;
    r.authorId = input.authorId ?? existing.authorId;
    r.visibility = input.visibility ?? existing.visibility;
    r.forkedFrom = input.forkedFrom ?? existing.forkedFrom;
    r.tags = stringifyJsonArray(input.tags ?? existing.tags);
    r.imageUrl = input.imageUrl ?? existing.imageUrl;
    r.updatedAt = now;

    this.s.recipeLines = this.s.recipeLines.filter((l) => l.recipeId !== id);
    this.s.recipeSteps = this.s.recipeSteps.filter((st) => st.recipeId !== id);
    this.replaceRecipeChildren(id, input);
    await this.store.persist();
    return this.getRecipe(id);
  }

  async deleteRecipe(id: string): Promise<boolean> {
    this.s.recipeLines = this.s.recipeLines.filter((l) => l.recipeId !== id);
    this.s.recipeSteps = this.s.recipeSteps.filter((st) => st.recipeId !== id);
    this.s.recipes = this.s.recipes.filter((r) => r.id !== id);
    await this.store.persist();
    return true;
  }

  private replaceRecipeChildren(recipeId: string, input: RecipeWrite): void {
    for (let i = 0; i < input.ingredients.length; i++) {
      const line = input.ingredients[i]!;
      const rec: RecipeLineRec = {
        id: newId('rline'),
        recipeId,
        sortOrder: i,
        ingredientId: line.ingredientId ?? null,
        formId: line.formId ?? null,
        rawText: line.rawText,
        qty: line.qty ?? null,
        unit: line.unit ?? null,
        optional: line.optional ?? false,
        groupId: line.group ?? null,
        substitutes: stringifyJsonArray(line.substitutes ?? []),
        unknownAllergens: line.unknownAllergens ?? false,
        nonQuantified: line.nonQuantified ?? false,
        qtyHigh: line.qtyHigh ?? null,
        qtyLow: line.qtyLow ?? null,
        isRange: line.isRange ?? false,
      };
      this.s.recipeLines.push(rec);
    }
    for (let i = 0; i < input.steps.length; i++) {
      const step = input.steps[i]!;
      const rec: RecipeStepRec = {
        id: newId('rstep'),
        recipeId,
        sortOrder: i,
        text: step.text,
        durationSec: step.durationSec ?? null,
        timerLabel: step.timerLabel ?? null,
      };
      this.s.recipeSteps.push(rec);
    }
  }

  // ── Grocery ─────────────────────────────────────────────────────────────

  async createGroceryList(input: {
    householdId?: string;
    shoppingTripId?: string;
    items?: readonly GroceryListItemInput[];
  }): Promise<GroceryListView> {
    const id = newId('glist');
    const shoppingTripId = input.shoppingTripId ?? newId('trip');
    const householdId = input.householdId ?? DEFAULT_HOUSEHOLD_ID;
    const now = new Date().toISOString();

    this.s.groceryLists.push({
      id,
      householdId,
      shoppingTripId,
      createdAt: now,
      updatedAt: now,
    });

    if (input.items && input.items.length > 0) {
      for (let i = 0; i < input.items.length; i++) {
        const item = input.items[i]!;
        this.s.groceryItems.push({
          id: item.id ?? newId('gitem'),
          listId: id,
          shoppingTripId,
          ingredientId: item.ingredientId ?? null,
          formId: item.formId ?? null,
          name: item.name,
          category: item.category,
          qtyBase: item.qtyBase ?? null,
          dim: item.dim ?? null,
          displayQty: item.displayQty,
          sources: stringifyJsonArray(item.sources ?? ['manual']),
          recipeIds: stringifyJsonArray(item.recipeIds ?? []),
          checked: item.checked ?? false,
          sortOrder: item.sortOrder ?? i,
          notes: item.notes ?? null,
        });
      }
    }

    await this.store.persist();
    const view = await this.getGroceryList(id);
    if (!view) throw new Error('Failed to read grocery list after create');
    return view;
  }

  async getGroceryList(listId: string): Promise<GroceryListView | null> {
    const list = this.s.groceryLists.find((l) => l.id === listId);
    if (!list) return null;
    const items = this.s.groceryItems
      .filter((i) => i.listId === listId)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(mapGroceryItem);
    return {
      id: list.id,
      householdId: list.householdId,
      shoppingTripId: list.shoppingTripId,
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
      items,
    };
  }

  async getActiveGroceryList(
    householdId: string = DEFAULT_HOUSEHOLD_ID,
  ): Promise<GroceryListView | null> {
    const lists = this.s.groceryLists
      .filter((l) => l.householdId === householdId)
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const list = lists[0];
    if (!list) return null;
    return this.getGroceryList(list.id);
  }

  async updateGroceryListItems(
    listId: string,
    items: readonly GroceryListItemInput[],
  ): Promise<GroceryListView | null> {
    const existing = await this.getGroceryList(listId);
    if (!existing) return null;
    const now = new Date().toISOString();

    this.s.groceryItems = this.s.groceryItems.filter((i) => i.listId !== listId);

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      this.s.groceryItems.push({
        id: item.id ?? newId('gitem'),
        listId,
        shoppingTripId: existing.shoppingTripId,
        ingredientId: item.ingredientId ?? null,
        formId: item.formId ?? null,
        name: item.name,
        category: item.category,
        qtyBase: item.qtyBase ?? null,
        dim: item.dim ?? null,
        displayQty: item.displayQty,
        sources: stringifyJsonArray(item.sources ?? ['manual']),
        recipeIds: stringifyJsonArray(item.recipeIds ?? []),
        checked: item.checked ?? false,
        sortOrder: item.sortOrder ?? i,
        notes: item.notes ?? null,
      });
    }

    const list = this.s.groceryLists.find((l) => l.id === listId);
    if (list) list.updatedAt = now;

    await this.store.persist();
    return this.getGroceryList(listId);
  }

  async checkOffGroceryItem(
    itemId: string,
    checked: boolean,
  ): Promise<GroceryListItemRow | null> {
    const row = this.s.groceryItems.find((i) => i.id === itemId);
    if (!row) return null;
    row.checked = checked;
    const list = this.s.groceryLists.find((l) => l.id === row.listId);
    if (list) list.updatedAt = new Date().toISOString();
    await this.store.persist();
    return mapGroceryItem(row);
  }

  // ── User aliases ────────────────────────────────────────────────────────

  async listUserAliases(
    householdId: string = DEFAULT_HOUSEHOLD_ID,
  ): Promise<UserAliasRow[]> {
    return this.s.userAliases
      .filter((a) => a.householdId === householdId)
      .map((r) => ({
        id: r.id,
        householdId: r.householdId,
        alias: r.alias,
        ingredientId: r.ingredientId,
        createdAt: r.createdAt,
      }));
  }

  async upsertUserAlias(input: {
    householdId: string;
    alias: string;
    ingredientId: string;
  }): Promise<UserAliasRow> {
    const id = `${input.householdId}::${input.alias.toLowerCase()}`;
    const createdAt = new Date().toISOString();
    const row = {
      id,
      householdId: input.householdId,
      alias: input.alias,
      ingredientId: input.ingredientId,
      createdAt,
    };
    const idx = this.s.userAliases.findIndex((a) => a.id === id);
    if (idx >= 0) {
      this.s.userAliases[idx] = {
        ...row,
        createdAt: this.s.userAliases[idx]!.createdAt,
      };
    } else {
      this.s.userAliases.push(row);
    }
    await this.store.persist();
    return row;
  }
}

// ── Seed / fixtures for the plain store ─────────────────────────────────────

async function runDevSeed(
  store: DevStore,
  options: { householdId?: string; force?: boolean } = {},
): Promise<SeedResult> {
  const householdId = options.householdId ?? DEFAULT_HOUSEHOLD_ID;
  const previousSeedVersion = store.getMeta(META_SEED_VERSION);
  const previousRecipeSeedVersion = store.getMeta(META_RECIPE_SEED_VERSION);
  const locationsFlag = store.getMeta(META_LOCATIONS_SEEDED);

  let locationsSeeded = false;
  let ingredientsUpserted = 0;
  let formsUpserted = 0;
  let edgesUpserted = 0;
  let packagesUpserted = 0;
  let skippedCatalog = false;

  await store.batch(() => {
    const s = store.snapshot;

    if (locationsFlag !== '1' || options.force) {
      for (const loc of DEFAULT_LOCATIONS) {
        if (!s.locations.some((l) => l.id === loc.id)) {
          s.locations.push({
            id: loc.id,
            householdId,
            name: loc.name,
            icon: loc.icon,
            tint: loc.tint,
            parentId: loc.parentId,
            sortOrder: loc.sortOrder,
          });
        }
      }
      store.setMeta(META_LOCATIONS_SEEDED, '1');
      locationsSeeded = true;
    }

    // Fold Around the House → Pantry, ensure Freezer (idempotent via meta).
    const treeVersion = store.getMeta(META_LOCATIONS_TREE_VERSION);
    if (treeVersion !== LOCATIONS_TREE_VERSION || options.force) {
      const migrated = applyLocationsTreeMigration({
        locations: s.locations,
        pantryItems: s.pantryItems.map((p) => ({
          householdId: p.householdId,
          ingredientId: p.ingredientId,
          formId: p.formId,
          locationId: p.locationId,
        })),
        householdId,
      });
      s.locations = migrated.locations;
      // Apply locationId remaps onto full pantry rows (migration returns refs only).
      const locByKey = new Map(
        migrated.pantryItems.map((p) => [
          `${p.householdId}:${p.ingredientId}:${p.formId}`,
          p.locationId,
        ]),
      );
      for (const row of s.pantryItems) {
        const key = `${row.householdId}:${row.ingredientId}:${row.formId}`;
        const nextLoc = locByKey.get(key);
        if (nextLoc !== undefined) row.locationId = nextLoc;
      }
      store.setMeta(META_LOCATIONS_TREE_VERSION, LOCATIONS_TREE_VERSION);
    }

    if (previousSeedVersion === SEED_VERSION && !options.force) {
      skippedCatalog = true;
      return;
    }

    for (const ing of seedIngredients) {
      const rec = {
        id: ing.id,
        name: ing.name,
        category: ing.category,
        allergens: JSON.stringify([...ing.allergens]),
        isStaple: ing.isStaple,
        defaultFormId: ing.defaultFormId,
      };
      const idx = s.ingredients.findIndex((i) => i.id === ing.id);
      if (idx >= 0) s.ingredients[idx] = rec;
      else s.ingredients.push(rec);
    }

    for (const form of seedForms) {
      const rec = {
        id: form.id,
        ingredientId: form.ingredientId,
        form: form.form,
        dim: form.dim,
        densityGPerMl: form.densityGPerMl ?? null,
        gramsPerCount: form.gramsPerCount ?? null,
        uncertaintyPct: form.uncertaintyPct,
      };
      const idx = s.forms.findIndex((f) => f.id === form.id);
      if (idx >= 0) s.forms[idx] = rec;
      else s.forms.push(rec);
    }

    for (const edge of seedEdges) {
      const rec = {
        fromFormId: edge.fromFormId,
        toFormId: edge.toFormId,
        factor: edge.factor,
        uncertaintyPct: edge.uncertaintyPct,
        source: edge.source,
        oneWay: edge.oneWay ?? false,
      };
      const idx = s.edges.findIndex(
        (e) => e.fromFormId === edge.fromFormId && e.toFormId === edge.toFormId,
      );
      if (idx >= 0) s.edges[idx] = rec;
      else s.edges.push(rec);
    }

    for (const pack of seedPackages) {
      const rec = {
        formId: pack.formId,
        label: pack.label,
        netG: pack.netG,
        drainedG: pack.drainedG ?? null,
      };
      const idx = s.packages.findIndex(
        (p) => p.formId === pack.formId && p.label === pack.label,
      );
      if (idx >= 0) s.packages[idx] = rec;
      else s.packages.push(rec);
    }

    store.setMeta(META_SEED_VERSION, SEED_VERSION);
    ingredientsUpserted = seedIngredients.length;
    formsUpserted = seedForms.length;
    edgesUpserted = seedEdges.length;
    packagesUpserted = seedPackages.length;
  });

  // Recipe catalogue — independent version (outside ingredient batch so we can
  // use DevDomainRepository create/update with persist).
  let recipesUpserted = 0;
  let skippedRecipes = false;
  if (previousRecipeSeedVersion === RECIPE_SEED_VERSION && !options.force) {
    skippedRecipes = true;
  } else {
    const domain = new DevDomainRepository(store);
    // Batch recipe writes into one IndexedDB flush.
    await store.batch(async () => {
      const seeded = await seedStarterRecipes(domain);
      recipesUpserted = seeded.recipesUpserted;
      store.setMeta(META_RECIPE_SEED_VERSION, RECIPE_SEED_VERSION);
    });
  }

  // Projection self-heal (once per repair|seed stamp) — same as native seed.
  const domainForRepair = new DevDomainRepository(store);
  await domainForRepair.verifyAndRepairProjections({ householdId });

  return {
    seedVersion: SEED_VERSION,
    previousSeedVersion,
    ingredientsUpserted,
    formsUpserted,
    edgesUpserted,
    packagesUpserted,
    locationsSeeded,
    locationsTreeVersion: LOCATIONS_TREE_VERSION,
    skippedCatalog,
    recipeSeedVersion: RECIPE_SEED_VERSION,
    previousRecipeSeedVersion,
    recipesUpserted,
    skippedRecipes,
  };
}

async function runDevFixtures(
  domain: DevDomainRepository,
  store: DevStore,
  options: { householdId?: string; force?: boolean } = {},
): Promise<FixtureResult> {
  const householdId = options.householdId ?? DEFAULT_HOUSEHOLD_ID;
  if (store.getMeta(META_FIXTURES_VERSION) === FIXTURES_VERSION && !options.force) {
    return {
      applied: false,
      skipped: true,
      version: FIXTURES_VERSION,
      pantryItems: 0,
      recipes: 0,
    };
  }

  const items = buildFixtureItems();
  let pantryCount = 0;
  const now = new Date().toISOString();

  // One IndexedDB write at the end — per-txn persist is far too slow on first boot.
  await store.batch(async () => {
    for (const item of items) {
      await domain.appendTxn({
        clientTxnId: `fixture-abs-${item.ingredientId}-${item.formId}`,
        householdId,
        ingredientId: item.ingredientId,
        formId: item.formId,
        kind: 'absolute',
        reason: 'recount',
        targetBase: item.qtyBase,
        occurredAt: now,
        acceptedAt: now,
        deviceId: DEFAULT_DEVICE_ID,
        userId: DEFAULT_USER_ID,
      });

      await domain.upsertPantryItem({
        householdId,
        ingredientId: item.ingredientId,
        formId: item.formId,
        locationId: item.locationId,
        qtyBase: item.qtyBase,
        dim: item.dim,
        parLevelBase: item.parLevelBase,
        lowThresholdPct: item.lowThresholdPct ?? DEFAULT_LOW_THRESHOLD_PCT,
        expiresAt: item.expiresAt ?? null,
        openedAt: item.openedAt ?? null,
        lastVerifiedAt: now,
        unverifiedCookCount: 0,
      });
      pantryCount += 1;
    }

    const recipes = buildFixtureRecipes(householdId);
    for (const recipe of recipes) {
      const existingRecipe = recipe.id ? await domain.getRecipe(recipe.id) : null;
      if (existingRecipe) {
        await domain.updateRecipe(recipe.id!, recipe);
      } else {
        await domain.createRecipe(recipe);
      }
    }

    store.setMeta(META_FIXTURES_VERSION, FIXTURES_VERSION);
  });

  return {
    applied: true,
    skipped: false,
    version: FIXTURES_VERSION,
    pantryItems: pantryCount,
    recipes: buildFixtureRecipes(householdId).length,
  };
}

// ── PantryRepository ────────────────────────────────────────────────────────

export type DevPantryOptions = {
  /** Skip IndexedDB (unit tests). */
  memoryOnly?: boolean;
  /** IndexedDB database name (default good-pantry-dev). */
  dbName?: string;
};

/**
 * Full product repository for browser DEV / local review.
 * Implements health-check methods + domain ops via DevDomainRepository.
 */
export class DevPantryRepository implements PantryRepository {
  readonly driverName = 'indexeddb-dev+foldLedger';

  private store: DevStore | null = null;
  private domainRepo: DevDomainRepository | null = null;
  private readonly memoryOnly: boolean;
  private readonly dbName: string;

  constructor(options: DevPantryOptions = {}) {
    this.memoryOnly = options.memoryOnly ?? false;
    this.dbName = options.dbName ?? DEV_IDB_NAME;
  }

  async open(): Promise<void> {
    // Idempotent when already open (keeps in-memory state across initialize()).
    if (this.store && this.domainRepo) {
      return;
    }

    if (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('reset')
    ) {
      await deleteDevDatabase(this.dbName);
      // Strip ?reset so a refresh does not wipe again.
      if (typeof history !== 'undefined' && window.location.search.includes('reset')) {
        const url = new URL(window.location.href);
        url.searchParams.delete('reset');
        history.replaceState(null, '', url.pathname + url.search + url.hash);
      }
    }

    const snap = await loadSnapshot(this.dbName, this.memoryOnly);
    this.store = new DevStore(snap, {
      dbName: this.dbName,
      memoryOnly: this.memoryOnly,
    });
    this.domainRepo = new DevDomainRepository(this.store);
  }

  async migrate(): Promise<void> {
    // Schema is the in-memory shape; nothing to apply.
    this.requireStore();
  }

  async seed(options?: { force?: boolean }): Promise<SeedResult> {
    return runDevSeed(this.requireStore(), options);
  }

  async initialize(options?: {
    loadFixtures?: boolean;
  }): Promise<InitializeResult> {
    await this.open();
    const store = this.requireStore();
    const domain = this.domainRepo;
    if (!domain) {
      throw new Error('Database not open');
    }
    const seed = await runDevSeed(store);
    let fixtures: FixtureResult | undefined;
    if (options?.loadFixtures) {
      fixtures = await runDevFixtures(domain, store);
    }
    return {
      migrateApplied: [],
      migrateSkipped: ['0000_m0_health', '0001_product_schema'],
      seed,
      fixtures,
    };
  }

  /**
   * Domain repository for product screens.
   * Cast: DevDomainRepository is structurally compatible with DomainRepository
   * at the call sites (same public methods). Private Drizzle handle is N/A here.
   */
  domain(): DomainRepository {
    if (!this.domainRepo) {
      throw new Error('Database not open');
    }
    return this.domainRepo as unknown as DomainRepository;
  }

  /** Wipe store + IndexedDB and leave ready for re-initialize. */
  async reset(): Promise<void> {
    await deleteDevDatabase(this.dbName);
    this.store = new DevStore(emptySnapshot(), {
      dbName: this.dbName,
      memoryOnly: this.memoryOnly,
    });
    this.domainRepo = new DevDomainRepository(this.store);
    await this.store.persist();
  }

  /**
   * Settings → Diagnostics: clear local IndexedDB, re-migrate/seed catalogue.
   * Never loads fixtures; cloud is untouched (dev driver is local-only).
   */
  async resetLocalData(): Promise<void> {
    await this.reset();
    await this.initialize({ loadFixtures: false });
  }

  // ── Health probe (M0) ───────────────────────────────────────────────────

  async insertBatch(
    countRows = 1000,
  ): Promise<{ ms: number; inserted: number; checksum: number }> {
    const store = this.requireStore();
    const values = batchValues(countRows);
    const checksum = computeChecksum(values);
    const s = store.snapshot;

    const start = performance.now();
    s.healthProbe = [];
    s.nextHealthId = 1;
    for (let i = 0; i < countRows; i++) {
      s.healthProbe.push({
        id: s.nextHealthId++,
        value: values[i]!,
        label: `row-${i}`,
      });
    }
    await store.persist();
    const ms = performance.now() - start;

    return { ms, inserted: countRows, checksum };
  }

  async verify(
    expectedCount: number,
    expectedChecksum: number,
  ): Promise<VerifyResult> {
    const rows = this.requireStore()
      .snapshot.healthProbe.slice()
      .sort((a, b) => a.id - b.id);
    const values = rows.map((r) => r.value);
    const checksum = computeChecksum(values);
    return {
      count: values.length,
      checksum,
      expectedCount,
      expectedChecksum,
      ok: values.length === expectedCount && checksum === expectedChecksum,
    };
  }

  async aggregateIndexed(): Promise<AggregateResult> {
    const start = performance.now();
    const rows = this.requireStore().snapshot.healthProbe.filter(
      (r) => r.value >= 0,
    );
    return {
      count: rows.length,
      sum: rows.reduce((acc, r) => acc + r.value, 0),
      ms: performance.now() - start,
    };
  }

  async closeReopenAndVerify(
    expectedCount: number,
    expectedChecksum: number,
  ): Promise<VerifyResult> {
    if (this.memoryOnly) {
      return this.verify(expectedCount, expectedChecksum);
    }
    await this.close();
    await this.open();
    return this.verify(expectedCount, expectedChecksum);
  }

  async cleanup(): Promise<void> {
    const store = this.requireStore();
    store.snapshot.healthProbe = [];
    store.snapshot.nextHealthId = 1;
    await store.persist();
  }

  async close(): Promise<void> {
    if (this.store) {
      await this.store.persist();
    }
    this.store = null;
    this.domainRepo = null;
  }

  private requireStore(): DevStore {
    if (!this.store) {
      throw new Error('Database not open');
    }
    return this.store;
  }
}
