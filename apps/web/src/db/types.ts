/**
 * App-layer row types for repositories and Zustand stores.
 * Domain correctness types (PantryTxn, Recipe, …) come from @larder/core.
 */

import type { AbsoluteReason, Dimension, RelativeReason } from '@larder/core';

/** Mirrors packages/core RecipeVisibility (not on public core root export). */
export type RecipeVisibility = 'private' | 'household' | 'public';

export type LocationRow = {
  id: string;
  householdId: string;
  name: string;
  icon: string;
  tint: string;
  parentId: string | null;
  sortOrder: number;
};

export type IngredientRow = {
  id: string;
  name: string;
  category: string;
  allergens: string[];
  isStaple: boolean;
  defaultFormId: string;
};

export type IngredientFormRow = {
  id: string;
  ingredientId: string;
  form: string;
  dim: Dimension;
  densityGPerMl: number | null;
  gramsPerCount: number | null;
  uncertaintyPct: number;
};

export type PantryItemRow = {
  householdId: string;
  ingredientId: string;
  formId: string;
  locationId: string | null;
  qtyBase: number;
  dim: Dimension;
  parLevelBase: number;
  lowThresholdPct: number;
  lastVerifiedAt: string | null;
  unverifiedCookCount: number;
  openedAt: string | null;
  expiresAt: string | null;
  updatedAt: string;
  watermarkCursor: string | null;
  lastAbsoluteCursor: string | null;
  isNegative: boolean;
  conflict: boolean;
};

/** Projection row joined with ingredient name for list UIs. */
export type PantryItemView = PantryItemRow & {
  ingredientName: string;
  formName: string | null;
  locationName: string | null;
};

export type PantryItemUpsert = {
  householdId: string;
  ingredientId: string;
  formId: string;
  locationId?: string | null;
  qtyBase: number;
  dim: Dimension;
  parLevelBase?: number;
  lowThresholdPct?: number;
  lastVerifiedAt?: string | null;
  unverifiedCookCount?: number;
  openedAt?: string | null;
  expiresAt?: string | null;
};

export type AppendTxnInput =
  | {
      id?: string;
      clientTxnId: string;
      householdId: string;
      ingredientId: string;
      formId: string;
      kind: 'relative';
      reason: RelativeReason;
      deltaBase: number;
      refId?: string;
      unitPrice?: number;
      occurredAt: string;
      acceptedAt?: string;
      deviceId: string;
      userId: string;
    }
  | {
      id?: string;
      clientTxnId: string;
      householdId: string;
      ingredientId: string;
      formId: string;
      kind: 'absolute';
      reason: AbsoluteReason;
      targetBase: number;
      basisCursor?: string;
      refId?: string;
      unitPrice?: number;
      occurredAt: string;
      acceptedAt?: string;
      deviceId: string;
      userId: string;
    };

export type AppendTxnResult = {
  /** False when clientTxnId already existed (idempotent no-op insert). */
  inserted: boolean;
  item: PantryItemRow;
  foldQtyBase: number;
};

export type RecipeLineInput = {
  ingredientId?: string;
  formId?: string;
  rawText: string;
  qty?: number | null;
  unit?: string | null;
  optional?: boolean;
  group?: string;
  substitutes?: readonly string[];
  unknownAllergens?: boolean;
  nonQuantified?: boolean;
  qtyHigh?: number;
  qtyLow?: number;
  isRange?: boolean;
};

export type RecipeStepInput = {
  text: string;
  durationSec?: number;
  timerLabel?: string;
};

export type RecipeWrite = {
  id?: string;
  householdId?: string | null;
  title: string;
  servings: number;
  yieldNote?: string | null;
  prepMin?: number | null;
  cookMin?: number | null;
  authorId?: string | null;
  visibility?: RecipeVisibility;
  forkedFrom?: string | null;
  tags?: readonly string[];
  imageUrl?: string | null;
  ingredients: readonly RecipeLineInput[];
  steps: readonly RecipeStepInput[];
};

export type RecipeSummary = {
  id: string;
  householdId: string | null;
  title: string;
  servings: number;
  prepMin: number | null;
  cookMin: number | null;
  visibility: string;
  /**
   * Present when loaded from the repository. Optional on hand-built demo fixtures.
   * System catalogue author is `good-pantry`.
   */
  authorId?: string | null;
  tags: string[];
  imageUrl: string | null;
  updatedAt: string;
  /**
   * App-layer source marker. `catalog` = starter catalogue (Browse).
   * Derived from author/tags/household — not a DB column. Optional on fixtures.
   */
  source?: 'catalog' | 'user';
};

export type RecipeDetail = RecipeSummary & {
  yieldNote: string | null;
  authorId: string | null;
  forkedFrom: string | null;
  createdAt: string;
  ingredients: (RecipeLineInput & {
      id: string;
      sortOrder: number;
    })[];
  steps: (RecipeStepInput & {
      id: string;
      sortOrder: number;
    })[];
};

export type GroceryListItemInput = {
  id?: string;
  ingredientId?: string | null;
  formId?: string | null;
  name: string;
  category: string;
  qtyBase?: number | null;
  dim?: Dimension | null;
  displayQty: string;
  sources?: readonly string[];
  recipeIds?: readonly string[];
  checked?: boolean;
  sortOrder?: number;
  notes?: string | null;
};

export type GroceryListItemRow = {
  id: string;
  listId: string;
  shoppingTripId: string;
  ingredientId: string | null;
  formId: string | null;
  name: string;
  category: string;
  qtyBase: number | null;
  dim: Dimension | null;
  displayQty: string;
  sources: string[];
  recipeIds: string[];
  checked: boolean;
  sortOrder: number;
  notes: string | null;
};

export type GroceryListView = {
  id: string;
  householdId: string;
  shoppingTripId: string;
  createdAt: string;
  updatedAt: string;
  items: GroceryListItemRow[];
};

export type UserAliasRow = {
  id: string;
  householdId: string;
  alias: string;
  ingredientId: string;
  createdAt: string;
};

export type LocationWrite = {
  id?: string;
  householdId: string;
  name: string;
  icon?: string;
  tint?: string;
  parentId?: string | null;
  sortOrder?: number;
};
