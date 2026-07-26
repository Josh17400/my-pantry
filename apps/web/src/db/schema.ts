/**
 * Drizzle schema for The Good Pantry local SQLite (native).
 * Health-probe table (M0) retained; product tables model SPEC.md.
 */

import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// ── M0 health probe (must stay) ─────────────────────────────────────────────

/**
 * Health-check table only — not product domain.
 * Exercises create / insert / read / aggregate / drop for the shell proof.
 */
export const healthProbe = sqliteTable(
  'm0_health_probe',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    value: integer('value').notNull(),
    label: text('label').notNull(),
  },
  (table) => [index('m0_health_probe_value_idx').on(table.value)],
);

export type HealthProbeRow = typeof healthProbe.$inferSelect;

// ── App / seed metadata ─────────────────────────────────────────────────────

/** Key-value store for seed version, defaults flags, etc. */
export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// ── Locations (user-defined, nestable — not an enum) ────────────────────────

export const locations = sqliteTable(
  'locations',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    name: text('name').notNull(),
    icon: text('icon').notNull(),
    tint: text('tint').notNull(),
    parentId: text('parent_id'),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [
    index('locations_household_idx').on(t.householdId),
    index('locations_parent_idx').on(t.householdId, t.parentId),
  ],
);

// ── Canonical ingredient catalog (seeded from @larder/core) ─────────────────

export const ingredients = sqliteTable(
  'ingredients',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    /** JSON array of Allergen strings. */
    allergens: text('allergens').notNull(),
    isStaple: integer('is_staple', { mode: 'boolean' }).notNull(),
    defaultFormId: text('default_form_id').notNull(),
  },
  (t) => [index('ingredients_name_idx').on(t.name)],
);

export const ingredientForms = sqliteTable(
  'ingredient_forms',
  {
    id: text('id').primaryKey(),
    ingredientId: text('ingredient_id').notNull(),
    form: text('form').notNull(),
    dim: text('dim').notNull(), // mass | volume | count
    densityGPerMl: real('density_g_per_ml'),
    gramsPerCount: real('grams_per_count'),
    uncertaintyPct: real('uncertainty_pct').notNull(),
  },
  (t) => [index('ingredient_forms_ingredient_idx').on(t.ingredientId)],
);

export const conversionEdges = sqliteTable(
  'conversion_edges',
  {
    fromFormId: text('from_form_id').notNull(),
    toFormId: text('to_form_id').notNull(),
    factor: real('factor').notNull(),
    uncertaintyPct: real('uncertainty_pct').notNull(),
    source: text('source').notNull(),
    oneWay: integer('one_way', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.fromFormId, t.toFormId] }),
    index('conversion_edges_to_idx').on(t.toFormId),
  ],
);

export const packageSpecs = sqliteTable(
  'package_specs',
  {
    formId: text('form_id').notNull(),
    label: text('label').notNull(),
    netG: real('net_g').notNull(),
    drainedG: real('drained_g'),
  },
  (t) => [
    primaryKey({ columns: [t.formId, t.label] }),
    index('package_specs_form_idx').on(t.formId),
  ],
);

// ── Pantry projection (cache — source of truth is the ledger) ───────────────

export const pantryItems = sqliteTable(
  'pantry_items',
  {
    householdId: text('household_id').notNull(),
    ingredientId: text('ingredient_id').notNull(),
    formId: text('form_id').notNull(),
    locationId: text('location_id'),
    qtyBase: real('qty_base').notNull(),
    dim: text('dim').notNull(),
    parLevelBase: real('par_level_base').notNull(),
    lowThresholdPct: real('low_threshold_pct').notNull(),
    lastVerifiedAt: text('last_verified_at'),
    unverifiedCookCount: integer('unverified_cook_count').notNull().default(0),
    openedAt: text('opened_at'),
    expiresAt: text('expires_at'),
    updatedAt: text('updated_at').notNull(),
    /** Fold watermark cursor — last txn folded into this row. */
    watermarkCursor: text('watermark_cursor'),
    lastAbsoluteCursor: text('last_absolute_cursor'),
    isNegative: integer('is_negative', { mode: 'boolean' }).notNull().default(false),
    conflict: integer('conflict', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.householdId, t.ingredientId, t.formId] }),
    index('pantry_items_location_idx').on(t.householdId, t.locationId),
    index('pantry_items_ingredient_idx').on(t.householdId, t.ingredientId),
  ],
);

// ── Append-only ledger ──────────────────────────────────────────────────────

export const pantryTxns = sqliteTable(
  'pantry_txns',
  {
    id: text('id').primaryKey(),
    clientTxnId: text('client_txn_id').notNull(),
    householdId: text('household_id').notNull(),
    ingredientId: text('ingredient_id').notNull(),
    formId: text('form_id').notNull(),
    kind: text('kind').notNull(), // relative | absolute
    deltaBase: real('delta_base'),
    targetBase: real('target_base'),
    basisCursor: text('basis_cursor'),
    reason: text('reason').notNull(),
    refId: text('ref_id'),
    unitPrice: real('unit_price'),
    occurredAt: text('occurred_at').notNull(),
    acceptedAt: text('accepted_at'),
    deviceId: text('device_id').notNull(),
    userId: text('user_id').notNull(),
  },
  (t) => [
    // SPEC: pantry_txn(household_id, client_txn_id) UNIQUE
    uniqueIndex('pantry_txn_household_client_uidx').on(t.householdId, t.clientTxnId),
    // SPEC: (household_id, ingredient_id, occurred_at)
    index('pantry_txn_household_ingredient_occurred_idx').on(
      t.householdId,
      t.ingredientId,
      t.occurredAt,
    ),
    // SPEC: (household_id, accepted_at) for the sync cursor
    index('pantry_txn_household_accepted_idx').on(t.householdId, t.acceptedAt),
  ],
);

// ── Recipes ─────────────────────────────────────────────────────────────────

export const recipes = sqliteTable(
  'recipes',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id'),
    title: text('title').notNull(),
    servings: real('servings').notNull(),
    yieldNote: text('yield_note'),
    prepMin: integer('prep_min'),
    cookMin: integer('cook_min'),
    authorId: text('author_id'),
    visibility: text('visibility').notNull().default('private'),
    forkedFrom: text('forked_from'),
    /** JSON string array. */
    tags: text('tags'),
    imageUrl: text('image_url'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('recipes_household_idx').on(t.householdId),
    index('recipes_title_idx').on(t.title),
  ],
);

export const recipeLines = sqliteTable(
  'recipe_lines',
  {
    id: text('id').primaryKey(),
    recipeId: text('recipe_id').notNull(),
    sortOrder: integer('sort_order').notNull(),
    ingredientId: text('ingredient_id'),
    formId: text('form_id'),
    rawText: text('raw_text').notNull(),
    qty: real('qty'),
    unit: text('unit'),
    optional: integer('optional', { mode: 'boolean' }).notNull().default(false),
    groupId: text('group_id'),
    /** JSON string array of substitute ingredient ids. */
    substitutes: text('substitutes'),
    unknownAllergens: integer('unknown_allergens', { mode: 'boolean' })
      .notNull()
      .default(false),
    nonQuantified: integer('non_quantified', { mode: 'boolean' }).notNull().default(false),
    qtyHigh: real('qty_high'),
    qtyLow: real('qty_low'),
    isRange: integer('is_range', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('recipe_lines_recipe_idx').on(t.recipeId, t.sortOrder)],
);

export const recipeSteps = sqliteTable(
  'recipe_steps',
  {
    id: text('id').primaryKey(),
    recipeId: text('recipe_id').notNull(),
    sortOrder: integer('sort_order').notNull(),
    text: text('text').notNull(),
    durationSec: integer('duration_sec'),
    timerLabel: text('timer_label'),
  },
  (t) => [index('recipe_steps_recipe_idx').on(t.recipeId, t.sortOrder)],
);

// ── Grocery lists ───────────────────────────────────────────────────────────

export const groceryLists = sqliteTable(
  'grocery_lists',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    shoppingTripId: text('shopping_trip_id').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('grocery_lists_household_idx').on(t.householdId),
    index('grocery_lists_trip_idx').on(t.shoppingTripId),
  ],
);

export const groceryListItems = sqliteTable(
  'grocery_list_items',
  {
    id: text('id').primaryKey(),
    listId: text('list_id').notNull(),
    shoppingTripId: text('shopping_trip_id').notNull(),
    ingredientId: text('ingredient_id'),
    formId: text('form_id'),
    name: text('name').notNull(),
    category: text('category').notNull(),
    qtyBase: real('qty_base'),
    dim: text('dim'),
    displayQty: text('display_qty').notNull(),
    /** JSON array of GrocerySourceKind. */
    sources: text('sources'),
    /** JSON array of recipe ids. */
    recipeIds: text('recipe_ids'),
    checked: integer('checked', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    notes: text('notes'),
  },
  (t) => [
    index('grocery_list_items_list_idx').on(t.listId, t.sortOrder),
    index('grocery_list_items_trip_idx').on(t.shoppingTripId),
  ],
);

// ── Learned ingredient aliases (user/household scoped) ──────────────────────

export const userAliases = sqliteTable(
  'user_aliases',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id').notNull(),
    alias: text('alias').notNull(),
    ingredientId: text('ingredient_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('user_aliases_household_alias_uidx').on(t.householdId, t.alias),
    index('user_aliases_ingredient_idx').on(t.ingredientId),
  ],
);

// ── Schema bundle for drizzle clients ───────────────────────────────────────

export const schema = {
  healthProbe,
  appMeta,
  locations,
  ingredients,
  ingredientForms,
  conversionEdges,
  packageSpecs,
  pantryItems,
  pantryTxns,
  recipes,
  recipeLines,
  recipeSteps,
  groceryLists,
  groceryListItems,
  userAliases,
};

export type AppSchema = typeof schema;
