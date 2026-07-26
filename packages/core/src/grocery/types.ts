/**
 * Grocery list types — multi-source merge, aggregation, aisle grouping.
 *
 * shoppingTripId links check-off to a later receipt so track D can reconcile
 * instead of double-adding. This module only carries the id.
 */

import type { Dimension, Ingredient, IngredientForm } from '../domain/types';
import type { ConversionEdge } from '../domain/types';
import type { CookPlan } from '../recipes/types';
import type { StockEvaluation } from '../pantry/types';

// ── Sources ─────────────────────────────────────────────────────────────────

export type GrocerySourceKind =
  | 'manual'
  | 'stock-low'
  | 'stock-out'
  | 'recipe-shortfall'
  | 'reorder';

/**
 * One contribution to the grocery list.
 * Quantities may be in display units (qty + unit) or already in base (qtyBase + dim).
 * Ranges: set isRange / qtyHigh — buildList uses **high** for purchase quantity.
 */
export type GrocerySource = {
  readonly kind: GrocerySourceKind;
  readonly ingredientId?: string;
  readonly formId?: string;
  /** Display name when ingredient catalog is not available. */
  readonly name?: string;
  /** Aisle / category override; else looked up from Ingredient.category. */
  readonly category?: string;
  /** Display-unit quantity (midpoint for ranges). */
  readonly qty?: number | null;
  readonly unit?: string | null;
  readonly qtyHigh?: number;
  readonly qtyLow?: number;
  readonly isRange?: boolean;
  /** Already-converted base quantity (preferred when present). */
  readonly qtyBase?: number;
  readonly dim?: Dimension;
  readonly recipeId?: string;
  readonly recipeTitle?: string;
  readonly rawText?: string;
  readonly note?: string;
  /** Optional stable id for the source contribution. */
  readonly sourceId?: string;
};

// ── List lines ──────────────────────────────────────────────────────────────

export type GroceryListLine = {
  /**
   * Deterministic id for the aggregated line
   * (ingredientId+formId+dim or free-text key).
   */
  readonly id: string;
  readonly ingredientId?: string;
  readonly formId?: string;
  readonly name: string;
  /** Aisle group key from Ingredient.category (or "Other"). */
  readonly category: string;
  /**
   * Total purchase quantity in base units when all contributions converted.
   * null when the line is non-quantified free text.
   */
  readonly qtyBase: number | null;
  readonly dim: Dimension | null;
  /** Human display via formatQuantity in purchase units ("2 lb", not "907 g"). */
  readonly displayQty: string;
  readonly sources: readonly GrocerySourceKind[];
  readonly recipeIds: readonly string[];
  /**
   * True when this line shares an ingredient with another line that could not
   * be converted into a common form — kept separate on purpose.
   */
  readonly unmerged: boolean;
  readonly unmergedReason?: string;
  readonly notes: readonly string[];
};

export type GroceryAisleGroup = {
  readonly aisle: string;
  readonly lines: readonly GroceryListLine[];
};

export type GroceryList = {
  /**
   * Opaque trip id — receipt reconciliation (track D) matches against this
   * instead of double-adding. This module does not implement reconciliation.
   */
  readonly shoppingTripId: string;
  readonly lines: readonly GroceryListLine[];
  readonly byAisle: readonly GroceryAisleGroup[];
  /** Injected clock ISO string. */
  readonly createdAt: string;
};

// ── buildList input ─────────────────────────────────────────────────────────

export type BuildListOptions = {
  readonly sources: readonly GrocerySource[];
  readonly shoppingTripId: string;
  /**
   * Injected clock (ISO string). Required — no Date.now() inside the module.
   */
  readonly now: string;
  readonly forms?: readonly IngredientForm[];
  readonly edges?: readonly ConversionEdge[];
  /** For name + aisle (category) lookup. */
  readonly ingredients?: readonly Ingredient[];
  /** formatQuantity locale. Default 'us'. */
  readonly locale?: 'us' | 'metric';
};

/** Stock evaluation row with identity for grocery sourcing. */
export type StockGroceryInput = {
  readonly ingredientId: string;
  readonly formId: string;
  readonly evaluation: StockEvaluation;
  readonly name?: string;
  readonly category?: string;
  /**
   * Suggested purchase qty in base units (e.g. par − qty, or package size).
   * Defaults to parLevelBase when status is low/out.
   */
  readonly suggestedQtyBase?: number;
  readonly dim: Dimension;
};

export type ReorderSuggestion = {
  readonly ingredientId: string;
  readonly formId: string;
  readonly suggestedQtyBase: number;
  readonly dim: Dimension;
  readonly name?: string;
  readonly category?: string;
  readonly note?: string;
  readonly cadenceDays?: number;
};

export type RecipeShortfallInput = {
  readonly recipeId: string;
  readonly recipeTitle?: string;
  readonly plan: CookPlan;
  /** Optional name/category maps. */
  readonly ingredientNames?: ReadonlyMap<string, string>;
  readonly ingredientCategories?: ReadonlyMap<string, string>;
};
