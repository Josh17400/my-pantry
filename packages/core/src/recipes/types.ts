/**
 * Recipe domain types — scaling, cook planning, cook-now matching.
 *
 * Shapes follow SPEC.md. Unmatched free-text lines carry unknownAllergens: true.
 * Nothing in this module writes pantry transactions — planCook is a pure preview.
 */

import type { Dimension } from '../domain/types';
import type { ConversionEdge, IngredientForm } from '../domain/types';

// ── Recipe model ────────────────────────────────────────────────────────────

export type RecipeStep = {
  readonly text: string;
  readonly durationSec?: number;
  readonly timerLabel?: string;
};

/**
 * One ingredient line on a recipe.
 *
 * - Unmatched free text: omit `ingredientId`, set `unknownAllergens: true`.
 * - Non-quantified ("to taste", "a pinch"): `qty`/`unit` null, or `nonQuantified: true`.
 * - Ranges: store midpoint in `qty`, high in `qtyHigh` (grocery uses high).
 * - Substitution: share a `group` id, and/or list `substitutes` ingredient ids.
 */
export type RecipeLine = {
  readonly ingredientId?: string;
  readonly formId?: string;
  readonly rawText: string;
  /**
   * Quantity at the recipe's stated servings.
   * For ranges this is the midpoint (deduction / display). null when non-quantified.
   */
  readonly qty: number | null;
  /** Unit id or alias. null when non-quantified. */
  readonly unit: string | null;
  readonly optional?: boolean;
  /**
   * Substitution group id. Any satisfied member satisfies the whole group
   * for cook-planning purposes (optional lines never block).
   */
  readonly group?: string;
  /** Alternative ingredient ids that can stand in for this line. */
  readonly substitutes?: readonly string[];
  /**
   * True when the line is unmatched free text (no canonical ingredient).
   * Recipe view and AI chef must treat unknown as unsafe, never as clear.
   */
  readonly unknownAllergens?: boolean;
  /** Explicit non-quantified flag; also inferred when qty or unit is null. */
  readonly nonQuantified?: boolean;
  /** Range high end — grocery / shortfall purchase quantity. */
  readonly qtyHigh?: number;
  readonly qtyLow?: number;
  readonly isRange?: boolean;
};

export type RecipeVisibility = 'private' | 'household' | 'public';

export type Recipe = {
  readonly id: string;
  readonly householdId?: string;
  readonly title: string;
  /** Base servings the ingredient quantities are written for. Must be > 0. */
  readonly servings: number;
  readonly yieldNote?: string;
  readonly prepMin?: number;
  readonly cookMin?: number;
  readonly ingredients: readonly RecipeLine[];
  readonly steps: readonly RecipeStep[];
  readonly authorId?: string;
  readonly visibility?: RecipeVisibility;
  readonly forkedFrom?: string;
  readonly tags?: readonly string[];
  readonly imageUrl?: string;
};

// ── Scaling ─────────────────────────────────────────────────────────────────

export type ScaledRecipeLine = RecipeLine & {
  /**
   * True when a count-dimension quantity is non-integral after scaling
   * (e.g. 2.5 eggs). Represented as-is — never silently rounded.
   * UI decides presentation (half-egg, round up, etc.).
   */
  readonly fractionalCount: boolean;
  /** Factor applied to this line (1 for non-quantified pass-through). */
  readonly scaleFactor: number;
};

export type ScaledRecipe = Omit<Recipe, 'ingredients' | 'servings'> & {
  readonly servings: number;
  readonly originalServings: number;
  readonly ingredients: readonly ScaledRecipeLine[];
};

// ── Pantry snapshot for planning (read-only input) ───────────────────────────

/**
 * Minimal pantry row for cook planning / cook-now.
 * Does not own the full PantryItem model — callers project from ledger/cache.
 */
export type PantryStockRow = {
  readonly ingredientId: string;
  readonly formId: string;
  /** Quantity in the form's base unit (g / ml / each). */
  readonly qtyBase: number;
  readonly dim: Dimension;
  /** ISO-8601 expiry when known. */
  readonly expiresAt?: string | null;
  readonly locationId?: string;
};

/** Conversion graph context shared by planCook and grocery aggregation. */
export type ConversionContext = {
  readonly forms: readonly IngredientForm[];
  readonly edges?: readonly ConversionEdge[];
};

// ── Cook plan ───────────────────────────────────────────────────────────────

/**
 * Per-line status for planCook.
 *
 * - enough — haveBase >= needBase
 * - short — convertible but haveBase < needBase
 * - not-convertible — conversion failed; NEVER treat as zero shortfall
 * - not-in-pantry — no pantry row for ingredient (and not optional)
 * - optional-missing — optional line absent or short; never blocks cook
 * - non-quantified — "to taste" / pinch; does not deduct or block
 */
export type CookLineStatus =
  | 'enough'
  | 'short'
  | 'not-convertible'
  | 'not-in-pantry'
  | 'optional-missing'
  | 'non-quantified';

export type CookPlanLine = {
  readonly line: ScaledRecipeLine;
  /**
   * Need in pantry form base units.
   * null when non-quantified or not convertible / no form to convert into.
   */
  readonly needBase: number | null;
  /** Have in the same base as needBase. null when not in pantry / not convertible. */
  readonly haveBase: number | null;
  /**
   * max(0, need − have) in base units when convertible.
   * null when not convertible / non-quantified / not-in-pantry —
   * never invent 0 for an unconvertible line.
   */
  readonly shortfallBase: number | null;
  readonly convertible: boolean;
  /** Accumulated conversion uncertainty, or null when no conversion ran. */
  readonly uncertaintyPct: number | null;
  readonly status: CookLineStatus;
  /** Pantry form used for the comparison when applicable. */
  readonly pantryFormId?: string;
  readonly needDim?: Dimension;
  /** Ingredient that actually covered the need (primary or substitute). */
  readonly satisfiedByIngredientId?: string;
  /**
   * After group resolution: true if this line's substitution group is
   * satisfied by any member (including this one).
   */
  readonly groupSatisfied?: boolean;
};

export type CookPlan = {
  readonly recipeId: string;
  readonly servings: number;
  readonly lines: readonly CookPlanLine[];
  /**
   * Required lines that still block a cook after substitution-group resolution.
   * Optional and non-quantified never appear here.
   */
  readonly blockers: readonly CookPlanLine[];
  /** True when blockers is empty. */
  readonly canCook: boolean;
  /**
   * Count of distinct required shortfalls / missing / not-convertible
   * after group resolution — used by cook-now ranking.
   */
  readonly missingCount: number;
  readonly maxUncertaintyPct: number;
};

// ── Cook-now matching ───────────────────────────────────────────────────────

export type FindCookableOptions = {
  readonly forms: readonly IngredientForm[];
  readonly edges?: readonly ConversionEdge[];
  /**
   * Injected clock for expiry ranking (ISO string, epoch ms, or Date).
   * Required so the module stays pure / testable — no Date.now() inside.
   */
  readonly now: string | number | Date;
  /** How far ahead counts as "expiring soon". Default 7 days. */
  readonly expiryHorizonMs?: number;
  /** Cap result list length after ranking. */
  readonly limit?: number;
};

export type UseUpIngredient = {
  readonly ingredientId: string;
  readonly expiresAt: string;
};

export type CookableMatch = {
  readonly recipe: Recipe;
  readonly plan: CookPlan;
  readonly fullyCookable: boolean;
  readonly missingCount: number;
  /**
   * Pantry ingredients used by this recipe that expire within the horizon.
   * Powers "Use up: spinach, garlic, parmesan" in the UI.
   */
  readonly useUp: readonly UseUpIngredient[];
  readonly useUpCount: number;
};
