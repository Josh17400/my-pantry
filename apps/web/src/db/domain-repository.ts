/**
 * Product domain repository — pantry, ledger, recipes, grocery, locations.
 *
 * Projection qty is always recomputed via `foldLedger` from `@larder/core`.
 * Never reimplements fold rules in SQL.
 */

import {
  DEFAULT_LOW_THRESHOLD_PCT,
  type Dimension,
  foldLedger,
  type PantryTxn,
  seedForms,
  seedIngredients,
} from '@larder/core';
import { and, asc, eq, or, sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import {
  DEFAULT_HOUSEHOLD_ID,
  DEFAULT_LOCATION_IDS,
} from './constants';
import { newId } from './id';
import {
  resolveIngredientTitle,
  seedIngredientName,
} from './ingredient-display';
import { parseJsonArray, stringifyJsonArray } from './json';
import {
  maybeRepairProjectionsOnStartup,
  type ProjectionRepairResult,
} from './projection-repair';
import {
  type AppSchema,
  groceryListItems,
  groceryLists,
  ingredientForms,
  ingredients,
  locations,
  pantryItems,
  pantryTxns,
  recipeLines,
  recipes,
  recipeSteps,
  schema,
  userAliases,
} from './schema';
import { recipeSource } from './seed-recipes';
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
} from './types';

/**
 * Drizzle handle used by product repos.
 * Base SQLite type is shared by sqlite-proxy (native) and better-sqlite3 (tests).
 */
export type AppDatabase = BaseSQLiteDatabase<
  'async' | 'sync',
  unknown,
  AppSchema
>;

function asDim(value: string): Dimension {
  if (value === 'mass' || value === 'volume' || value === 'count') {
    return value;
  }
  throw new Error(`Invalid dimension: ${value}`);
}

function mapLocation(row: typeof locations.$inferSelect): LocationRow {
  return {
    id: row.id,
    householdId: row.householdId,
    name: row.name,
    icon: row.icon,
    tint: row.tint,
    parentId: row.parentId ?? null,
    sortOrder: row.sortOrder,
  };
}

function mapPantryItem(row: typeof pantryItems.$inferSelect): PantryItemRow {
  return {
    householdId: row.householdId,
    ingredientId: row.ingredientId,
    formId: row.formId,
    locationId: row.locationId ?? null,
    qtyBase: row.qtyBase,
    dim: asDim(row.dim),
    parLevelBase: row.parLevelBase,
    lowThresholdPct: row.lowThresholdPct,
    lastVerifiedAt: row.lastVerifiedAt ?? null,
    unverifiedCookCount: row.unverifiedCookCount,
    openedAt: row.openedAt ?? null,
    expiresAt: row.expiresAt ?? null,
    updatedAt: row.updatedAt,
    watermarkCursor: row.watermarkCursor ?? null,
    lastAbsoluteCursor: row.lastAbsoluteCursor ?? null,
    isNegative: Boolean(row.isNegative),
    conflict: Boolean(row.conflict),
  };
}

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

function mapGroceryItem(row: typeof groceryListItems.$inferSelect): GroceryListItemRow {
  return {
    id: row.id,
    listId: row.listId,
    shoppingTripId: row.shoppingTripId,
    ingredientId: row.ingredientId ?? null,
    formId: row.formId ?? null,
    name: row.name,
    category: row.category,
    qtyBase: row.qtyBase ?? null,
    dim: row.dim ? asDim(row.dim) : null,
    displayQty: row.displayQty,
    sources: parseJsonArray(row.sources),
    recipeIds: parseJsonArray(row.recipeIds),
    checked: Boolean(row.checked),
    sortOrder: row.sortOrder,
    notes: row.notes ?? null,
  };
}

export class DomainRepository {
  constructor(private readonly db: AppDatabase) {}

  // ── Locations ───────────────────────────────────────────────────────────

  async listLocations(
    householdId: string = DEFAULT_HOUSEHOLD_ID,
  ): Promise<LocationRow[]> {
    const rows = await this.db
      .select()
      .from(locations)
      .where(eq(locations.householdId, householdId))
      .orderBy(asc(locations.sortOrder), asc(locations.name));
    return rows.map(mapLocation);
  }

  async getLocation(id: string): Promise<LocationRow | null> {
    const rows = await this.db
      .select()
      .from(locations)
      .where(eq(locations.id, id))
      .limit(1);
    return rows[0] ? mapLocation(rows[0]) : null;
  }

  async createLocation(input: LocationWrite): Promise<LocationRow> {
    const id = input.id ?? newId('loc');
    const row = {
      id,
      householdId: input.householdId,
      name: input.name,
      icon: input.icon ?? 'box',
      tint: input.tint ?? '#8B9A7D',
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder ?? 100,
    };
    await this.db.insert(locations).values(row);
    return mapLocation(row);
  }

  async updateLocation(
    id: string,
    patch: Partial<Omit<LocationWrite, 'id' | 'householdId'>>,
  ): Promise<LocationRow | null> {
    const existing = await this.getLocation(id);
    if (!existing) return null;
    const next = {
      name: patch.name ?? existing.name,
      icon: patch.icon ?? existing.icon,
      tint: patch.tint ?? existing.tint,
      parentId:
        patch.parentId !== undefined ? patch.parentId : existing.parentId,
      sortOrder: patch.sortOrder ?? existing.sortOrder,
    };
    await this.db.update(locations).set(next).where(eq(locations.id, id));
    return this.getLocation(id);
  }

  async deleteLocation(id: string): Promise<boolean> {
    // Prevent deleting seeded top-level defaults by id is caller's choice;
    // children with this parent become orphans (parentId left as-is).
    const result = await this.db.delete(locations).where(eq(locations.id, id));
    void result;
    return true;
  }

  // ── Pantry projection ───────────────────────────────────────────────────

  /**
   * Joined pantry projection select.
   *
   * SQL aliases on joined columns are required so object-keyed drivers
   * (Capacitor SQLite) cannot collapse `ingredients.name` and `locations.name`
   * into a single `name` key. The native proxy also injects positional
   * `__gp_N` aliases as a structural backstop — keep these for clarity and
   * for any path that skips the rewrite.
   */
  private pantryItemViewSelect() {
    return {
      item: pantryItems,
      ingredientName: sql<string | null>`${ingredients.name}`.as(
        'ingredient_name',
      ),
      formName: sql<string | null>`${ingredientForms.form}`.as('form_name'),
      locationName: sql<string | null>`${locations.name}`.as('location_name'),
    };
  }

  async listPantryItems(
    householdId: string = DEFAULT_HOUSEHOLD_ID,
  ): Promise<PantryItemView[]> {
    const rows = await this.db
      .select(this.pantryItemViewSelect())
      .from(pantryItems)
      .leftJoin(ingredients, eq(pantryItems.ingredientId, ingredients.id))
      .leftJoin(ingredientForms, eq(pantryItems.formId, ingredientForms.id))
      .leftJoin(locations, eq(pantryItems.locationId, locations.id))
      .where(eq(pantryItems.householdId, householdId))
      .orderBy(asc(ingredients.name));

    return rows.map((r) => this.toPantryItemView(r));
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
    const rows = await this.db
      .select(this.pantryItemViewSelect())
      .from(pantryItems)
      .leftJoin(ingredients, eq(pantryItems.ingredientId, ingredients.id))
      .leftJoin(ingredientForms, eq(pantryItems.formId, ingredientForms.id))
      .leftJoin(locations, eq(pantryItems.locationId, locations.id))
      .where(
        and(
          eq(pantryItems.householdId, householdId),
          eq(pantryItems.ingredientId, ingredientId),
          eq(pantryItems.formId, formId),
        ),
      )
      .limit(1);

    const r = rows[0];
    if (!r) return null;
    return this.toPantryItemView(r);
  }

  async searchPantryByName(
    query: string,
    householdId: string = DEFAULT_HOUSEHOLD_ID,
  ): Promise<PantryItemView[]> {
    if (query.trim() === '') {
      return this.listPantryItems(householdId);
    }
    // Load via list (join + seed fallback) so rows whose catalogue join
    // misses still surface when the resolved name matches the query.
    const all = await this.listPantryItems(householdId);
    const needle = query.trim().toLowerCase();
    return all.filter(
      (i) =>
        i.ingredientName.toLowerCase().includes(needle) ||
        (i.formName?.toLowerCase().includes(needle) ?? false),
    );
  }

  private toPantryItemView(r: {
    item: typeof pantryItems.$inferSelect;
    ingredientName: string | null;
    formName: string | null;
    locationName: string | null;
  }): PantryItemView {
    const locationName = r.locationName ?? null;
    const ingredientName =
      resolveIngredientTitle({
        ingredientId: r.item.ingredientId,
        ingredientName: r.ingredientName,
        locationName,
      }) ?? r.item.ingredientId;
    return {
      ...mapPantryItem(r.item),
      ingredientName,
      formName: r.formName ?? null,
      locationName,
    };
  }

  /**
   * Write the seed (or display-name) catalogue row when missing so pantry
   * joins resolve after manual add on a stale local ingredients table.
   */
  private async ensureCatalogRows(
    ingredientId: string,
    formId: string,
    displayName?: string | null,
  ): Promise<void> {
    const seedIng = seedIngredients.find((i) => i.id === ingredientId);
    const name =
      (displayName && displayName.trim()) ||
      seedIng?.name ||
      seedIngredientName(ingredientId) ||
      ingredientId;

    const existing = await this.db
      .select({ id: ingredients.id, name: ingredients.name })
      .from(ingredients)
      .where(eq(ingredients.id, ingredientId))
      .limit(1);

    if (existing.length === 0) {
      await this.db.insert(ingredients).values({
        id: ingredientId,
        name,
        category: seedIng?.category ?? 'other',
        allergens: JSON.stringify([...(seedIng?.allergens ?? [])]),
        isStaple: seedIng?.isStaple ?? false,
        defaultFormId: seedIng?.defaultFormId ?? formId,
      });
    } else if (
      (!existing[0]!.name || existing[0]!.name === ingredientId) &&
      name !== ingredientId
    ) {
      await this.db
        .update(ingredients)
        .set({ name })
        .where(eq(ingredients.id, ingredientId));
    }

    const formRows = await this.db
      .select({ id: ingredientForms.id })
      .from(ingredientForms)
      .where(eq(ingredientForms.id, formId))
      .limit(1);
    if (formRows.length === 0) {
      const seedForm = seedForms.find((f) => f.id === formId);
      await this.db.insert(ingredientForms).values({
        id: formId,
        ingredientId,
        form: seedForm?.form ?? 'each',
        dim: seedForm?.dim ?? 'count',
        densityGPerMl: seedForm?.densityGPerMl ?? null,
        gramsPerCount: seedForm?.gramsPerCount ?? null,
        uncertaintyPct: seedForm?.uncertaintyPct ?? 0,
      });
    }
  }

  /**
   * Direct projection upsert (metadata / placement). Quantity still should
   * come from the ledger for stock truth; this is for location, par, expiry.
   * When `ingredientName` is provided, also ensures the local catalogue row
   * exists so list joins resolve (manual-add path).
   */
  async upsertPantryItem(input: PantryItemUpsert): Promise<PantryItemRow> {
    const now = new Date().toISOString();
    const existing = await this.getPantryItem(
      input.ingredientId,
      input.formId,
      input.householdId,
    );

    await this.ensureCatalogRows(
      input.ingredientId,
      input.formId,
      input.ingredientName,
    );

    const row = {
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

    await this.db
      .insert(pantryItems)
      .values(row)
      .onConflictDoUpdate({
        target: [
          pantryItems.householdId,
          pantryItems.ingredientId,
          pantryItems.formId,
        ],
        set: {
          locationId: row.locationId,
          qtyBase: row.qtyBase,
          dim: row.dim,
          parLevelBase: row.parLevelBase,
          lowThresholdPct: row.lowThresholdPct,
          lastVerifiedAt: row.lastVerifiedAt,
          unverifiedCookCount: row.unverifiedCookCount,
          openedAt: row.openedAt,
          expiresAt: row.expiresAt,
          updatedAt: row.updatedAt,
          isNegative: row.isNegative,
        },
      });

    return mapPantryItem(row);
  }

  // ── Ledger ──────────────────────────────────────────────────────────────

  /**
   * Append a txn and recompute the projection with `foldLedger` from core.
   * Duplicate (householdId, clientTxnId) is ignored; projection still
   * re-read / re-folded for consistency.
   */
  async appendTxn(input: AppendTxnInput): Promise<AppendTxnResult> {
    const id = input.id ?? newId('txn');
    const insertValues = {
      id,
      clientTxnId: input.clientTxnId,
      householdId: input.householdId,
      ingredientId: input.ingredientId,
      formId: input.formId,
      kind: input.kind,
      deltaBase: input.kind === 'relative' ? input.deltaBase : null,
      targetBase: input.kind === 'absolute' ? input.targetBase : null,
      basisCursor: input.kind === 'absolute' ? (input.basisCursor ?? null) : null,
      reason: input.reason,
      refId: input.refId ?? null,
      unitPrice: input.unitPrice ?? null,
      occurredAt: input.occurredAt,
      acceptedAt: input.acceptedAt ?? null,
      deviceId: input.deviceId,
      userId: input.userId,
    };

    let inserted = true;
    try {
      await this.db.insert(pantryTxns).values(insertValues);
    } catch (err) {
      // Unique violation on (household_id, client_txn_id) — idempotent replay.
      const message = err instanceof Error ? err.message : String(err);
      if (
        /unique|UNIQUE|constraint/i.test(message) ||
        message.includes('pantry_txn_household_client')
      ) {
        inserted = false;
      } else {
        throw err;
      }
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
    const txnRows = await this.db
      .select()
      .from(pantryTxns)
      .where(
        and(
          eq(pantryTxns.householdId, householdId),
          eq(pantryTxns.ingredientId, ingredientId),
        ),
      );

    // Fold is per ingredient (all forms share one log in core fold for
    // that ingredientId). Filter to form when present — SPEC fold is per
    // ingredient; formId is on each txn. We fold all txns for the
    // ingredient, then write the projection row for the form of the
    // latest/current formId (caller form).
    const txns: PantryTxn[] = txnRows.map(mapTxnRow);
    const fold = foldLedger(txns);

    const formRows = await this.db
      .select()
      .from(ingredientForms)
      .where(eq(ingredientForms.id, formId))
      .limit(1);
    const form = formRows[0];
    const dim: Dimension = form ? asDim(form.dim) : 'mass';

    const existing = await this.getPantryItem(ingredientId, formId, householdId);
    const now = new Date().toISOString();

    const row = {
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

    await this.db
      .insert(pantryItems)
      .values(row)
      .onConflictDoUpdate({
        target: [
          pantryItems.householdId,
          pantryItems.ingredientId,
          pantryItems.formId,
        ],
        set: {
          qtyBase: row.qtyBase,
          dim: row.dim,
          lastVerifiedAt: row.lastVerifiedAt,
          unverifiedCookCount: row.unverifiedCookCount,
          updatedAt: row.updatedAt,
          watermarkCursor: row.watermarkCursor,
          lastAbsoluteCursor: row.lastAbsoluteCursor,
          isNegative: row.isNegative,
          conflict: row.conflict,
          // preserve location / par / expiry / opened from existing via not overwriting when absent
          locationId: row.locationId,
          parLevelBase: row.parLevelBase,
          lowThresholdPct: row.lowThresholdPct,
          openedAt: row.openedAt,
          expiresAt: row.expiresAt,
        },
      });

    return mapPantryItem(row);
  }

  async listTxnsForIngredient(
    ingredientId: string,
    householdId: string = DEFAULT_HOUSEHOLD_ID,
  ): Promise<PantryTxn[]> {
    const rows = await this.db
      .select()
      .from(pantryTxns)
      .where(
        and(
          eq(pantryTxns.householdId, householdId),
          eq(pantryTxns.ingredientId, ingredientId),
        ),
      );
    return rows.map(mapTxnRow);
  }

  /**
   * Verify every projection against foldLedger and rewrite drift.
   * Used by Settings → Diagnostics and (gated) app startup.
   * Pass `force: true` for the manual Diagnostics action.
   */
  async verifyAndRepairProjections(
    options: { householdId?: string; force?: boolean } = {},
  ): Promise<ProjectionRepairResult> {
    return maybeRepairProjectionsOnStartup(
      this.db,
      (householdId, ingredientId, formId) =>
        this.recomputeProjection(householdId, ingredientId, formId),
      options,
    );
  }

  // ── Recipes ─────────────────────────────────────────────────────────────

  async listRecipes(
    householdId?: string | null,
  ): Promise<RecipeSummary[]> {
    const rows =
      householdId != null && householdId !== ''
        ? await this.db
            .select()
            .from(recipes)
            .where(
              or(
                eq(recipes.householdId, householdId),
                sql`${recipes.householdId} IS NULL`,
              ),
            )
            .orderBy(asc(recipes.title))
        : await this.db.select().from(recipes).orderBy(asc(recipes.title));

    return rows.map((r) => {
      const tags = parseJsonArray(r.tags);
      const authorId = r.authorId ?? null;
      const householdId = r.householdId ?? null;
      return {
        id: r.id,
        householdId,
        title: r.title,
        servings: r.servings,
        prepMin: r.prepMin ?? null,
        cookMin: r.cookMin ?? null,
        visibility: r.visibility,
        authorId,
        tags,
        imageUrl: r.imageUrl ?? null,
        updatedAt: r.updatedAt,
        source: recipeSource({ householdId, authorId, tags }),
      };
    });
  }

  async getRecipe(id: string): Promise<RecipeDetail | null> {
    const recipeRows = await this.db
      .select()
      .from(recipes)
      .where(eq(recipes.id, id))
      .limit(1);
    const r = recipeRows[0];
    if (!r) return null;

    const lines = await this.db
      .select()
      .from(recipeLines)
      .where(eq(recipeLines.recipeId, id))
      .orderBy(asc(recipeLines.sortOrder));

    const steps = await this.db
      .select()
      .from(recipeSteps)
      .where(eq(recipeSteps.recipeId, id))
      .orderBy(asc(recipeSteps.sortOrder));

    const tags = parseJsonArray(r.tags);
    const authorId = r.authorId ?? null;
    const householdId = r.householdId ?? null;

    return {
      id: r.id,
      householdId,
      title: r.title,
      servings: r.servings,
      prepMin: r.prepMin ?? null,
      cookMin: r.cookMin ?? null,
      visibility: r.visibility,
      authorId,
      tags,
      imageUrl: r.imageUrl ?? null,
      updatedAt: r.updatedAt,
      source: recipeSource({ householdId, authorId, tags }),
      yieldNote: r.yieldNote ?? null,
      forkedFrom: r.forkedFrom ?? null,
      createdAt: r.createdAt,
      ingredients: lines.map((line) => ({
        id: line.id,
        sortOrder: line.sortOrder,
        ingredientId: line.ingredientId ?? undefined,
        formId: line.formId ?? undefined,
        rawText: line.rawText,
        qty: line.qty,
        unit: line.unit,
        optional: Boolean(line.optional),
        group: line.groupId ?? undefined,
        substitutes: parseJsonArray(line.substitutes),
        unknownAllergens: Boolean(line.unknownAllergens),
        nonQuantified: Boolean(line.nonQuantified),
        qtyHigh: line.qtyHigh ?? undefined,
        qtyLow: line.qtyLow ?? undefined,
        isRange: Boolean(line.isRange),
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
    await this.db.insert(recipes).values({
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
    });

    await this.replaceRecipeChildren(id, input);
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
    const now = new Date().toISOString();
    await this.db
      .update(recipes)
      .set({
        householdId: input.householdId ?? existing.householdId,
        title: input.title,
        servings: input.servings,
        yieldNote: input.yieldNote ?? null,
        prepMin: input.prepMin ?? null,
        cookMin: input.cookMin ?? null,
        authorId: input.authorId ?? existing.authorId,
        visibility: input.visibility ?? existing.visibility,
        forkedFrom: input.forkedFrom ?? existing.forkedFrom,
        tags: stringifyJsonArray(input.tags ?? existing.tags),
        imageUrl: input.imageUrl ?? existing.imageUrl,
        updatedAt: now,
      })
      .where(eq(recipes.id, id));

    await this.db.delete(recipeLines).where(eq(recipeLines.recipeId, id));
    await this.db.delete(recipeSteps).where(eq(recipeSteps.recipeId, id));
    await this.replaceRecipeChildren(id, input);
    return this.getRecipe(id);
  }

  async deleteRecipe(id: string): Promise<boolean> {
    await this.db.delete(recipeLines).where(eq(recipeLines.recipeId, id));
    await this.db.delete(recipeSteps).where(eq(recipeSteps.recipeId, id));
    await this.db.delete(recipes).where(eq(recipes.id, id));
    return true;
  }

  private async replaceRecipeChildren(
    recipeId: string,
    input: RecipeWrite,
  ): Promise<void> {
    if (input.ingredients.length > 0) {
      await this.db.insert(recipeLines).values(
        input.ingredients.map((line, i) => ({
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
        })),
      );
    }

    if (input.steps.length > 0) {
      await this.db.insert(recipeSteps).values(
        input.steps.map((step, i) => ({
          id: newId('rstep'),
          recipeId,
          sortOrder: i,
          text: step.text,
          durationSec: step.durationSec ?? null,
          timerLabel: step.timerLabel ?? null,
        })),
      );
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

    await this.db.insert(groceryLists).values({
      id,
      householdId,
      shoppingTripId,
      createdAt: now,
      updatedAt: now,
    });

    if (input.items && input.items.length > 0) {
      await this.db.insert(groceryListItems).values(
        input.items.map((item, i) => ({
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
        })),
      );
    }

    const view = await this.getGroceryList(id);
    if (!view) throw new Error('Failed to read grocery list after create');
    return view;
  }

  async getGroceryList(listId: string): Promise<GroceryListView | null> {
    const listRows = await this.db
      .select()
      .from(groceryLists)
      .where(eq(groceryLists.id, listId))
      .limit(1);
    const list = listRows[0];
    if (!list) return null;

    const items = await this.db
      .select()
      .from(groceryListItems)
      .where(eq(groceryListItems.listId, listId))
      .orderBy(asc(groceryListItems.sortOrder));

    return {
      id: list.id,
      householdId: list.householdId,
      shoppingTripId: list.shoppingTripId,
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
      items: items.map(mapGroceryItem),
    };
  }

  async getActiveGroceryList(
    householdId: string = DEFAULT_HOUSEHOLD_ID,
  ): Promise<GroceryListView | null> {
    const listRows = await this.db
      .select()
      .from(groceryLists)
      .where(eq(groceryLists.householdId, householdId))
      .orderBy(sql`${groceryLists.updatedAt} DESC`)
      .limit(1);
    const list = listRows[0];
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

    await this.db
      .delete(groceryListItems)
      .where(eq(groceryListItems.listId, listId));

    if (items.length > 0) {
      await this.db.insert(groceryListItems).values(
        items.map((item, i) => ({
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
        })),
      );
    }

    await this.db
      .update(groceryLists)
      .set({ updatedAt: now })
      .where(eq(groceryLists.id, listId));

    return this.getGroceryList(listId);
  }

  async checkOffGroceryItem(
    itemId: string,
    checked: boolean,
  ): Promise<GroceryListItemRow | null> {
    const rows = await this.db
      .select()
      .from(groceryListItems)
      .where(eq(groceryListItems.id, itemId))
      .limit(1);
    if (!rows[0]) return null;

    await this.db
      .update(groceryListItems)
      .set({ checked })
      .where(eq(groceryListItems.id, itemId));

    await this.db
      .update(groceryLists)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(groceryLists.id, rows[0].listId));

    const updated = await this.db
      .select()
      .from(groceryListItems)
      .where(eq(groceryListItems.id, itemId))
      .limit(1);
    return updated[0] ? mapGroceryItem(updated[0]) : null;
  }

  // ── User aliases ────────────────────────────────────────────────────────

  async listUserAliases(
    householdId: string = DEFAULT_HOUSEHOLD_ID,
  ): Promise<UserAliasRow[]> {
    const rows = await this.db
      .select()
      .from(userAliases)
      .where(eq(userAliases.householdId, householdId));
    return rows.map((r) => ({
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
    await this.db
      .insert(userAliases)
      .values(row)
      .onConflictDoUpdate({
        target: userAliases.id,
        set: { ingredientId: input.ingredientId, alias: input.alias },
      });
    return row;
  }
}

// Re-export schema type helper for drivers that open drizzle with schema.
export { schema };
