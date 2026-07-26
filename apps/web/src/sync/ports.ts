/**
 * Ports for sync — local SQLite and remote Supabase.
 * Implementations live in local-store.ts and remote.ts; tests inject fakes.
 */

import type {
  LocalLocation,
  LocalPantryItem,
  LocalRecipe,
  LocalRecipeLine,
  LocalRecipeStep,
  LocalTxnRow,
  PullPageResult,
  PushResult,
  RemoteTxnInsert,
  RemoteTxnRow,
} from './types';

export type SyncLocalPort = {
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;

  listUnackedTxns(householdId: string): Promise<LocalTxnRow[]>;
  markTxnAccepted(
    householdId: string,
    clientTxnId: string,
    acceptedAt: string,
  ): Promise<void>;
  getTxnByClientId(
    householdId: string,
    clientTxnId: string,
  ): Promise<LocalTxnRow | null>;
  /**
   * Insert txn if (householdId, clientTxnId) absent.
   * Returns whether a row was inserted.
   */
  insertTxnIfAbsent(row: LocalTxnRow): Promise<'inserted' | 'exists'>;
  listTxnsForIngredient(
    householdId: string,
    ingredientId: string,
  ): Promise<LocalTxnRow[]>;

  getPantryItem(
    householdId: string,
    ingredientId: string,
    formId: string,
  ): Promise<LocalPantryItem | null>;
  /**
   * Upsert projection qty + fold watermarks / conflict flags.
   * Preserves metadata (par, location, expiry) unless provided.
   */
  upsertProjection(item: LocalPantryItem): Promise<void>;
  /**
   * Apply LWW metadata fields only — does not overwrite qty from fold.
   */
  applyPantryMetadataLww(
    remote: LocalPantryItem,
    opts: { remoteWins: boolean },
  ): Promise<'applied' | 'kept_local' | 'inserted'>;

  listLocations(householdId: string): Promise<LocalLocation[]>;
  upsertLocation(loc: LocalLocation): Promise<void>;

  listRecipes(householdId: string): Promise<LocalRecipe[]>;
  getRecipeBundle(recipeId: string): Promise<{
    recipe: LocalRecipe;
    lines: LocalRecipeLine[];
    steps: LocalRecipeStep[];
  } | null>;
  replaceRecipeBundle(bundle: {
    recipe: LocalRecipe;
    lines: LocalRecipeLine[];
    steps: LocalRecipeStep[];
  }): Promise<void>;

  listAllRecipeIds(householdId: string): Promise<string[]>;
};

export type SyncRemotePort = {
  /**
   * Resolve household ids for the authenticated user.
   * Throws SyncSchemaMissingError when tables are absent.
   */
  myHouseholdIds(): Promise<string[]>;

  pushTxns(rows: RemoteTxnInsert[]): Promise<PushResult>;

  pullTxns(
    householdId: string,
    cursor: string,
    pageSize: number,
  ): Promise<PullPageResult>;

  pullLocations(householdId: string): Promise<
    {
      id: string;
      household_id: string;
      name: string;
      icon: string;
      tint: string;
      parent_id: string | null;
      sort_order: number;
    }[]
  >;

  pullRecipes(householdId: string): Promise<
    {
      id: string;
      household_id: string | null;
      title: string;
      servings: number;
      yield_note: string | null;
      prep_min: number | null;
      cook_min: number | null;
      author_id: string | null;
      visibility: string;
      forked_from: string | null;
      tags: unknown;
      image_url: string | null;
      created_at: string;
      updated_at: string;
    }[]
  >;

  pullRecipeLines(recipeId: string): Promise<
    {
      id: string;
      recipe_id: string;
      sort_order: number;
      ingredient_id: string | null;
      form_id: string | null;
      raw_text: string;
      qty: number | null;
      unit: string | null;
      optional: boolean;
      group_id: string | null;
      substitutes: unknown;
      unknown_allergens: boolean;
      non_quantified: boolean;
      qty_high: number | null;
      qty_low: number | null;
      is_range: boolean;
    }[]
  >;

  pullRecipeSteps(recipeId: string): Promise<
    {
      id: string;
      recipe_id: string;
      sort_order: number;
      text: string;
      duration_sec: number | null;
      timer_label: string | null;
    }[]
  >;

  pullPantryItemsMeta(householdId: string): Promise<
    {
      household_id: string;
      ingredient_id: string;
      form_id: string;
      location_id: string | null;
      qty_base: number;
      dim: string;
      par_level_base: number;
      low_threshold_pct: number;
      last_verified_at: string | null;
      unverified_cook_count: number;
      opened_at: string | null;
      expires_at: string | null;
      updated_at: string;
      watermark_cursor: string | null;
      last_absolute_cursor: string | null;
      is_negative: boolean;
      conflict: boolean;
    }[]
  >;

  upsertLocations(
    rows: {
      id: string;
      household_id: string;
      name: string;
      icon: string;
      tint: string;
      parent_id: string | null;
      sort_order: number;
    }[],
  ): Promise<void>;

  upsertRecipes(
    rows: {
      id: string;
      household_id: string | null;
      title: string;
      servings: number;
      yield_note: string | null;
      prep_min: number | null;
      cook_min: number | null;
      author_id: string | null;
      visibility: string;
      forked_from: string | null;
      tags: unknown;
      image_url: string | null;
      created_at: string;
      updated_at: string;
    }[],
  ): Promise<void>;

  replaceRecipeChildren(
    recipeId: string,
    lines: {
      id: string;
      recipe_id: string;
      sort_order: number;
      ingredient_id: string | null;
      form_id: string | null;
      raw_text: string;
      qty: number | null;
      unit: string | null;
      optional: boolean;
      group_id: string | null;
      substitutes: unknown;
      unknown_allergens: boolean;
      non_quantified: boolean;
      qty_high: number | null;
      qty_low: number | null;
      is_range: boolean;
    }[],
    steps: {
      id: string;
      recipe_id: string;
      sort_order: number;
      text: string;
      duration_sec: number | null;
      timer_label: string | null;
    }[],
  ): Promise<void>;
};

/** Ensure RemoteTxnRow shape from loosely typed JSON. */
export function assertRemoteTxnRow(value: unknown): RemoteTxnRow {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid pantry_txns row');
  }
  const r = value as Record<string, unknown>;
  const kind = r.kind;
  if (kind !== 'relative' && kind !== 'absolute') {
    throw new Error(`Invalid pantry_txns.kind: ${String(kind)}`);
  }
  return {
    id: String(r.id),
    client_txn_id: String(r.client_txn_id),
    household_id: String(r.household_id),
    ingredient_id: String(r.ingredient_id),
    form_id: String(r.form_id),
    kind,
    delta_base: r.delta_base == null ? null : Number(r.delta_base),
    target_base: r.target_base == null ? null : Number(r.target_base),
    basis_cursor: r.basis_cursor == null ? null : String(r.basis_cursor),
    reason: String(r.reason),
    ref_id: r.ref_id == null ? null : String(r.ref_id),
    unit_price: r.unit_price == null ? null : Number(r.unit_price),
    occurred_at: String(r.occurred_at),
    accepted_at: String(r.accepted_at),
    device_id: String(r.device_id),
    user_id: String(r.user_id),
  };
}
