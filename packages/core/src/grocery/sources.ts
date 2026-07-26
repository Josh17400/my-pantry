/**
 * Helpers that turn pantry stock / cook plans / reorder cadence into GrocerySource[].
 */

import type { CookPlan } from '../recipes/types';
import type {
  GrocerySource,
  ReorderSuggestion,
  StockGroceryInput,
} from './types';

/**
 * Low / out stock rows → grocery sources.
 * Suggested qty defaults to parLevelBase (restock to par).
 */
export function sourcesFromStock(
  items: readonly StockGroceryInput[],
): GrocerySource[] {
  const out: GrocerySource[] = [];
  for (const item of items) {
    const { evaluation } = item;
    if (evaluation.status !== 'low' && evaluation.status !== 'out') continue;

    const kind = evaluation.status === 'out' ? 'stock-out' : 'stock-low';
    const suggested =
      item.suggestedQtyBase ??
      (evaluation.parLevelBase > 0
        ? Math.max(0, evaluation.parLevelBase - Math.max(0, evaluation.qtyBase))
        : 0);

    // If fully out and par unknown, still surface the line with qtyBase 0 note
    out.push({
      kind,
      ingredientId: item.ingredientId,
      formId: item.formId,
      name: item.name,
      category: item.category,
      qtyBase: suggested > 0 ? suggested : evaluation.parLevelBase > 0 ? evaluation.parLevelBase : undefined,
      dim: item.dim,
      note:
        evaluation.status === 'out'
          ? 'Out of stock'
          : `Low (${Math.round((evaluation.ratio ?? 0) * 100)}% of par)`,
    });
  }
  return out;
}

/**
 * Recipe plan shortfalls → grocery sources.
 * Uses shortfallBase when convertible; skips non-quantified / optional-missing
 * with no shortfall; **never** invents zero for not-convertible (still surfaces
 * a free-text reminder line so the shopper knows).
 */
export function sourcesFromPlanShortfalls(
  recipeId: string,
  plan: CookPlan,
  opts: {
    recipeTitle?: string;
    names?: ReadonlyMap<string, string>;
    categories?: ReadonlyMap<string, string>;
  } = {},
): GrocerySource[] {
  const out: GrocerySource[] = [];

  for (const pl of plan.lines) {
    if (pl.status === 'enough' || pl.status === 'non-quantified') continue;
    if (pl.status === 'optional-missing') continue;

    // Group satisfied — no need to buy this member
    if (pl.groupSatisfied === true && pl.status !== 'not-convertible') {
      // If group is satisfied by another member, skip short/missing members
      if (pl.status === 'short' || pl.status === 'not-in-pantry') continue;
    }

    const line = pl.line;
    const ingredientId = line.ingredientId;
    const name =
      (ingredientId && opts.names?.get(ingredientId)) ||
      line.rawText ||
      ingredientId ||
      'Unknown';
    const category =
      (ingredientId && opts.categories?.get(ingredientId)) || undefined;

    if (pl.status === 'not-convertible') {
      // Surface separately — do not invent a quantity
      out.push({
        kind: 'recipe-shortfall',
        ingredientId,
        formId: line.formId,
        name,
        category,
        rawText: line.rawText,
        recipeId,
        recipeTitle: opts.recipeTitle,
        note: 'Not convertible — check form/unit manually',
        // no qtyBase — aggregation keeps as unquantified / separate
      });
      continue;
    }

    if (pl.shortfallBase !== null && pl.convertible && pl.needDim) {
      out.push({
        kind: 'recipe-shortfall',
        ingredientId,
        formId: pl.pantryFormId ?? line.formId,
        name,
        category,
        qtyBase: pl.shortfallBase,
        dim: pl.needDim,
        rawText: line.rawText,
        recipeId,
        recipeTitle: opts.recipeTitle,
        // Preserve range high already baked into plan need via needQtyFromLine
      });
      continue;
    }

    if (pl.status === 'not-in-pantry' || pl.status === 'short') {
      // Try display units from the scaled line (high for ranges)
      const qty =
        line.isRange || line.qtyHigh !== undefined
          ? (line.qtyHigh ?? line.qty)
          : line.qty;
      out.push({
        kind: 'recipe-shortfall',
        ingredientId,
        formId: line.formId,
        name,
        category,
        qty: qty,
        unit: line.unit,
        qtyHigh: line.qtyHigh,
        isRange: line.isRange,
        rawText: line.rawText,
        recipeId,
        recipeTitle: opts.recipeTitle,
      });
    }
  }

  return out;
}

/** Convenience: multiple recipes' plans. */
export function sourcesFromPlans(
  plans: readonly {
    recipeId: string;
    recipeTitle?: string;
    plan: CookPlan;
  }[],
  opts: {
    names?: ReadonlyMap<string, string>;
    categories?: ReadonlyMap<string, string>;
  } = {},
): GrocerySource[] {
  const out: GrocerySource[] = [];
  for (const p of plans) {
    out.push(
      ...sourcesFromPlanShortfalls(p.recipeId, p.plan, {
        recipeTitle: p.recipeTitle,
        names: opts.names,
        categories: opts.categories,
      }),
    );
  }
  return out;
}

export function sourcesFromReorder(
  items: readonly ReorderSuggestion[],
): GrocerySource[] {
  return items.map((item) => ({
    kind: 'reorder' as const,
    ingredientId: item.ingredientId,
    formId: item.formId,
    name: item.name,
    category: item.category,
    qtyBase: item.suggestedQtyBase,
    dim: item.dim,
    note:
      item.note ??
      (item.cadenceDays !== undefined
        ? `Reorder cadence ~${item.cadenceDays}d`
        : 'Reorder suggestion'),
  }));
}

export function manualSource(
  partial: Omit<GrocerySource, 'kind'> & { kind?: 'manual' },
): GrocerySource {
  return { ...partial, kind: 'manual' };
}
