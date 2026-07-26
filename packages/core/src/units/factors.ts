/**
 * Unit factor table — exact (or definition-derived) conversions to base units.
 *
 * Sources (cited for auditability):
 *
 * MASS (avoirdupois, SI-exact since 1959):
 *   1 lb = 0.45359237 kg = 453.59237 g  (International yard and pound agreement)
 *   1 oz = 1/16 lb = 28.349523125 g
 *   1 kg = 1000 g, 1 mg = 0.001 g
 *
 * VOLUME (US customary liquid, NIST / 231 in³ gallon):
 *   1 US gallon = 231 cubic inches = 3.785411784 L = 3785.411784 ml  (exact)
 *   1 US quart  = 1/4 gal  = 946.352946 ml
 *   1 US pint   = 1/8 gal  = 473.176473 ml
 *   1 US cup    = 1/16 gal = 236.5882365 ml   (US customary cup; brief cites 236.588)
 *   1 US fl oz  = 1/128 gal = 29.5735295625 ml
 *   1 US tbsp   = 1/2 fl oz = 14.78676478125 ml
 *   1 US tsp    = 1/6 fl oz = 4.92892159375 ml
 *   Identity: 1 tbsp = 3 tsp, 1 cup = 16 tbsp = 48 tsp (exact in US customary)
 *
 * Terminology note: 236.5882365 ml is the US *customary* cup (1/16 US gallon).
 * The US *legal* cup is exactly 240 ml (FDA, nutrition labeling). Recipes use
 * customary; if nutrition panels are ever parsed, they need a separate unit
 * id (e.g. `legal_cup`), not a redefinition of `cup`.
 *
 * COUNT:
 *   1 dozen = 12 each
 *
 * Product targets US retail — do NOT use metric cup (250 ml) or Imperial pint.
 * Units that differ US vs Imperial carry `ambiguousLocale: true` so import
 * paths can surface a question rather than silently corrupt inventory.
 */

import type { Dimension, UnitDef, UnitId } from './types';

/**
 * Exact factors: quantity_in_unit * TO_BASE[unit] = quantity_in_base.
 * Base units: g (mass), ml (volume), each (count).
 */
export const UNIT_DEFS: readonly UnitDef[] = [
  // ── mass ──────────────────────────────────────────────────────────────
  { id: 'g', dim: 'mass', toBase: 1, aliases: ['g', 'gram', 'grams', 'gr'] },
  { id: 'kg', dim: 'mass', toBase: 1000, aliases: ['kg', 'kilogram', 'kilograms', 'kilo', 'kilos'] },
  { id: 'mg', dim: 'mass', toBase: 0.001, aliases: ['mg', 'milligram', 'milligrams'] },
  // 1 lb = 0.45359237 kg exactly (International yard and pound agreement, 1959)
  { id: 'lb', dim: 'mass', toBase: 453.59237, aliases: ['lb', 'lbs', 'pound', 'pounds', '#'] },
  // 1 oz = 1/16 lb
  { id: 'oz', dim: 'mass', toBase: 28.349523125, aliases: ['oz', 'ounce', 'ounces'] },

  // ── volume (US customary liquid) ──────────────────────────────────────
  { id: 'ml', dim: 'volume', toBase: 1, aliases: ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres', 'cc'] },
  { id: 'l', dim: 'volume', toBase: 1000, aliases: ['l', 'liter', 'liters', 'litre', 'litres'] },
  // 1 US gallon = 231 in³ = 3785.411784 ml exactly (Imperial gallon differs)
  {
    id: 'gallon',
    dim: 'volume',
    toBase: 3785.411784,
    aliases: ['gallon', 'gallons', 'gal', 'gals'],
    ambiguousLocale: true,
  },
  // 1/4 gal (US; Imperial quart differs)
  {
    id: 'quart',
    dim: 'volume',
    toBase: 946.352946,
    aliases: ['quart', 'quarts', 'qt', 'qts'],
    ambiguousLocale: true,
  },
  // 1/8 gal (US 473 ml; Imperial pint ≈ 568 ml — ~20% difference)
  {
    id: 'pint',
    dim: 'volume',
    toBase: 473.176473,
    aliases: ['pint', 'pints', 'pt', 'pts'],
    ambiguousLocale: true,
  },
  // 1/16 gal = 236.5882365 ml (US customary cup; NOT the 240 ml legal cup)
  {
    id: 'cup',
    dim: 'volume',
    toBase: 236.5882365,
    aliases: ['cup', 'cups', 'c'],
    ambiguousLocale: true,
  },
  // 1/128 gal (US fl oz; Imperial fl oz differs)
  {
    id: 'fl oz',
    dim: 'volume',
    toBase: 29.5735295625,
    aliases: ['fl oz', 'floz', 'fl. oz', 'fl.oz', 'fluid ounce', 'fluid ounces', 'fl ounce', 'fl ounces'],
    ambiguousLocale: true,
  },
  // 1/2 fl oz; 1 tbsp = 3 tsp exactly
  {
    id: 'tbsp',
    dim: 'volume',
    toBase: 14.78676478125,
    aliases: ['tbsp', 'tbsps', 'tablespoon', 'tablespoons', 'tbs', 'tb'],
  },
  // 1/6 fl oz
  {
    id: 'tsp',
    dim: 'volume',
    toBase: 4.92892159375,
    aliases: ['tsp', 'tsps', 'teaspoon', 'teaspoons', 't'],
  },

  // ── count ─────────────────────────────────────────────────────────────
  { id: 'each', dim: 'count', toBase: 1, aliases: ['each', 'ea', 'unit', 'units', 'piece', 'pieces', 'pc', 'pcs', 'item', 'items', 'clove', 'cloves', 'slice', 'slices', 'whole', 'count'] },
  { id: 'dozen', dim: 'count', toBase: 12, aliases: ['dozen', 'doz', 'dozens'] },
] as const;

/** Lookup by canonical unit id. */
export const UNIT_BY_ID: ReadonlyMap<UnitId, UnitDef> = new Map(
  UNIT_DEFS.map((u) => [u.id, u]),
);

/** Alias (lowercase, trimmed) → unit id. Longer aliases registered first in resolve. */
const aliasEntries: [string, UnitId][] = [];
for (const def of UNIT_DEFS) {
  for (const a of def.aliases) {
    aliasEntries.push([a.toLowerCase(), def.id]);
  }
}
// Prefer longer aliases when building the map so "fl oz" wins over partials if any collide.
aliasEntries.sort((a, b) => b[0].length - a[0].length);

export const UNIT_BY_ALIAS: ReadonlyMap<string, UnitId> = new Map(aliasEntries);

/** Factor: unit → base. */
export function toBaseFactor(unit: UnitId): number {
  const def = UNIT_BY_ID.get(unit);
  if (!def) {
    throw new Error(`internal: unknown unit ${unit}`);
  }
  return def.toBase;
}

/** Dimension of a unit, or undefined if unknown. */
export function dimensionOf(unit: string): Dimension | undefined {
  const id = resolveUnitId(unit);
  if (!id) return undefined;
  return UNIT_BY_ID.get(id)!.dim;
}

/**
 * Resolve a free-text unit string to a canonical UnitId.
 * Case-insensitive; accepts aliases. Returns undefined if unknown.
 */
export function resolveUnitId(raw: string): UnitId | undefined {
  const key = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return undefined;
  // Direct id hit
  if (UNIT_BY_ID.has(key as UnitId)) return key as UnitId;
  return UNIT_BY_ALIAS.get(key);
}

/** True if the string is a known unit or alias. */
export function isKnownUnit(raw: string): boolean {
  return resolveUnitId(raw) !== undefined;
}

/**
 * Named exact constants used by tests and docs.
 * Prefer these over re-deriving so the citation stays in one place.
 */
export const EXACT = {
  /** International yard and pound agreement, 1959 */
  LB_TO_G: 453.59237,
  OZ_TO_G: 28.349523125,
  /** US gallon = 231 in³ */
  GALLON_TO_ML: 3785.411784,
  /**
   * US customary cup = 1/16 gal = 236.5882365 ml.
   * Not the FDA legal cup (240 ml) — that needs a separate unit id if used.
   */
  CUP_TO_ML: 236.5882365,
  TBSP_TO_ML: 14.78676478125,
  TSP_TO_ML: 4.92892159375,
  /** Culinary identity in US measures */
  TBSP_PER_CUP: 16,
  TSP_PER_TBSP: 3,
  TSP_PER_CUP: 48,
} as const;
