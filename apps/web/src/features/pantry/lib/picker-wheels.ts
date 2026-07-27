/**
 * Pure logic for iOS-style quantity picker wheels.
 * Unit conversion goes through @larder/core — never reimplemented here.
 */

import {
  convert,
  convertBaseToUnit,
  convertToBase,
  DEFAULT_STOCK_EPSILON,
  type Dimension,
  formatQuantity,
} from '@larder/core';

/** Units offered on the unit wheel, constrained to the item's dimension. */
export const PICKER_UNITS: Readonly<Record<Dimension, readonly string[]>> = {
  mass: ['g', 'kg', 'oz', 'lb'],
  volume: ['ml', 'l', 'tsp', 'tbsp', 'cup', 'fl oz'],
  count: ['each', 'dozen'],
};

export type PickerDirection = 'add' | 'remove';

export type PickerMode = 'adjust' | 'recount' | 'waste' | 'add';

export type PickerSelection = {
  /** Display quantity on the quantity wheel (unsigned). */
  qty: number;
  unit: string;
  /** Only meaningful for adjust; ignored for other modes. */
  direction: PickerDirection;
};

export type PickerOutcome = {
  /** Signed base-unit delta for adjust; absolute base for recount/add; positive base for waste. */
  qtyBase: number;
  /** Absolute resulting stock in base units (when currentQtyBase known). */
  resultQtyBase: number | null;
  unit: string;
  qty: number;
  direction: PickerDirection;
  mode: PickerMode;
};

const COOKING_FRAC_PARTS: readonly number[] = [
  0,
  0.25,
  1 / 3,
  0.5,
  2 / 3,
  0.75,
];

/** Display label for a step value (fractions for cooking units). */
export function formatStepLabel(value: number, unit: string): string {
  if (unit === 'cup' || unit === 'tbsp' || unit === 'tsp') {
    return formatCookingLabel(value);
  }
  if (Number.isInteger(value) || Math.abs(value - Math.round(value)) < 1e-9) {
    return String(Math.round(value));
  }
  // Trim float noise (0.30000000004 → 0.3)
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

function formatCookingLabel(value: number): string {
  const whole = Math.floor(value + 1e-9);
  const frac = value - whole;
  const fracLabel = fractionGlyph(frac);
  if (whole === 0) {
    return fracLabel ?? formatStepLabelFallback(value);
  }
  if (fracLabel === null || Math.abs(frac) < 1e-9) {
    return String(whole);
  }
  return `${whole}${fracLabel}`;
}

function fractionGlyph(frac: number): string | null {
  const f = Math.abs(frac);
  if (f < 1e-9) return null;
  if (Math.abs(f - 0.25) < 0.02) return '¼';
  if (Math.abs(f - 1 / 3) < 0.02) return '⅓';
  if (Math.abs(f - 0.5) < 0.02) return '½';
  if (Math.abs(f - 2 / 3) < 0.02) return '⅔';
  if (Math.abs(f - 0.75) < 0.02) return '¾';
  if (Math.abs(f - 0.125) < 0.02) return '⅛';
  return null;
}

function formatStepLabelFallback(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

/**
 * Adaptive quantity steps for a unit (brief §3).
 * Always includes 0 so Adjust can start at zero.
 */
export function quantityStepsForUnit(unit: string): number[] {
  switch (unit) {
    case 'g':
    case 'ml':
      return steppedRanges([
        { from: 0, to: 100, step: 1 },
        { from: 105, to: 500, step: 5 },
        { from: 525, to: 5000, step: 25 },
      ]);
    case 'kg':
    case 'l':
      return steppedRanges([
        { from: 0, to: 2, step: 0.05 },
        { from: 2.25, to: 25, step: 0.25 },
      ]);
    case 'oz':
    case 'fl oz':
      return steppedRanges([{ from: 0, to: 200, step: 0.5 }]);
    case 'lb':
      return steppedRanges([{ from: 0, to: 50, step: 0.25 }]);
    case 'each':
      return steppedRanges([{ from: 0, to: 500, step: 1 }]);
    case 'dozen':
      return steppedRanges([{ from: 0, to: 40, step: 1 }]);
    case 'cup':
      return cookingSteps(16);
    case 'tbsp':
      return cookingSteps(32);
    case 'tsp':
      return cookingSteps(48);
    default:
      return steppedRanges([{ from: 0, to: 100, step: 1 }]);
  }
}

type Range = { from: number; to: number; step: number };

function steppedRanges(ranges: readonly Range[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const { from, to, step } of ranges) {
    // Use integer math when step is a clean fraction of 1 to avoid float drift
    const inv = Math.round(1 / step);
    const useInt = Math.abs(step * inv - 1) < 1e-9 && inv >= 1 && inv <= 1000;
    if (useInt) {
      const fromI = Math.round(from * inv);
      const toI = Math.round(to * inv);
      for (let i = fromI; i <= toI; i++) {
        const v = i / inv;
        pushUnique(out, seen, v);
      }
    } else {
      for (let v = from; v <= to + step * 0.5; v += step) {
        pushUnique(out, seen, Math.round(v * 1e6) / 1e6);
      }
    }
  }
  return out;
}

function cookingSteps(maxWhole: number): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (let whole = 0; whole <= maxWhole; whole++) {
    for (const part of COOKING_FRAC_PARTS) {
      if (whole === maxWhole && part > 0) break;
      pushUnique(out, seen, Math.round((whole + part) * 1e6) / 1e6);
    }
  }
  return out;
}

function pushUnique(out: number[], seen: Set<number>, v: number): void {
  // Key on milli-precision
  const key = Math.round(v * 1000);
  if (seen.has(key)) return;
  seen.add(key);
  out.push(v);
}

export function unitsForDimension(dim: Dimension): readonly string[] {
  return PICKER_UNITS[dim];
}

/** True when unit belongs to the item's dimension. */
export function unitMatchesDimension(unit: string, dim: Dimension): boolean {
  return (PICKER_UNITS[dim] as readonly string[]).includes(unit);
}

/**
 * Nearest step to `value` in the unit's step table.
 * Prefer lower step on exact midpoint ties (stable).
 */
export function nearestStep(value: number, steps: readonly number[]): number {
  if (steps.length === 0) return 0;
  if (!Number.isFinite(value)) return steps[0]!;
  let best = steps[0]!;
  let bestDist = Math.abs(value - best);
  for (let i = 1; i < steps.length; i++) {
    const s = steps[i]!;
    const d = Math.abs(value - s);
    if (d < bestDist - 1e-12) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}

/** Greatest step at or below `max` (0 when max ≤ 0 or table empty). */
export function stepAtOrBelow(max: number, steps: readonly number[]): number {
  if (steps.length === 0 || !Number.isFinite(max) || max < 0) return 0;
  let best = 0;
  let found = false;
  for (const s of steps) {
    if (s <= max + 1e-12 && (!found || s >= best)) {
      best = s;
      found = true;
    }
  }
  return found ? best : 0;
}

/**
 * True when the quantity wheel is a removal: Adjust+Remove, Waste (always).
 * Recount and Add never clamp to on-hand.
 */
export function isRemovalSelection(
  mode: PickerMode,
  direction: PickerDirection,
): boolean {
  return mode === 'waste' || (mode === 'adjust' && direction === 'remove');
}

/**
 * On-hand stock expressed in the wheel's selected unit (raw display qty).
 * Zero when empty or conversion fails.
 */
export function onHandInUnit(
  currentQtyBase: number,
  dim: Dimension,
  unit: string,
): number {
  if (!(currentQtyBase > 0)) return 0;
  const r = convertBaseToUnit(currentQtyBase, dim, unit);
  if (!r.ok || !Number.isFinite(r.value)) return 0;
  return r.value;
}

/**
 * Quantity steps for a removal wheel: full table clipped to on-hand max.
 * Always ends with the exact on-hand amount (when > 0) so dialling the cap
 * removes everything and lands at exactly zero — not a stepped shortfall.
 */
export function quantityStepsForRemoval(
  unit: string,
  maxQty: number,
): number[] {
  const full = quantityStepsForUnit(unit);
  if (!Number.isFinite(maxQty) || maxQty <= 0) {
    return [0];
  }
  const out: number[] = [];
  const seen = new Set<number>();
  for (const s of full) {
    if (s <= maxQty + 1e-12) {
      pushUnique(out, seen, s);
    }
  }
  if (out.length === 0) {
    out.push(0);
    seen.add(0);
  }
  // Exact cap so max removal → zero stock (not nearest-below remainder).
  const last = out[out.length - 1]!;
  if (Math.abs(last - maxQty) > 1e-9) {
    pushUnique(out, seen, Math.round(maxQty * 1e9) / 1e9);
  }
  return out;
}

/**
 * Clamp selection qty when removing so it never exceeds on-hand in the
 * current unit. Snaps onto a value present in the removal step table so the
 * wheel selection stays valid. No-op for Add / Recount / non-removal modes.
 */
export function clampSelectionForRemoval(
  selection: PickerSelection,
  mode: PickerMode,
  currentQtyBase: number,
  dim: Dimension,
): PickerSelection {
  if (!isRemovalSelection(mode, selection.direction)) {
    return selection;
  }
  const maxQty = onHandInUnit(currentQtyBase, dim, selection.unit);
  const steps = quantityStepsForRemoval(selection.unit, maxQty);
  const exact = steps.find((s) => Math.abs(s - selection.qty) < 1e-6);
  let qty: number;
  if (exact !== undefined) {
    qty = exact;
  } else if (selection.qty > maxQty + 1e-12) {
    qty = steps[steps.length - 1] ?? 0;
  } else {
    qty = stepAtOrBelow(selection.qty, steps);
  }
  if (Math.abs(qty - selection.qty) < 1e-12) return selection;
  return { ...selection, qty };
}

/**
 * Legible cap copy next to the wheel, e.g. "1.824 lb available".
 */
export function formatAvailableAmount(
  currentQtyBase: number,
  dim: Dimension,
  unit: string,
): string {
  const safeBase = Math.max(0, currentQtyBase);
  const label = formatQuantity(safeBase, dim, {
    preferredUnit: unit,
    locale: 'us',
    uncertaintyPct: 0,
  });
  return `${label} available`;
}

/**
 * True when the selection is at the removal cap (everything recorded).
 * Used to surface the Recount hint.
 */
export function isAtRemoveCap(
  selection: PickerSelection,
  mode: PickerMode,
  currentQtyBase: number,
  dim: Dimension,
): boolean {
  if (!isRemovalSelection(mode, selection.direction)) return false;
  if (!(currentQtyBase > 0)) return false;
  const maxQty = onHandInUnit(currentQtyBase, dim, selection.unit);
  if (!(maxQty > 0)) return false;
  return selection.qty >= maxQty - 1e-9;
}

/** Stock that can be removed (strictly positive on-hand). */
export function canRemoveStock(currentQtyBase: number): boolean {
  return currentQtyBase > 0;
}

/**
 * Re-scale quantity when the unit wheel changes, keeping equivalent amount.
 * Converts via core; snaps to the new unit's step table.
 */
export function rescaleQuantityForUnitChange(
  qty: number,
  fromUnit: string,
  toUnit: string,
): { ok: true; qty: number } | { ok: false; qty: number; reason: string } {
  if (fromUnit === toUnit) {
    return { ok: true, qty };
  }
  const converted = convert({
    value: qty,
    fromUnit,
    toUnit,
  });
  if (!converted.ok) {
    return { ok: false, qty: 0, reason: converted.detail || converted.reason };
  }
  const steps = quantityStepsForUnit(toUnit);
  return { ok: true, qty: nearestStep(converted.value, steps) };
}

/**
 * Pick the default unit for the wheel so it matches what the user sees on the row.
 * Uses formatQuantity's preferred unit when it is in the picker set; otherwise
 * scores candidates for readability.
 */
export function pickDefaultUnit(qtyBase: number, dim: Dimension): string {
  const units = unitsForDimension(dim);
  const formatted = formatQuantity(qtyBase, dim, {
    locale: 'us',
    uncertaintyPct: 0,
  });
  // formatQuantity → "2.5 lb" / "500 g" / "6 each"
  for (const u of units) {
    if (formatted.endsWith(` ${u}`) || formatted.endsWith(` ${u}s`)) {
      return u;
    }
    // cups plural
    if (u === 'cup' && /\bcups?\b/.test(formatted)) return 'cup';
  }

  let best = units[0]!;
  let bestScore = Infinity;
  for (const u of units) {
    const r = convertBaseToUnit(Math.abs(qtyBase), dim, u);
    if (!r.ok) continue;
    const score = readabilityScore(r.value);
    if (score < bestScore) {
      bestScore = score;
      best = u;
    }
  }
  return best;
}

function readabilityScore(displayValue: number): number {
  const a = Math.abs(displayValue);
  if (a === 0) return 1000;
  if (a >= 1 && a < 10) return 0;
  if (a >= 0.5 && a < 100) return 1;
  if (a >= 0.25 && a < 500) return 2;
  if (a >= 0.1 && a < 1000) return 3;
  return 4 + Math.abs(Math.log10(a));
}

/**
 * Seed quantity wheel: Recount from current stock; Adjust / Waste / Add from zero.
 */
export function seedPickerSelection(
  mode: PickerMode,
  dim: Dimension,
  currentQtyBase = 0,
  preferredUnit?: string,
): PickerSelection {
  const unit =
    preferredUnit && unitMatchesDimension(preferredUnit, dim)
      ? preferredUnit
      : pickDefaultUnit(currentQtyBase, dim);

  if (mode === 'recount' && currentQtyBase > 0) {
    const r = convertBaseToUnit(currentQtyBase, dim, unit);
    const raw = r.ok ? r.value : 0;
    const qty = nearestStep(raw, quantityStepsForUnit(unit));
    return { qty, unit, direction: 'add' };
  }

  return { qty: 0, unit, direction: mode === 'waste' ? 'remove' : 'add' };
}

/**
 * Resolve selection → base-unit outcome for ledger writes.
 * - adjust: signed relative delta
 * - recount / add: absolute non-negative base
 * - waste: positive amount (caller applies waste txn which negates)
 */
export function resolvePickerOutcome(
  selection: PickerSelection,
  mode: PickerMode,
  currentQtyBase?: number,
):
  | { ok: true; outcome: PickerOutcome }
  | { ok: false; message: string } {
  const { qty, unit, direction } = selection;
  if (!Number.isFinite(qty) || qty < 0) {
    return { ok: false, message: 'Quantity must be zero or greater' };
  }

  const toBase = convertToBase(qty, unit);
  if (!toBase.ok) {
    return { ok: false, message: toBase.detail || toBase.reason };
  }

  const absBase = toBase.value;
  let qtyBase: number;
  let resultQtyBase: number | null =
    currentQtyBase === undefined ? null : currentQtyBase;

  switch (mode) {
    case 'adjust': {
      if (absBase === 0) {
        return { ok: false, message: 'Enter a non-zero amount' };
      }
      if (direction === 'remove') {
        // Cap at on-hand so Adjust never writes a negative balance from a mis-dial.
        //
        // The snap-to-empty tolerance was 1e-9, which is far tighter than the
        // error introduced by converting the wheel value. Removing "1.984 lb"
        // against 900 g converts to 899.9999…g, misses that window, and leaves
        // a residue behind — the residue that then rendered as "0 mg / Plenty".
        // Use the same zero-tolerance the stock evaluation uses, so "remove
        // everything" lands on exactly zero.
        if (
          currentQtyBase !== undefined &&
          absBase >= currentQtyBase - DEFAULT_STOCK_EPSILON
        ) {
          qtyBase = -currentQtyBase;
          resultQtyBase = 0;
        } else {
          qtyBase = -absBase;
          if (currentQtyBase !== undefined) {
            resultQtyBase = currentQtyBase + qtyBase;
          }
        }
      } else {
        qtyBase = absBase;
        if (currentQtyBase !== undefined) {
          resultQtyBase = currentQtyBase + qtyBase;
        }
      }
      break;
    }
    case 'recount': {
      qtyBase = absBase;
      resultQtyBase = absBase;
      break;
    }
    case 'waste': {
      if (absBase === 0) {
        return { ok: false, message: 'Enter how much was wasted' };
      }
      // Waste is always a removal — never more than recorded stock.
      if (currentQtyBase !== undefined && absBase >= currentQtyBase - 1e-9) {
        qtyBase = currentQtyBase;
        resultQtyBase = 0;
      } else {
        qtyBase = absBase;
        if (currentQtyBase !== undefined) {
          resultQtyBase = currentQtyBase - absBase;
        }
      }
      break;
    }
    case 'add': {
      if (absBase === 0) {
        return { ok: false, message: 'Quantity must be greater than zero' };
      }
      qtyBase = absBase;
      resultQtyBase = absBase;
      break;
    }
    default: {
      const _exhaustive: never = mode;
      return { ok: false, message: `Unknown mode: ${String(_exhaustive)}` };
    }
  }

  return {
    ok: true,
    outcome: {
      qtyBase,
      resultQtyBase,
      unit,
      qty,
      direction: mode === 'waste' ? 'remove' : direction,
      mode,
    },
  };
}

/**
 * Live preview copy under the wheels.
 * Adjust: "Flour: 4 lb → 2 lb"
 * Recount: "Flour will be set to 2 lb"
 */
export function formatPickerPreview(
  itemName: string,
  mode: PickerMode,
  dim: Dimension,
  selection: PickerSelection,
  currentQtyBase = 0,
): string {
  const resolved = resolvePickerOutcome(selection, mode, currentQtyBase);
  if (!resolved.ok) {
    if (mode === 'recount') {
      return `${itemName} will be set to 0 ${selection.unit}`;
    }
    return `${itemName}: choose an amount`;
  }

  const { outcome } = resolved;
  const nextLabel = formatQuantity(
    mode === 'adjust' || mode === 'waste'
      ? (outcome.resultQtyBase ?? currentQtyBase)
      : outcome.qtyBase,
    dim,
    { preferredUnit: selection.unit, locale: 'us', uncertaintyPct: 0 },
  );

  if (mode === 'recount') {
    return `${itemName} will be set to ${nextLabel}`;
  }

  if (mode === 'add') {
    return `Adding ${nextLabel} of ${itemName}`;
  }

  const currentLabel = formatQuantity(currentQtyBase, dim, {
    preferredUnit: selection.unit,
    locale: 'us',
    uncertaintyPct: 0,
  });

  if (mode === 'waste') {
    return `${itemName}: ${currentLabel} → ${nextLabel}`;
  }

  // adjust
  return `${itemName}: ${currentLabel} → ${nextLabel}`;
}

/** How many wheels each mode shows (chrome / product distinction). */
export function wheelCountForMode(mode: PickerMode): 2 | 3 {
  return mode === 'adjust' ? 3 : 2;
}

export function unitLabel(unit: string): string {
  switch (unit) {
    case 'fl oz':
      return 'fl oz';
    case 'each':
      return 'each';
    case 'dozen':
      return 'dozen';
    case 'tbsp':
      return 'tbsp';
    case 'tsp':
      return 'tsp';
    case 'cup':
      return 'cups';
    default:
      return unit;
  }
}
