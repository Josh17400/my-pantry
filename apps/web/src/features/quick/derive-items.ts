/**
 * Pure tile derivation for quick-eat.
 *
 * Live mode: only pantry lines with stock above DEFAULT_STOCK_EPSILON.
 * Demo mode: fixed demo catalog (never mixed into live).
 */

import { DEFAULT_STOCK_EPSILON, type Dimension } from '@larder/core';

import {
  DEMO_PINS,
  DEMO_SUGGESTED_CATALOG,
  demoQuickPrefs,
} from './prefs';
import type { QuickItem, QuickPantryLine, QuickPrefs } from './types';

/** Cap suggested tiles so a large pantry does not flood the screen. */
export const MAX_SUGGESTED_TILES = 12;

/**
 * Sensible one-tap amount from form dimension, never above on-hand stock.
 * Count → 1; mass → ~170 g (yogurt cup); volume → ~250 ml (cup).
 */
export function defaultConsumeQtyBase(
  dim: Dimension,
  stockQtyBase: number,
  preferred?: number,
): number {
  if (!(stockQtyBase > DEFAULT_STOCK_EPSILON)) return 0;
  let preferredQty: number;
  if (preferred !== undefined && Number.isFinite(preferred) && preferred > 0) {
    preferredQty = preferred;
  } else if (dim === 'count') {
    preferredQty = 1;
  } else if (dim === 'volume') {
    preferredQty = 250;
  } else {
    preferredQty = 170;
  }
  // Never offer more than is on hand (same negative-balance guard as the picker).
  return Math.min(preferredQty, stockQtyBase);
}

/** Max integer multiplier such that defaultQtyBase * mult <= stock. */
export function maxMultiplierForStock(
  defaultQtyBase: number,
  stockQtyBase: number,
): number {
  if (!(defaultQtyBase > 0) || !(stockQtyBase > DEFAULT_STOCK_EPSILON)) {
    return 0;
  }
  return Math.max(1, Math.floor(stockQtyBase / defaultQtyBase + 1e-12));
}

/**
 * Clamp a planned consume amount to on-hand stock.
 * Returns 0 when nothing consumable remains.
 */
export function clampConsumeQty(
  plannedQtyBase: number,
  stockQtyBase: number,
): number {
  if (!(plannedQtyBase > 0)) return 0;
  if (!(stockQtyBase > DEFAULT_STOCK_EPSILON)) return 0;
  return Math.min(plannedQtyBase, stockQtyBase);
}

function lineKey(ingredientId: string, formId: string): string {
  return `${ingredientId}\0${formId}`;
}

function isInStock(qtyBase: number): boolean {
  return qtyBase > DEFAULT_STOCK_EPSILON;
}

function displayName(line: QuickPantryLine): string {
  // Tiles are one-tap targets, so the ingredient name alone reads best:
  // "Egg", not "Egg (whole)". Form only ever disambiguates in the detail view.
  return line.ingredientName.trim() || line.ingredientId;
}

function compareSuggested(
  a: { frequency: number; updatedAt: string; name: string },
  b: { frequency: number; updatedAt: string; name: string },
): number {
  // History beats no history; higher frequency first.
  if (a.frequency !== b.frequency) return b.frequency - a.frequency;
  // Ties: most recently purchased/updated first.
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt < b.updatedAt ? 1 : -1;
  }
  return a.name.localeCompare(b.name);
}

/**
 * Build demo tiles from the fixed catalog (unmistakably demo).
 * Does not consult pantry.
 */
export function buildDemoItems(prefs?: QuickPrefs): QuickItem[] {
  const p = prefs ?? demoQuickPrefs();
  const pinnedIds = new Set(p.pins.map((pin) => pin.ingredientId));
  const pinsSource = p.pins.length > 0 ? p.pins : DEMO_PINS;

  const pinned: QuickItem[] = pinsSource.map((pin) => ({
    id: `pin-${pin.ingredientId}-${pin.formId}`,
    ingredientId: pin.ingredientId,
    formId: pin.formId,
    name: pin.name,
    defaultQtyBase: pin.defaultQtyBase,
    dim: pin.dim,
    origin: 'pinned' as const,
    frequency: p.frequency[pin.ingredientId] ?? 0,
    // Demo pretends generous stock so tiles remain consumable for design review.
    stockQtyBase: pin.defaultQtyBase * 12,
    consumable: true,
  }));

  const suggested: QuickItem[] = DEMO_SUGGESTED_CATALOG.filter(
    (s) => !pinnedIds.has(s.ingredientId),
  )
    .map((s) => ({
      id: `sug-${s.ingredientId}-${s.formId}`,
      ingredientId: s.ingredientId,
      formId: s.formId,
      name: s.name,
      defaultQtyBase: s.defaultQtyBase,
      dim: s.dim,
      origin: 'suggested' as const,
      frequency: p.frequency[s.ingredientId] ?? 0,
      stockQtyBase: s.defaultQtyBase * 12,
      consumable: true,
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 4);

  return [...pinned, ...suggested];
}

export type BuildLiveItemsOptions = {
  prefs: QuickPrefs;
  pantry: readonly QuickPantryLine[];
  /**
   * Ruling: pinned items that are out of stock are **hidden** (not shown as
   * greyed tiles). Pin preference remains in prefs and reappears when stock
   * returns. Rationale: a tile that looks like food but cannot be eaten is
   * the same class of fiction as offering yogurt you do not own; hiding keeps
   * the screen honest and the pin preference durable.
   */
  includeOutOfStockPins?: boolean;
};

/**
 * Live tiles strictly from pantry stock + real frequency prefs.
 *
 * - A tile only for lines with qty > DEFAULT_STOCK_EPSILON (unless
 *   includeOutOfStockPins shows a non-consumable pin — default off / hidden).
 * - Ranking of suggestions: frequency desc, then updatedAt desc.
 * - defaultQtyBase never exceeds on-hand stock.
 */
export function buildLiveItems(options: BuildLiveItemsOptions): QuickItem[] {
  const { prefs, pantry, includeOutOfStockPins = false } = options;

  const byKey = new Map<string, QuickPantryLine>();
  for (const line of pantry) {
    byKey.set(lineKey(line.ingredientId, line.formId), line);
  }

  const pinnedKeys = new Set<string>();
  const pinned: QuickItem[] = [];

  for (const pin of prefs.pins) {
    const key = lineKey(pin.ingredientId, pin.formId);
    pinnedKeys.add(key);
    const line = byKey.get(key);
    const stock = line?.qtyBase ?? 0;
    const inStock = isInStock(stock);

    if (!inStock && !includeOutOfStockPins) {
      // Hidden out-of-stock pin — preference kept in prefs only.
      continue;
    }

    const dim = line?.dim ?? pin.dim;
    const defaultQty = inStock
      ? defaultConsumeQtyBase(dim, stock, pin.defaultQtyBase)
      : pin.defaultQtyBase;

    pinned.push({
      id: `pin-${pin.ingredientId}-${pin.formId}`,
      ingredientId: pin.ingredientId,
      formId: pin.formId,
      name: pin.name,
      defaultQtyBase: defaultQty,
      dim,
      origin: 'pinned',
      frequency: prefs.frequency[pin.ingredientId] ?? 0,
      stockQtyBase: stock,
      consumable: inStock && defaultQty > 0,
    });
  }

  const candidates: {
    line: QuickPantryLine;
    frequency: number;
    updatedAt: string;
    name: string;
  }[] = [];

  for (const line of pantry) {
    const key = lineKey(line.ingredientId, line.formId);
    if (pinnedKeys.has(key)) continue;
    if (!isInStock(line.qtyBase)) continue;
    // Also skip if this ingredientId is already pinned under another form
    // (pin is a user preference at ingredient level in the UI).
    if (prefs.pins.some((p) => p.ingredientId === line.ingredientId)) {
      continue;
    }
    candidates.push({
      line,
      frequency: prefs.frequency[line.ingredientId] ?? 0,
      updatedAt: line.updatedAt,
      name: displayName(line),
    });
  }

  candidates.sort(compareSuggested);

  const suggested: QuickItem[] = candidates
    .slice(0, MAX_SUGGESTED_TILES)
    .map(({ line, frequency, name }) => {
      const defaultQty = defaultConsumeQtyBase(line.dim, line.qtyBase);
      return {
        id: `sug-${line.ingredientId}-${line.formId}`,
        ingredientId: line.ingredientId,
        formId: line.formId,
        name,
        defaultQtyBase: defaultQty,
        dim: line.dim,
        origin: 'suggested' as const,
        frequency,
        stockQtyBase: line.qtyBase,
        consumable: defaultQty > 0,
      };
    })
    .filter((item) => item.consumable);

  return [...pinned, ...suggested];
}

/**
 * Top-level builder: demo fixtures when mode is demo; otherwise pantry-derived.
 */
export function buildItems(
  mode: 'live' | 'demo',
  prefs: QuickPrefs,
  pantry: readonly QuickPantryLine[],
): QuickItem[] {
  if (mode === 'demo') {
    return buildDemoItems(prefs);
  }
  return buildLiveItems({ prefs, pantry });
}
