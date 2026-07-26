/**
 * Normalize vision model line items into pantry-ready shapes.
 * Pure functions — weighed items, multi-buy, discount parent pairing.
 */

import type {
  Allergen,
  ConfidenceBucket,
  ModelLineItem,
  ModelParseResult,
  NormalizedLineItem,
  UnitHint,
} from './types.ts';

const LB_TO_G = 453.59237;
const OZ_TO_G = 28.349523125;
const KG_TO_G = 1000;
const FL_OZ_TO_ML = 29.5735295625;
const L_TO_ML = 1000;

/** Patterns for catch-weight / price-per-lb lines, e.g. "BANANAS 2.14 LB @ 0.59". */
const WEIGHED_RE =
  /(\d+(?:\.\d+)?)\s*(lb|lbs|pound|pounds|oz|ounce|ounces|kg|g)\b(?:\s*@\s*(\d+(?:\.\d+)?))?/i;

/** Multi-buy: "2 @ 3.49", "3/5.00", "2 FOR 5". */
const MULTI_AT_RE = /(\d+)\s*@\s*(\d+(?:\.\d+)?)/i;
const MULTI_SLASH_RE = /(\d+)\s*\/\s*(\d+(?:\.\d+)?)/;
const MULTI_FOR_RE = /(\d+)\s*(?:for|FOR)\s*\$?\s*(\d+(?:\.\d+)?)/;

/** UPC/EAN-ish codes on warehouse receipts. */
const UPC_RE = /\b(\d{8}|\d{12}|\d{13}|\d{14})\b/;

/** Warehouse item code often precedes description: "1234567 ORGANIC MILK". */
const ITEM_CODE_RE = /^(\d{5,7})\s+(.+)$/;

export function mapUnit(raw: string | null | undefined): UnitHint {
  if (!raw) return 'unknown';
  const u = raw.trim().toLowerCase();
  if (['g', 'gram', 'grams'].includes(u)) return 'g';
  if (['kg', 'kilogram', 'kilograms'].includes(u)) return 'kg';
  if (['oz', 'ounce', 'ounces'].includes(u)) return 'oz';
  if (['lb', 'lbs', 'pound', 'pounds'].includes(u)) return 'lb';
  if (['ml', 'milliliter', 'millilitre', 'milliliters'].includes(u)) return 'ml';
  if (['l', 'liter', 'litre', 'liters', 'litres'].includes(u)) return 'l';
  if (['fl oz', 'fl. oz', 'floz', 'fl_oz'].includes(u)) return 'fl_oz';
  if (['each', 'ea', 'ct', 'count', 'pc', 'pcs'].includes(u)) return 'each';
  if (['pk', 'pack', 'package', 'pkg'].includes(u)) return 'pk';
  return 'unknown';
}

export function massToGrams(qty: number, unit: UnitHint): number | null {
  switch (unit) {
    case 'g':
      return qty;
    case 'kg':
      return qty * KG_TO_G;
    case 'oz':
      return qty * OZ_TO_G;
    case 'lb':
      return qty * LB_TO_G;
    default:
      return null;
  }
}

export function volumeToMl(qty: number, unit: UnitHint): number | null {
  switch (unit) {
    case 'ml':
      return qty;
    case 'l':
      return qty * L_TO_ML;
    case 'fl_oz':
      return qty * FL_OZ_TO_ML;
    default:
      return null;
  }
}

export interface WeighedParse {
  readonly quantity: number;
  readonly unit: UnitHint;
  readonly unitPrice: number | null;
  readonly massG: number;
}

export function parseWeighedFromRaw(rawText: string): WeighedParse | null {
  const m = rawText.match(WEIGHED_RE);
  if (!m) return null;
  const qty = Number(m[1]);
  const unit = mapUnit(m[2]);
  const massG = massToGrams(qty, unit);
  if (massG === null || !Number.isFinite(qty) || qty <= 0) return null;
  const unitPrice = m[3] !== undefined ? Number(m[3]) : null;
  return {
    quantity: qty,
    unit,
    unitPrice: unitPrice !== null && Number.isFinite(unitPrice) ? unitPrice : null,
    massG,
  };
}

export interface MultiBuyParse {
  readonly quantity: number;
  readonly unitPrice: number | null;
  readonly totalPrice: number | null;
}

export function parseMultiBuyFromRaw(rawText: string): MultiBuyParse | null {
  let m = rawText.match(MULTI_AT_RE);
  if (m) {
    const quantity = Number(m[1]);
    const unitPrice = Number(m[2]);
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    return {
      quantity,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : null,
      totalPrice:
        Number.isFinite(unitPrice) ? roundMoney(quantity * unitPrice) : null,
    };
  }
  m = rawText.match(MULTI_SLASH_RE);
  if (m) {
    const quantity = Number(m[1]);
    const totalPrice = Number(m[2]);
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    return {
      quantity,
      totalPrice: Number.isFinite(totalPrice) ? totalPrice : null,
      unitPrice:
        Number.isFinite(totalPrice) ? roundMoney(totalPrice / quantity) : null,
    };
  }
  m = rawText.match(MULTI_FOR_RE);
  if (m) {
    const quantity = Number(m[1]);
    const totalPrice = Number(m[2]);
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    return {
      quantity,
      totalPrice: Number.isFinite(totalPrice) ? totalPrice : null,
      unitPrice:
        Number.isFinite(totalPrice) ? roundMoney(totalPrice / quantity) : null,
    };
  }
  return null;
}

export function extractUpc(rawText: string, modelUpc?: string | null): string | null {
  if (modelUpc && /^\d{8,14}$/.test(modelUpc.trim())) return modelUpc.trim();
  const m = rawText.match(UPC_RE);
  return m ? m[1] : null;
}

export function stripWarehouseItemCode(rawText: string, guessedName: string): {
  readonly name: string;
  readonly itemCode: string | null;
} {
  const m = rawText.match(ITEM_CODE_RE);
  if (m) {
    return { name: guessedName || m[2].trim(), itemCode: m[1] };
  }
  return { name: guessedName || rawText, itemCode: null };
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function clampConfidence(c: number): number {
  if (!Number.isFinite(c)) return 0;
  return Math.min(1, Math.max(0, c));
}

function newLineId(index: number): string {
  return `line_${index}`;
}

/**
 * Attach allergens: known only when UPC (or prior map) resolves.
 * Otherwise allergensUnknown: true — unknown is unsafe, never clear.
 */
export function attachAllergens(
  upc: string | null,
  knownByUpc?: Readonly<Record<string, readonly Allergen[]>>,
): { readonly allergens: readonly Allergen[]; readonly allergensUnknown: boolean } {
  if (upc && knownByUpc && Object.prototype.hasOwnProperty.call(knownByUpc, upc)) {
    return {
      allergens: [...knownByUpc[upc]],
      allergensUnknown: false,
    };
  }
  return { allergens: [], allergensUnknown: true };
}

export function confidenceBuckets(
  items: readonly NormalizedLineItem[],
): ConfidenceBucket {
  let high = 0;
  let medium = 0;
  let low = 0;
  for (const it of items) {
    if (it.lineType !== 'food' && it.lineType !== 'unknown') continue;
    if (it.confidence >= 0.8) high++;
    else if (it.confidence >= 0.5) medium++;
    else low++;
  }
  return { high, medium, low };
}

function normalizeOne(
  line: ModelLineItem,
  index: number,
  knownByUpc?: Readonly<Record<string, readonly Allergen[]>>,
): NormalizedLineItem {
  const rawText = line.rawText.trim();
  const { name } = stripWarehouseItemCode(rawText, line.guessedName.trim());
  const upc = extractUpc(rawText, line.upc);
  const allergens = attachAllergens(upc, knownByUpc);

  const weighed = parseWeighedFromRaw(rawText);
  const multi = weighed ? null : parseMultiBuyFromRaw(rawText);

  let quantity = line.quantity;
  let unit = mapUnit(line.unit);
  let unitPrice = line.unitPrice;
  let totalPrice = line.totalPrice;
  let massG: number | null = null;
  let volumeMl: number | null = null;
  let multiBuy = false;
  let isWeighed = false;

  if (weighed) {
    isWeighed = true;
    quantity = weighed.quantity;
    unit = weighed.unit;
    massG = weighed.massG;
    if (weighed.unitPrice !== null) unitPrice = weighed.unitPrice;
    if (totalPrice === null && unitPrice !== null) {
      totalPrice = roundMoney(weighed.quantity * unitPrice);
    }
  } else if (multi) {
    multiBuy = true;
    quantity = multi.quantity;
    if (unit === 'unknown') unit = 'each';
    if (multi.unitPrice !== null) unitPrice = multi.unitPrice;
    if (multi.totalPrice !== null) totalPrice = multi.totalPrice;
  } else {
    // Package mass/volume from unit fields when present.
    if (quantity !== null && Number.isFinite(quantity)) {
      massG = massToGrams(quantity, unit);
      volumeMl = volumeToMl(quantity, unit);
      // If model put package size in quantity with mass unit, keep; else try packageSize.
    }
    if (massG === null && line.packageSize) {
      const pkgWeighed = parseWeighedFromRaw(line.packageSize);
      if (pkgWeighed) massG = pkgWeighed.massG;
      else {
        const pkgUnit = mapUnit(line.unit);
        const pkgQty = Number.parseFloat(line.packageSize);
        if (Number.isFinite(pkgQty)) {
          massG = massToGrams(pkgQty, pkgUnit);
          volumeMl = volumeToMl(pkgQty, pkgUnit);
        }
      }
    }
  }

  // Negative prices are discounts.
  let lineType = line.lineType;
  if (
    totalPrice !== null &&
    totalPrice < 0 &&
    lineType !== 'tax' &&
    lineType !== 'total'
  ) {
    lineType = 'discount';
  }

  return {
    id: newLineId(index),
    rawText,
    guessedName: name,
    quantity,
    unit,
    massG: massG !== null ? Math.round(massG * 1000) / 1000 : null,
    volumeMl: volumeMl !== null ? Math.round(volumeMl * 1000) / 1000 : null,
    packageSize: line.packageSize,
    unitPrice,
    totalPrice,
    confidence: clampConfidence(line.confidence),
    lineType,
    upc,
    parentLineId: null,
    multiBuy,
    weighed: isWeighed,
    allergens: allergens.allergens,
    allergensUnknown: allergens.allergensUnknown,
  };
}

/**
 * Pair discount lines to the nearest preceding food line when model
 * parentRawText is missing or when raw text references the parent.
 */
export function pairDiscountParents(
  items: readonly NormalizedLineItem[],
  modelLines: readonly ModelLineItem[],
): NormalizedLineItem[] {
  const out = items.map((it) => ({ ...it }));
  for (let i = 0; i < out.length; i++) {
    if (out[i].lineType !== 'discount') continue;
    const modelParent = modelLines[i]?.parentRawText?.trim().toLowerCase();
    if (modelParent) {
      const found = out.findIndex(
        (c, j) =>
          j < i &&
          (c.lineType === 'food' || c.lineType === 'unknown') &&
          (c.rawText.toLowerCase().includes(modelParent) ||
            c.guessedName.toLowerCase().includes(modelParent) ||
            modelParent.includes(c.guessedName.toLowerCase())),
      );
      if (found >= 0) {
        out[i] = { ...out[i], parentLineId: out[found].id };
        continue;
      }
    }
    // Fallback: nearest preceding food line.
    for (let j = i - 1; j >= 0; j--) {
      if (out[j].lineType === 'food' || out[j].lineType === 'unknown') {
        out[i] = { ...out[i], parentLineId: out[j].id };
        break;
      }
    }
  }
  return out;
}

export interface NormalizeResult {
  readonly items: readonly NormalizedLineItem[];
  readonly confidence: ConfidenceBucket;
  readonly warnings: readonly string[];
}

/**
 * Full normalization pipeline for a validated model parse result.
 */
export function normalizeParseResult(
  model: ModelParseResult,
  knownByUpc?: Readonly<Record<string, readonly Allergen[]>>,
): NormalizeResult {
  const warnings: string[] = [];
  const foodish = model.lines.filter(
    (l) => l.lineType === 'food' || l.lineType === 'unknown',
  );
  if (foodish.length === 0 && model.lines.length > 0) {
    warnings.push('no_food_lines');
  }
  const lowConf = foodish.filter((l) => l.confidence < 0.4).length;
  if (lowConf > 0 && lowConf === foodish.length && foodish.length > 0) {
    warnings.push('all_lines_low_confidence');
  }

  const draft = model.lines.map((line, i) =>
    normalizeOne(line, i, knownByUpc),
  );
  const items = pairDiscountParents(draft, model.lines);
  return {
    items,
    confidence: confidenceBuckets(items),
    warnings,
  };
}
