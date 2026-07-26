/**
 * parseQuantity — turn recipe/receipt text into a structured amount.
 *
 * Handles:
 *   - mixed numbers: "1 1/2 cups"
 *   - ASCII fractions: "1/2", "3/4 cup"
 *   - Unicode vulgar fractions: ½ ¼ ¾ ⅓ ⅔ ⅛ …
 *   - decimals: "1.5 cups", "0.25 tsp"
 *   - ranges: "2-3 cloves" → midpoint + low + high, flagged `isRange: true`
 *   - bare numbers with unit: "3 eggs" (unit may be count alias)
 *   - locale-ambiguous units (pint/cup/…): `ambiguousLocale: true` so import can ask
 *
 * Non-quantified (deliberate — NOT zero):
 *   - "a pinch", "pinch", "to taste", "as needed", "optional", "for garnish", …
 *
 * Deliberately rejects / returns unparsed:
 *   - empty string
 *   - pure text without quantity or known non-quantified phrase
 *   - multiple conflicting numbers that are not a range or mixed number
 */

import { resolveUnitId, UNIT_BY_ID } from './factors';
import type { UnitId } from './types';

export type ParsedQuantity = {
  readonly kind: 'quantity';
  /**
   * Canonical quantity. For ranges this is the midpoint — pantry deduction
   * should use this; grocery/shortfall should use `high`.
   */
  readonly qty: number;
  /**
   * Range low end. Equal to `qty` when not a range.
   * Always present so callers need not branch on isRange for bounds.
   */
  readonly low: number;
  /**
   * Range high end. Equal to `qty` when not a range.
   * Grocery list / shortfall wants high (under-buying means a second trip).
   */
  readonly high: number;
  /** Canonical unit id when recognized; otherwise the raw unit token. */
  readonly unit: UnitId | string;
  /** True when unit resolved to a known UnitId. */
  readonly unitKnown: boolean;
  /** True when input was a range (e.g. "2-3"); qty is the midpoint. */
  readonly isRange: boolean;
  /**
   * True when the unit's US and Imperial definitions differ (pint, quart,
   * gallon, fl oz, cup). Do not reject; do not silently assume — import
   * path should ask. False for non-ambiguous units and unknown unit tokens.
   */
  readonly ambiguousLocale: boolean;
  readonly raw: string;
};

export type ParsedNonQuantified = {
  readonly kind: 'non-quantified';
  /** Normalized phrase key, e.g. "pinch" | "to-taste" | "as-needed". */
  readonly phrase: string;
  readonly raw: string;
};

export type ParsedUnparsed = {
  readonly kind: 'unparsed';
  readonly raw: string;
  readonly detail: string;
};

export type ParseQuantityResult =
  | ParsedQuantity
  | ParsedNonQuantified
  | ParsedUnparsed;

/** Unicode vulgar fraction → numeric value. */
const VULGAR: Readonly<Record<string, number>> = {
  '½': 0.5,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 0.25,
  '¾': 0.75,
  '⅕': 0.2,
  '⅖': 0.4,
  '⅗': 0.6,
  '⅘': 0.8,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅐': 1 / 7,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
  '⅑': 1 / 9,
  '⅒': 0.1,
};

const VULGAR_CLASS = Object.keys(VULGAR).join('');

/** Phrases that mean "do not deduct a quantity". */
const NON_QUANTIFIED: ReadonlyArray<{ re: RegExp; phrase: string }> = [
  { re: /^\s*(a\s+)?pinch\s*(of)?\s*$/i, phrase: 'pinch' },
  { re: /^\s*(a\s+)?dash\s*(of)?\s*$/i, phrase: 'dash' },
  { re: /^\s*to\s+taste\s*$/i, phrase: 'to-taste' },
  { re: /^\s*as\s+needed\s*$/i, phrase: 'as-needed' },
  { re: /^\s*as\s+desired\s*$/i, phrase: 'as-desired' },
  { re: /^\s*for\s+garnish\s*$/i, phrase: 'for-garnish' },
  { re: /^\s*for\s+serving\s*$/i, phrase: 'for-serving' },
  { re: /^\s*optional\s*$/i, phrase: 'optional' },
  { re: /^\s*tt\s*$/i, phrase: 'to-taste' }, // chef shorthand
  { re: /^\s*(a\s+)?handful\s*$/i, phrase: 'handful' },
  { re: /^\s*(a\s+)?smidgen\s*$/i, phrase: 'smidgen' },
];

function replaceVulgar(s: string): string {
  let out = s;
  for (const [ch, val] of Object.entries(VULGAR)) {
    if (out.includes(ch)) {
      // "1½" → "1 0.5", "½" → "0.5"
      out = out.split(ch).join(` ${val} `);
    }
  }
  return out;
}

function unitAmbiguousLocale(unitId: UnitId | undefined): boolean {
  if (!unitId) return false;
  return UNIT_BY_ID.get(unitId)?.ambiguousLocale === true;
}

/**
 * Parse a leading numeric (decimal, fraction, mixed, or range) from `s`.
 * Returns null if no leading number.
 */
function parseLeadingNumber(
  s: string,
): { qty: number; low: number; high: number; isRange: boolean; rest: string } | null {
  const t = s.trim();
  if (!t) return null;

  // Range: "2-3", "2 – 3", "2 to 3" (must be two plain numbers, not fractions for simplicity of rest)
  // Prefer en-dash / hyphen / "to"
  const rangeRe =
    /^(\d+(?:\.\d+)?)\s*(?:-|–|—|\bto\b)\s*(\d+(?:\.\d+)?)(?=\s|$|[a-zA-Z])/i;
  const rangeM = t.match(rangeRe);
  if (rangeM) {
    const a = Number(rangeM[1]);
    const b = Number(rangeM[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      const low = Math.min(a, b);
      const high = Math.max(a, b);
      const mid = (low + high) / 2;
      const rest = t.slice(rangeM[0].length).trim();
      return { qty: mid, low, high, isRange: true, rest };
    }
  }

  // Mixed number: "1 1/2" or "1 ½" (½ already expanded to "1 0.5")
  const mixedFrac = t.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/);
  if (mixedFrac) {
    const whole = Number(mixedFrac[1]);
    const num = Number(mixedFrac[2]);
    const den = Number(mixedFrac[3]);
    if (den !== 0 && Number.isFinite(whole) && Number.isFinite(num)) {
      const qty = whole + num / den;
      const rest = t.slice(mixedFrac[0].length).trim();
      return { qty, low: qty, high: qty, isRange: false, rest };
    }
  }

  // Mixed with already-expanded vulgar: "1 0.5"
  const mixedDec = t.match(/^(\d+)\s+(\d+\.\d+)(?=\s|$|[a-zA-Z])/);
  if (mixedDec) {
    const whole = Number(mixedDec[1]);
    const frac = Number(mixedDec[2]);
    if (Number.isFinite(whole) && Number.isFinite(frac) && frac < 1) {
      const qty = whole + frac;
      const rest = t.slice(mixedDec[0].length).trim();
      return { qty, low: qty, high: qty, isRange: false, rest };
    }
  }

  // Simple fraction: "3/4"
  const frac = t.match(/^(\d+)\s*\/\s*(\d+)/);
  if (frac) {
    const num = Number(frac[1]);
    const den = Number(frac[2]);
    if (den !== 0 && Number.isFinite(num)) {
      const qty = num / den;
      const rest = t.slice(frac[0].length).trim();
      return { qty, low: qty, high: qty, isRange: false, rest };
    }
  }

  // Decimal or integer: "1.5", "12"
  const dec = t.match(/^(\d+(?:\.\d+)?)/);
  if (dec) {
    const qty = Number(dec[1]);
    if (Number.isFinite(qty)) {
      const rest = t.slice(dec[0].length).trim();
      return { qty, low: qty, high: qty, isRange: false, rest };
    }
  }

  return null;
}

/**
 * Try to peel a unit token from the start of `rest`.
 * Prefers multi-word units ("fl oz") by trying longest known aliases first.
 */
function peelUnit(rest: string): { unitRaw: string; unitId: UnitId | undefined; tail: string } {
  const t = rest.trim();
  if (!t) {
    return { unitRaw: '', unitId: undefined, tail: '' };
  }

  // Candidate: up to 3 words (covers "fl oz", "fluid ounces")
  const words = t.split(/\s+/);
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    const candidate = words.slice(0, n).join(' ');
    // Strip trailing punctuation
    const cleaned = candidate.replace(/[.,;:]+$/, '');
    const id = resolveUnitId(cleaned);
    if (id) {
      const tail = words.slice(n).join(' ').trim();
      return { unitRaw: cleaned, unitId: id, tail };
    }
  }

  // Unknown unit: take first word as raw unit
  const first = words[0]!.replace(/[.,;:]+$/, '');
  const tail = words.slice(1).join(' ').trim();
  return { unitRaw: first, unitId: undefined, tail };
}

/**
 * Parse a quantity string from a recipe line or receipt.
 * Never returns qty 0 for non-quantified phrases — those are a distinct kind.
 */
export function parseQuantity(raw: string): ParseQuantityResult {
  const original = raw;
  let s = raw.trim();
  if (!s) {
    return { kind: 'unparsed', raw: original, detail: 'empty input' };
  }

  // Non-quantified phrases (whole string match, optionally with trailing junk unit words)
  for (const { re, phrase } of NON_QUANTIFIED) {
    if (re.test(s)) {
      return { kind: 'non-quantified', phrase, raw: original };
    }
  }
  // Also: "salt to taste", "pepper, to taste" — phrase at end
  const trailingNonQ =
    /^(.*?)(?:,?\s+)?(to taste|as needed|as desired|for garnish|for serving)\s*$/i;
  const tn = s.match(trailingNonQ);
  if (tn && !/\d/.test(tn[1] ?? '')) {
    const phraseMap: Record<string, string> = {
      'to taste': 'to-taste',
      'as needed': 'as-needed',
      'as desired': 'as-desired',
      'for garnish': 'for-garnish',
      'for serving': 'for-serving',
    };
    const key = (tn[2] ?? '').toLowerCase();
    return {
      kind: 'non-quantified',
      phrase: phraseMap[key] ?? key,
      raw: original,
    };
  }

  // Expand unicode fractions early
  s = replaceVulgar(s).replace(/\s+/g, ' ').trim();

  // Leading article "a/an" before unit-only ("a pinch" already handled; "a cup" → 1 cup)
  let impliedOne = false;
  const article = s.match(/^(an?)\s+/i);
  if (article) {
    const after = s.slice(article[0].length);
    // If what follows is a unit or non-number phrase
    if (!/^\d/.test(after) && !after.includes('/')) {
      // Could be "a cup of …" → qty 1
      impliedOne = true;
      s = after;
    }
  }

  let qty: number;
  let low: number;
  let high: number;
  let isRange = false;
  let rest: string;

  if (impliedOne) {
    qty = 1;
    low = 1;
    high = 1;
    isRange = false;
    rest = s;
  } else {
    const num = parseLeadingNumber(s);
    if (!num) {
      // Bare unit with no number? unparsed (or non-quantified already checked)
      return {
        kind: 'unparsed',
        raw: original,
        detail: 'no leading quantity',
      };
    }
    qty = num.qty;
    low = num.low;
    high = num.high;
    isRange = num.isRange;
    rest = num.rest;
  }

  // Optional "of" after unit later; peel unit now
  // Strip leading "of" if present without unit ("1 of garlic" is odd — leave unparsed unit)
  const { unitRaw, unitId, tail: _tail } = peelUnit(rest);

  if (!unitRaw && !impliedOne) {
    // Number with no unit — allowed as count-less; unit defaults to empty
    return {
      kind: 'quantity',
      qty,
      low,
      high,
      unit: '',
      unitKnown: false,
      isRange,
      ambiguousLocale: false,
      raw: original,
    };
  }

  if (!unitRaw && impliedOne) {
    return {
      kind: 'unparsed',
      raw: original,
      detail: 'article without unit',
    };
  }

  return {
    kind: 'quantity',
    qty,
    low,
    high,
    unit: unitId ?? unitRaw,
    unitKnown: unitId !== undefined,
    isRange,
    ambiguousLocale: unitAmbiguousLocale(unitId),
    raw: original,
  };
}

/** @internal exposed for tests */
export const _test = {
  VULGAR,
  VULGAR_CLASS,
  replaceVulgar,
  parseLeadingNumber,
};
