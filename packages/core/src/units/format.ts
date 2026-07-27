/**
 * formatQuantity — human display from a base-unit quantity.
 *
 * US retail default: pick the unit that yields the most readable number
 * (prefer mid-range magnitudes roughly in [0.5, 100] when possible).
 *
 * Precision rule: never show more decimal places than the uncertainty
 * justifies. If uncertaintyPct is 10 and value is 100, the absolute
 * uncertainty is ~10, so ones-place is the last trustworthy digit.
 */

import { toBaseFactor,UNIT_BY_ID } from './factors';
import type { Dimension, UnitId } from './types';
import { BASE_UNIT } from './types';

export type FormatOpts = {
  /** Relative uncertainty in percent; defaults to 0 (full available precision capped). */
  readonly uncertaintyPct?: number;
  /** Display system. Default 'us' (retail customary). */
  readonly locale?: 'us' | 'metric';
  /** Force a specific unit when known. */
  readonly preferredUnit?: UnitId | string;
  /** Max decimal places even when uncertainty is 0. Default 3. */
  readonly maxDecimals?: number;
};

/**
 * Candidate units per dimension for auto-selection.
 * On equal readability scores, earlier entries win (stable preference).
 * Cup before pint so 2 cups beats 1 pint (US retail / recipe default).
 */
const US_CANDIDATES: Readonly<Record<Dimension, readonly UnitId[]>> = {
  mass: ['lb', 'oz', 'kg', 'g', 'mg'],
  volume: ['cup', 'tbsp', 'tsp', 'fl oz', 'pint', 'quart', 'gallon', 'l', 'ml'],
  count: ['dozen', 'each'],
};

const METRIC_CANDIDATES: Readonly<Record<Dimension, readonly UnitId[]>> = {
  mass: ['kg', 'g', 'mg'],
  volume: ['l', 'ml'],
  count: ['dozen', 'each'],
};

/** Display labels (pluralization handled lightly). */
const LABEL: Readonly<Record<UnitId, { one: string; many: string }>> = {
  g: { one: 'g', many: 'g' },
  kg: { one: 'kg', many: 'kg' },
  mg: { one: 'mg', many: 'mg' },
  oz: { one: 'oz', many: 'oz' },
  lb: { one: 'lb', many: 'lb' },
  ml: { one: 'ml', many: 'ml' },
  l: { one: 'l', many: 'l' },
  tsp: { one: 'tsp', many: 'tsp' },
  tbsp: { one: 'tbsp', many: 'tbsp' },
  cup: { one: 'cup', many: 'cups' },
  'fl oz': { one: 'fl oz', many: 'fl oz' },
  pint: { one: 'pint', many: 'pints' },
  quart: { one: 'quart', many: 'quarts' },
  gallon: { one: 'gallon', many: 'gallons' },
  each: { one: 'each', many: 'each' },
  dozen: { one: 'dozen', many: 'dozen' },
};

/**
 * How many decimal places are justified given value and uncertainty.
 * absoluteUncertainty ≈ |value| * uncertaintyPct / 100
 * We allow a digit place roughly ≥ absoluteUncertainty / 2.
 */
export function decimalsForUncertainty(
  displayValue: number,
  uncertaintyPct: number,
  maxDecimals: number,
): number {
  if (!Number.isFinite(displayValue) || displayValue === 0) {
    return 0;
  }
  if (!Number.isFinite(uncertaintyPct) || uncertaintyPct <= 0) {
    // Cap "exact" display — still avoid absurd floats
    return maxDecimals;
  }

  const absUnc = Math.abs(displayValue) * (uncertaintyPct / 100);
  if (absUnc <= 0) return maxDecimals;

  // Place value of the last trustworthy digit should be on the order of absUnc.
  // decimals = max(0, -floor(log10(absUnc))) but clamp so we don't claim
  // more precision than maxDecimals, and never negative.
  const order = Math.floor(Math.log10(absUnc));
  // If absUnc is 10 → order 1 → decimals 0
  // If absUnc is 0.1 → order -1 → decimals 1
  const decimals = Math.max(0, -order);
  return Math.min(maxDecimals, decimals);
}

function scoreCandidate(displayValue: number): number {
  // Prefer numbers in a comfortable reading range.
  const a = Math.abs(displayValue);
  if (a === 0) return 1000;
  // Ideal band: [1, 10] best, then [0.5, 100], penalize extremes
  if (a >= 1 && a < 10) return 0;
  if (a >= 0.5 && a < 100) return 1;
  if (a >= 0.25 && a < 500) return 2;
  if (a >= 0.1 && a < 1000) return 3;
  // Prefer closer to 1 on a log scale
  return 4 + Math.abs(Math.log10(a));
}

function formatNumber(n: number, decimals: number): string {
  if (!Number.isFinite(n)) return String(n);
  // Avoid "-0"
  const rounded =
    decimals === 0
      ? Math.round(n)
      : Math.round(n * 10 ** decimals) / 10 ** decimals;
  if (Object.is(rounded, -0) || rounded === 0) {
    return decimals > 0 ? (0).toFixed(Math.min(decimals, 1) === 0 ? 0 : 0) : '0';
  }
  // Trim trailing zeros after toFixed
  if (decimals <= 0) {
    return String(Math.round(rounded));
  }
  const fixed = rounded.toFixed(decimals);
  if (!fixed.includes('.')) return fixed;
  return fixed.replace(/\.?0+$/, '');
}

function unitLabel(id: UnitId, qty: number): string {
  const labels = LABEL[id];
  if (!labels) return id;
  return Math.abs(qty) === 1 ? labels.one : labels.many;
}

/**
 * Format a quantity stored in the dimension's base unit for human display.
 *
 * @param baseQty quantity in g / ml / each
 * @param dim dimension of baseQty
 */
export function formatQuantity(
  baseQty: number,
  dim: Dimension,
  opts: FormatOpts = {},
): string {
  if (!Number.isFinite(baseQty)) {
    return '—';
  }

  const uncertaintyPct = opts.uncertaintyPct ?? 0;
  const maxDecimals = opts.maxDecimals ?? 3;
  const locale = opts.locale ?? 'us';
  const baseUnit = BASE_UNIT[dim];

  // Preferred unit forced
  if (opts.preferredUnit) {
    const pref = opts.preferredUnit;
    const def = UNIT_BY_ID.get(pref as UnitId);
    if (def && def.dim === dim) {
      const display = baseQty / toBaseFactor(def.id);
      const decimals = decimalsForUncertainty(
        display,
        uncertaintyPct,
        maxDecimals,
      );
      const num = formatNumber(display, decimals);
      return `${num} ${unitLabel(def.id, Number(num))}`;
    }
  }

  // Zero of a countable thing is "0 each", never "0 dozen". At zero every
  // unit scores equally (readability is undefined), so list order alone
  // would pick dozen first — that is wrong for an empty amount.
  if (dim === 'count' && Math.abs(baseQty) < 1e-12) {
    const decimals = decimalsForUncertainty(0, uncertaintyPct, maxDecimals);
    const num = formatNumber(0, decimals);
    return `${num} ${unitLabel('each', 0)}`;
  }

  const candidates =
    locale === 'metric' ? METRIC_CANDIDATES[dim] : US_CANDIDATES[dim];

  let bestUnit: UnitId = baseUnit;
  let bestScore = Infinity;
  let bestDisplay = baseQty;

  for (const id of candidates) {
    const def = UNIT_BY_ID.get(id);
    if (!def || def.dim !== dim) continue;
    const display = baseQty / def.toBase;
    // Skip tiny or huge for count-like where each is always fine
    const s = scoreCandidate(display);
    // Prefer exact integers slightly
    const intBonus =
      Number.isFinite(display) && Math.abs(display - Math.round(display)) < 1e-9
        ? -0.25
        : 0;
    const total = s + intBonus;
    if (
      total < bestScore ||
      (total === bestScore && id === baseUnit) // stable preference for base on ties toward base? prefer first in list
    ) {
      // On score tie, keep earlier candidate (list order is preference)
      if (total < bestScore) {
        bestScore = total;
        bestUnit = id;
        bestDisplay = display;
      }
    }
  }

  // Re-scan for true first-best under equal scores (stable)
  bestScore = Infinity;
  for (const id of candidates) {
    const def = UNIT_BY_ID.get(id);
    if (!def || def.dim !== dim) continue;
    const display = baseQty / def.toBase;
    const s =
      scoreCandidate(display) +
      (Number.isFinite(display) &&
      Math.abs(display - Math.round(display)) < 1e-9
        ? -0.25
        : 0);
    if (s < bestScore) {
      bestScore = s;
      bestUnit = id;
      bestDisplay = display;
    }
  }

  const decimals = decimalsForUncertainty(
    bestDisplay,
    uncertaintyPct,
    maxDecimals,
  );
  const num = formatNumber(bestDisplay, decimals);
  return `${num} ${unitLabel(bestUnit, Number(num))}`;
}
