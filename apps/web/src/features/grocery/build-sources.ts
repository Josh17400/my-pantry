/**
 * Assemble GrocerySource[] from pantry stock, reorder cadence, and recipes.
 * Pure orchestration — aggregation is core buildList.
 */

import {
  type Dimension,
  evaluateStock,
  medianDaysBetweenPurchases,
  type PantryTxn,
  purchasesFromDeltas,
} from '@larder/core';

import type { IngredientForm } from '../../../../../packages/core/src/domain/types.ts';
import type { ConversionEdge } from '../../../../../packages/core/src/domain/types.ts';
// Deep-import planCook — not on root barrel yet.
import { planCook } from '../../../../../packages/core/src/recipes/index.ts';
import type {
  ConversionContext,
  PantryStockRow,
  Recipe,
} from '../../../../../packages/core/src/recipes/types.ts';
import type { PantryItemView } from '../../db/types';
import type { RecipeDetail } from '../../db/types';
import {
  type GrocerySource,
  manualSource,
  type ReorderSuggestion,
  sourcesFromPlans,
  sourcesFromReorder,
  sourcesFromStock,
  type StockGroceryInput,
} from './core-grocery';

export type ReorderDetail = ReorderSuggestion & {
  cadenceDays: number;
  daysSinceLast: number;
  lastBoughtAt: string;
};

function asDim(dim: string): Dimension {
  if (dim === 'mass' || dim === 'volume' || dim === 'count') return dim;
  return 'mass';
}

/** Stock low/out → sources (via core helper). */
export function stockSourcesFromPantry(
  items: readonly PantryItemView[],
): GrocerySource[] {
  const stock: StockGroceryInput[] = items.map((item) => {
    const evaluation = evaluateStock(
      item.qtyBase,
      item.parLevelBase,
      { lowThresholdPct: item.lowThresholdPct },
    );
    return {
      ingredientId: item.ingredientId,
      formId: item.formId,
      evaluation,
      name: item.ingredientName,
      category: undefined, // filled by buildList from ingredients map
      dim: asDim(item.dim),
    };
  });
  return sourcesFromStock(stock);
}

/**
 * Derive reorder suggestions from purchase ledger history.
 * "You usually buy milk every 7 days — last bought 8 days ago."
 */
export function reorderFromPurchaseHistory(
  items: readonly PantryItemView[],
  txnsByIngredient: ReadonlyMap<string, readonly PantryTxn[]>,
  nowMs: number,
): { sources: GrocerySource[]; details: ReorderDetail[] } {
  const suggestions: ReorderDetail[] = [];

  for (const item of items) {
    const txns = txnsByIngredient.get(item.ingredientId) ?? [];
    const purchaseDeltas = txns
      .filter(
        (t): t is PantryTxn & { kind: 'relative'; deltaBase: number } =>
          t.kind === 'relative' &&
          t.reason === 'purchase' &&
          typeof t.deltaBase === 'number' &&
          t.deltaBase > 0,
      )
      .map((t) => ({ deltaBase: t.deltaBase, occurredAt: t.occurredAt }));

    if (purchaseDeltas.length < 2) continue;

    const purchases = purchasesFromDeltas(purchaseDeltas);
    const cadence = medianDaysBetweenPurchases(purchases);
    if (cadence === null || cadence <= 0) continue;

    const last = purchases
      .slice()
      .sort(
        (a, b) =>
          Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
      )[0];
    if (!last) continue;

    const daysSinceLast =
      (nowMs - Date.parse(last.occurredAt)) / (24 * 60 * 60 * 1000);
    // Suggest when overdue by ≥1 day past cadence
    if (daysSinceLast < cadence + 1) continue;

    // Don't double-count items already low/out (stock sources cover those)
    const eval_ = evaluateStock(item.qtyBase, item.parLevelBase, {
      lowThresholdPct: item.lowThresholdPct,
    });
    if (eval_.status === 'low' || eval_.status === 'out') continue;

    const suggestedQty =
      purchases.length > 0
        ? medianQty(purchases.map((p) => p.qtyBase))
        : item.parLevelBase > 0
          ? item.parLevelBase
          : 1;

    const cadenceDays = Math.round(cadence);
    const daysAgo = Math.round(daysSinceLast);

    suggestions.push({
      ingredientId: item.ingredientId,
      formId: item.formId,
      suggestedQtyBase: suggestedQty,
      dim: asDim(item.dim),
      name: item.ingredientName,
      cadenceDays,
      daysSinceLast: daysAgo,
      lastBoughtAt: last.occurredAt,
      note: `You usually buy every ${cadenceDays} days — last bought ${daysAgo} days ago`,
    });
  }

  return {
    sources: sourcesFromReorder(suggestions),
    details: suggestions,
  };
}

function medianQty(values: number[]): number {
  if (values.length === 0) return 1;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 0) {
    return (s[mid - 1]! + s[mid]!) / 2;
  }
  return s[mid]!;
}

/** Recipe shortfalls → sources via core planCook + sourcesFromPlans. */
export function recipeShortfallSources(
  recipes: readonly RecipeDetail[],
  pantry: readonly PantryItemView[],
  forms: readonly IngredientForm[],
  edges: readonly ConversionEdge[],
  names: ReadonlyMap<string, string>,
  categories: ReadonlyMap<string, string>,
): GrocerySource[] {
  const pantryRows: PantryStockRow[] = pantry.map((p) => ({
    ingredientId: p.ingredientId,
    formId: p.formId,
    qtyBase: p.qtyBase,
    dim: asDim(p.dim),
  }));

  const ctx: ConversionContext = { forms, edges };

  const plans = recipes.map((r) => {
    const recipe: Recipe = {
      id: r.id,
      title: r.title,
      servings: r.servings,
      ingredients: r.ingredients.map((line) => ({
        ingredientId: line.ingredientId,
        formId: line.formId,
        rawText: line.rawText,
        qty: line.qty ?? null,
        unit: line.unit ?? null,
        optional: line.optional,
        group: line.group,
        substitutes: line.substitutes,
        unknownAllergens: line.unknownAllergens,
        nonQuantified: line.nonQuantified,
        qtyHigh: line.qtyHigh,
        qtyLow: line.qtyLow,
        isRange: line.isRange,
      })),
      steps: r.steps.map((s) => ({
        text: s.text,
        durationSec: s.durationSec ?? undefined,
        timerLabel: s.timerLabel ?? undefined,
      })),
    };
    const plan = planCook(recipe, r.servings, pantryRows, ctx);
    return { recipeId: r.id, recipeTitle: r.title, plan };
  });

  return sourcesFromPlans(plans, { names, categories });
}

export function manualAddSource(input: {
  name: string;
  ingredientId?: string;
  formId?: string;
  category?: string;
  qtyBase?: number;
  dim?: Dimension;
  qty?: number;
  unit?: string;
  note?: string;
}): GrocerySource {
  return manualSource({
    name: input.name,
    ingredientId: input.ingredientId,
    formId: input.formId,
    category: input.category ?? 'Other',
    qtyBase: input.qtyBase,
    dim: input.dim,
    qty: input.qty,
    unit: input.unit,
    note: input.note,
  });
}
