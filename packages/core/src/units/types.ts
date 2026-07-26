/**
 * Unit system types — registry, conversion results.
 * Domain shapes (IngredientForm, ConversionEdge, PackageSpec, Dimension)
 * live in `src/domain/`; this module owns unit-registry and result types.
 */

import type { BaseUnit, Dimension } from '../domain/types';

// Re-export domain shapes so existing `from './types'` / units barrel imports keep working.
export type {
  BaseUnit,
  ConversionEdge,
  Dimension,
  IngredientForm,
  PackageSpec,
} from '../domain/types';

/** All supported unit ids (display + base). */
export type UnitId =
  // mass
  | 'g'
  | 'kg'
  | 'mg'
  | 'oz'
  | 'lb'
  // volume (US customary)
  | 'ml'
  | 'l'
  | 'tsp'
  | 'tbsp'
  | 'cup'
  | 'fl oz'
  | 'pint'
  | 'quart'
  | 'gallon'
  // count
  | 'each'
  | 'dozen';

/** Map dimension → its base unit. */
export const BASE_UNIT: Readonly<Record<Dimension, BaseUnit>> = {
  mass: 'g',
  volume: 'ml',
  count: 'each',
} as const;

/** Inverse: base unit → dimension. */
export const DIMENSION_OF_BASE: Readonly<Record<BaseUnit, Dimension>> = {
  g: 'mass',
  ml: 'volume',
  each: 'count',
} as const;

/**
 * Successful conversion: value is in the *target* unit's scale, but `dim` is
 * the dimension of that unit. `path` lists edge keys taken (empty for pure
 * same-dimension unit conversion).
 */
export type ConversionOk = {
  readonly ok: true;
  readonly value: number;
  readonly dim: Dimension;
  readonly uncertaintyPct: number;
  readonly path: readonly string[];
};

export type ConversionFailReason =
  | 'no-path'
  | 'unknown-unit'
  | 'unknown-form'
  | 'non-finite';

export type ConversionErr = {
  readonly ok: false;
  readonly reason: ConversionFailReason;
  readonly detail: string;
};

export type ConversionResult = ConversionOk | ConversionErr;

/** Unit registry entry: factor converts *this unit → base unit*. */
export interface UnitDef {
  readonly id: UnitId;
  readonly dim: Dimension;
  /** Multiply quantity in this unit by `toBase` to get base-unit quantity. */
  readonly toBase: number;
  /** Short aliases accepted by parseQuantity (lowercase). */
  readonly aliases: readonly string[];
  /**
   * True when US customary and Imperial definitions differ for this unit id
   * (pint, quart, gallon, fl oz, cup). We stay US-only, but a UK recipe's
   * "1 pint" is 568 ml vs our 473 ml — surface the flag so import can ask.
   * Do not reject; do not silently assume.
   */
  readonly ambiguousLocale?: boolean;
}
