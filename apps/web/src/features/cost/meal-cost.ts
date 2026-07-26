/**
 * Cost of a cooked meal from cook txns under cookEventId + purchase unitPrices.
 *
 * Methodology:
 * - Cook deductions share refId = cookEventId (see cook-machine buildCookTxns).
 * - Purchase txns carry unitPrice as the price paid for that purchase's deltaBase.
 * - pricePerBase = unitPrice / deltaBase (when both present and deltaBase > 0).
 * - Line cost = |cook.deltaBase| * latest known pricePerBase for ingredient+form.
 * - Incomplete data is labeled, never presented as a confident full total.
 */

import type {
  ExpensiveIngredient,
  IngredientPricePoint,
  LineCost,
  MealCostResult,
  MealCostTrendPoint,
  PricedTxn,
} from './types';

function isPurchase(t: PricedTxn): boolean {
  return t.kind === 'relative' && t.reason === 'purchase';
}

function isCook(t: PricedTxn): boolean {
  return t.kind === 'relative' && t.reason === 'cook';
}

/**
 * Build latest price-per-base map from purchase history.
 * Later purchases (by occurredAt, then id) win per ingredientId+formId.
 */
export function buildPriceIndex(
  txns: readonly PricedTxn[],
): Map<string, IngredientPricePoint> {
  const sorted = [...txns]
    .filter(isPurchase)
    .filter(
      (t) =>
        t.unitPrice != null &&
        t.unitPrice >= 0 &&
        t.deltaBase != null &&
        t.deltaBase > 0,
    )
    .sort((a, b) => {
      const c = a.occurredAt.localeCompare(b.occurredAt);
      if (c !== 0) return c;
      return a.id.localeCompare(b.id);
    });

  const map = new Map<string, IngredientPricePoint>();
  for (const t of sorted) {
    const key = priceKey(t.ingredientId, t.formId);
    const pricePerBase = (t.unitPrice as number) / (t.deltaBase as number);
    map.set(key, {
      ingredientId: t.ingredientId,
      formId: t.formId,
      pricePerBase,
      asOf: t.occurredAt,
      purchaseTxnId: t.id,
    });
  }
  return map;
}

export function priceKey(ingredientId: string, formId: string): string {
  return `${ingredientId}::${formId}`;
}

/** Cook lines for a single cookEventId (refId). */
export function cookLinesForEvent(
  txns: readonly PricedTxn[],
  cookEventId: string,
): PricedTxn[] {
  return txns.filter(
    (t) => isCook(t) && t.refId === cookEventId && t.deltaBase != null,
  );
}

export function completenessLabel(
  pricedLineCount: number,
  totalLineCount: number,
): string | null {
  if (totalLineCount === 0) return null;
  if (pricedLineCount === totalLineCount) return null;
  if (pricedLineCount === 0) {
    return `No price data for any of ${totalLineCount} ingredients`;
  }
  return `estimated from ${pricedLineCount} of ${totalLineCount} ingredients`;
}

/**
 * Cost a single cook event. servings scales per-serving only (totals are meal-level).
 */
export function costCookEvent(
  txns: readonly PricedTxn[],
  cookEventId: string,
  servings: number = 1,
  priceIndex?: Map<string, IngredientPricePoint>,
): MealCostResult {
  const index = priceIndex ?? buildPriceIndex(txns);
  const cooks = cookLinesForEvent(txns, cookEventId);

  // Aggregate same ingredient+form (multiple lines possible)
  const qtyByKey = new Map<string, { ingredientId: string; formId: string; qtyBase: number }>();
  for (const t of cooks) {
    const qty = Math.abs(t.deltaBase ?? 0);
    if (qty <= 0) continue;
    const key = priceKey(t.ingredientId, t.formId);
    const prev = qtyByKey.get(key);
    if (prev) {
      prev.qtyBase += qty;
    } else {
      qtyByKey.set(key, {
        ingredientId: t.ingredientId,
        formId: t.formId,
        qtyBase: qty,
      });
    }
  }

  const lines: LineCost[] = [];
  let totalCost = 0;
  let pricedLineCount = 0;

  for (const row of qtyByKey.values()) {
    const point = index.get(priceKey(row.ingredientId, row.formId));
    if (point) {
      const lineCost = row.qtyBase * point.pricePerBase;
      totalCost += lineCost;
      pricedLineCount += 1;
      lines.push({
        ingredientId: row.ingredientId,
        formId: row.formId,
        qtyBase: row.qtyBase,
        pricePerBase: point.pricePerBase,
        lineCost,
        priced: true,
      });
    } else {
      lines.push({
        ingredientId: row.ingredientId,
        formId: row.formId,
        qtyBase: row.qtyBase,
        pricePerBase: null,
        lineCost: null,
        priced: false,
      });
    }
  }

  const totalLineCount = lines.length;
  const complete = totalLineCount > 0 && pricedLineCount === totalLineCount;
  const hasAnyPrice = pricedLineCount > 0;
  const safeServings = servings > 0 ? servings : 1;

  return {
    cookEventId,
    lines,
    totalCost: hasAnyPrice ? totalCost : null,
    pricedLineCount,
    totalLineCount,
    servings: safeServings,
    perServing: hasAnyPrice ? totalCost / safeServings : null,
    completenessLabel: completenessLabel(pricedLineCount, totalLineCount),
    complete,
  };
}

/**
 * Recent meal cost trend — one point per distinct cookEventId (cook refIds).
 */
export function mealCostTrend(
  txns: readonly PricedTxn[],
  options: {
    readonly servingsByCookEventId?: ReadonlyMap<string, number>;
    readonly defaultServings?: number;
    readonly limit?: number;
  } = {},
): MealCostTrendPoint[] {
  const priceIndex = buildPriceIndex(txns);
  const cookEvents = new Map<string, string>(); // id → earliest occurredAt

  for (const t of txns) {
    if (!isCook(t) || !t.refId) continue;
    // Skip undo adjust markers
    if (t.refId.startsWith('undo-')) continue;
    const prev = cookEvents.get(t.refId);
    if (!prev || t.occurredAt < prev) {
      cookEvents.set(t.refId, t.occurredAt);
    }
  }

  const points: MealCostTrendPoint[] = [];
  for (const [cookEventId, occurredAt] of cookEvents) {
    const servings =
      options.servingsByCookEventId?.get(cookEventId) ??
      options.defaultServings ??
      1;
    const meal = costCookEvent(txns, cookEventId, servings, priceIndex);
    points.push({
      cookEventId,
      occurredAt,
      totalCost: meal.totalCost,
      perServing: meal.perServing,
      complete: meal.complete,
      completenessLabel: meal.completenessLabel,
    });
  }

  points.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const limit = options.limit ?? 20;
  return points.slice(0, limit);
}

/**
 * Most expensive recurring ingredients across cook events (priced only).
 */
export function mostExpensiveRecurring(
  txns: readonly PricedTxn[],
  options: { readonly minCookCount?: number; readonly limit?: number } = {},
): ExpensiveIngredient[] {
  const minCookCount = options.minCookCount ?? 2;
  const limit = options.limit ?? 10;
  const priceIndex = buildPriceIndex(txns);

  // cookEventId → set of ingredient keys used
  const spend = new Map<
    string,
    { ingredientId: string; formId: string; totalSpend: number; cookEvents: Set<string> }
  >();

  const byEvent = new Map<string, PricedTxn[]>();
  for (const t of txns) {
    if (!isCook(t) || !t.refId || t.refId.startsWith('undo-')) continue;
    const list = byEvent.get(t.refId) ?? [];
    list.push(t);
    byEvent.set(t.refId, list);
  }

  for (const [cookEventId, lines] of byEvent) {
    const meal = costCookEvent(txns, cookEventId, 1, priceIndex);
    for (const line of meal.lines) {
      if (!line.priced || line.lineCost == null) continue;
      const key = priceKey(line.ingredientId, line.formId);
      let row = spend.get(key);
      if (!row) {
        row = {
          ingredientId: line.ingredientId,
          formId: line.formId,
          totalSpend: 0,
          cookEvents: new Set(),
        };
        spend.set(key, row);
      }
      row.totalSpend += line.lineCost;
      row.cookEvents.add(cookEventId);
    }
    void lines;
  }

  const out: ExpensiveIngredient[] = [];
  for (const row of spend.values()) {
    const cookCount = row.cookEvents.size;
    if (cookCount < minCookCount) continue;
    out.push({
      ingredientId: row.ingredientId,
      formId: row.formId,
      totalSpend: row.totalSpend,
      cookCount,
      avgCostPerCook: row.totalSpend / cookCount,
    });
  }

  out.sort((a, b) => b.totalSpend - a.totalSpend);
  return out.slice(0, limit);
}

/** Format money for UI — never invent cents of precision beyond 2. */
export function formatUsd(amount: number | null): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  return `$${amount.toFixed(2)}`;
}
