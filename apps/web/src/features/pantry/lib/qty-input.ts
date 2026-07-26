/**
 * Parse human quantity text into base units using core parse/convert.
 * Never reimplements conversion graph.
 */

import {
  convertToBase,
  type Dimension,
  dimensionOf,
  parseQuantity,
} from '@larder/core';

export type QtyParseOk = {
  ok: true;
  qtyBase: number;
  dim: Dimension;
  displayUnit: string;
  rawQty: number;
};

export type QtyParseErr = {
  ok: false;
  message: string;
};

export type QtyParseResult = QtyParseOk | QtyParseErr;

/**
 * Parse "2.5 lb", "500 g", "1.5 cups" into base units for a known dimension.
 * When preferredDim is set, the unit must match that dimension.
 */
export function parseHumanQuantity(
  text: string,
  preferredDim?: Dimension,
): QtyParseResult {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { ok: false, message: 'Enter a quantity' };
  }

  const parsed = parseQuantity(trimmed);

  if (parsed.kind === 'non-quantified') {
    return {
      ok: false,
      message: 'That amount is not quantified — enter a number with a unit',
    };
  }
  if (parsed.kind === 'unparsed') {
    return {
      ok: false,
      message: parsed.detail || 'Could not parse quantity',
    };
  }

  if (!parsed.unitKnown) {
    // Bare number — treat as base unit of preferred dim, or count "each"
    if (preferredDim) {
      return {
        ok: true,
        qtyBase: parsed.qty,
        dim: preferredDim,
        displayUnit:
          preferredDim === 'mass' ? 'g' : preferredDim === 'volume' ? 'ml' : 'each',
        rawQty: parsed.qty,
      };
    }
    return {
      ok: false,
      message: 'Add a unit (e.g. lb, g, cups, each)',
    };
  }

  const dim = dimensionOf(parsed.unit);
  if (!dim) {
    return { ok: false, message: `Unknown unit: ${parsed.unit}` };
  }
  if (preferredDim && dim !== preferredDim) {
    return {
      ok: false,
      message: `Unit is ${dim}, but this item is tracked as ${preferredDim}`,
    };
  }

  const converted = convertToBase(parsed.qty, String(parsed.unit));
  if (!converted.ok) {
    return { ok: false, message: converted.detail || converted.reason };
  }

  return {
    ok: true,
    qtyBase: converted.value,
    dim,
    displayUnit: String(parsed.unit),
    rawQty: parsed.qty,
  };
}

/** Parse a signed delta: leading +/− optional, absolute amount with unit. */
export function parseHumanDelta(
  text: string,
  preferredDim?: Dimension,
): QtyParseResult {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { ok: false, message: 'Enter an amount' };
  }

  let sign = 1;
  let body = trimmed;
  if (body.startsWith('+')) {
    body = body.slice(1).trim();
    sign = 1;
  } else if (body.startsWith('-') || body.startsWith('−')) {
    body = body.slice(1).trim();
    sign = -1;
  }

  const result = parseHumanQuantity(body, preferredDim);
  if (!result.ok) return result;
  return { ...result, qtyBase: sign * result.qtyBase };
}
