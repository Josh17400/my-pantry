/**
 * Canonical domain shapes — extracted from SPEC.md.
 *
 * Boundary: `src/domain/` owns vocabulary (Ingredient, forms, edges, packages,
 * locations, allergens, Dimension). `src/units/` owns conversion math and the
 * unit registry. `src/pantry/` owns ledger fold / projection / stock.
 */

import type { Allergen } from './allergens';

// ── Shared primitives ───────────────────────────────────────────────────────

/**
 * The three base dimensions. Every stored quantity is a number in a base unit
 * (g / ml / each). Single definition for the whole codebase — units and pantry
 * both import from here.
 */
export type Dimension = 'mass' | 'volume' | 'count';

/** Canonical base unit per dimension. Never store a display string. */
export type BaseUnit = 'g' | 'ml' | 'each';

// ── Ingredient model ────────────────────────────────────────────────────────

/**
 * Canonical ingredient. Allergens are a safety system, not a preference.
 * Matching refuses auto-merge across disagreeing allergen tags.
 */
export interface Ingredient {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly allergens: readonly Allergen[];
  readonly isStaple: boolean;
  /** Default form for stocking / display when none is specified. */
  readonly defaultFormId: string;
}

/**
 * A form of an ingredient (whole clove, minced, powder, shredded, …).
 * Form is a first-class axis — one density per ingredient is a fiction.
 */
export interface IngredientForm {
  readonly id: string;
  readonly ingredientId: string;
  /** Free-text form label, e.g. "clove" | "minced" | "powder" | "shredded". */
  readonly form: string;
  readonly dim: Dimension;
  /**
   * Mass density when this form is measured by volume.
   * Enables VOLUME ↔ MASS for this form only.
   */
  readonly densityGPerMl?: number;
  /**
   * Mass of one count unit of this form.
   * Enables COUNT ↔ MASS for this form only.
   */
  readonly gramsPerCount?: number;
  /** Relative uncertainty of density / gramsPerCount (percent). */
  readonly uncertaintyPct: number;
}

/**
 * Directed conversion between two forms.
 * `factor` multiplies a quantity in the *from* form's base unit to get the
 * *to* form's base unit: `toBase = fromBase * factor`.
 *
 * By default edges are bidirectional: `convert()` also walks the inverse
 * (`1/factor`) unless `oneWay` is true (physically lossy yields, e.g.
 * whole chicken → boneless).
 */
export interface ConversionEdge {
  readonly fromFormId: string;
  readonly toFormId: string;
  readonly factor: number;
  readonly uncertaintyPct: number;
  /** Provenance: "usda" | "measured" | "user" | "seed" | … */
  readonly source: string;
  /**
   * When true, do not auto-invert this edge. Default false (symmetric).
   * Use for lossy physical yields that must not reverse.
   */
  readonly oneWay?: boolean;
}

/**
 * Retail package size for a form, used for par-level seeding and display.
 * label e.g. "can_14_5oz".
 */
export interface PackageSpec {
  readonly formId: string;
  readonly label: string;
  readonly netG: number;
  readonly drainedG?: number;
}

/**
 * User-defined storage location (Fridge / Pantry / nested shelves).
 * Seeded with defaults, fully editable, one level of nesting.
 */
export interface Location {
  readonly id: string;
  readonly householdId: string;
  readonly name: string;
  readonly icon: string;
  readonly tint: string;
  readonly parentId?: string;
  readonly sortOrder: number;
}

/**
 * Quantity in base units (g / ml / each). Shared structural type for
 * pantry projection and any caller that needs dim-tagged base quantities.
 */
export type QtyBase = {
  readonly qtyBase: number;
  readonly dim: Dimension;
};
