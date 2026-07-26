/**
 * planCook — pure cook preview: scale, convert each line into pantry form,
 * return need / have / shortfall / status. Never writes transactions.
 *
 * Headline rule: unconvertible lines are status `not-convertible` with
 * shortfallBase null — never guessed as zero.
 */

import type { Dimension } from '../domain/types';
import type { IngredientForm } from '../domain/types';
import { convert } from '../units/convert';
import { dimensionOf } from '../units/factors';
import { BASE_UNIT } from '../units/types';
import { isNonQuantifiedLine, scaleRecipe } from './scale';
import type {
  ConversionContext,
  CookLineStatus,
  CookPlan,
  CookPlanLine,
  PantryStockRow,
  Recipe,
  ScaledRecipeLine,
} from './types';

/** Index pantry rows by ingredientId for O(1) lookup. */
export function indexPantryByIngredient(
  pantry: readonly PantryStockRow[],
): Map<string, PantryStockRow[]> {
  const map = new Map<string, PantryStockRow[]>();
  for (const row of pantry) {
    const list = map.get(row.ingredientId);
    if (list) {
      list.push(row);
    } else {
      map.set(row.ingredientId, [row]);
    }
  }
  return map;
}

function formByIdMap(
  forms: readonly IngredientForm[],
): Map<string, IngredientForm> {
  return new Map(forms.map((f) => [f.id, f]));
}

/**
 * Quantity to use for need/shortfall.
 * Ranges use **high** (under-buying means a second trip).
 * Midpoint remains on the line for other consumers.
 */
export function needQtyFromLine(line: ScaledRecipeLine): number | null {
  if (isNonQuantifiedLine(line)) return null;
  if (line.isRange || (line.qtyHigh !== undefined && line.qtyHigh !== null)) {
    const high = line.qtyHigh ?? line.qty;
    if (high === null || !Number.isFinite(high)) return line.qty;
    return high;
  }
  return line.qty;
}

type ConvertNeedResult =
  | {
      ok: true;
      needBase: number;
      haveBase: number;
      dim: Dimension;
      pantryFormId: string;
      uncertaintyPct: number;
      ingredientId: string;
    }
  | {
      ok: false;
      reason: 'not-in-pantry' | 'not-convertible';
      /** True when pantry rows existed but no conversion path. */
      hadRows: boolean;
      /** Best-effort uncertainty if partial info available. */
      uncertaintyPct: number | null;
    };

/**
 * Convert recipe need into a pantry form's base and sum have for that form.
 * Tries preferred formId first, then other rows for the ingredient.
 */
function convertNeedAgainstIngredient(
  line: ScaledRecipeLine,
  ingredientId: string,
  qty: number,
  unit: string,
  pantryByIng: Map<string, PantryStockRow[]>,
  ctx: ConversionContext,
  formsById: Map<string, IngredientForm>,
): ConvertNeedResult {
  const rows = pantryByIng.get(ingredientId) ?? [];
  if (rows.length === 0) {
    return { ok: false, reason: 'not-in-pantry', hadRows: false, uncertaintyPct: null };
  }

  const edges = ctx.edges ?? [];

  // Prefer line.formId match, then stable order by formId
  const ordered = [...rows].sort((a, b) => {
    if (line.formId) {
      if (a.formId === line.formId && b.formId !== line.formId) return -1;
      if (b.formId === line.formId && a.formId !== line.formId) return 1;
    }
    return a.formId.localeCompare(b.formId);
  });

  // Group qty by formId
  const byForm = new Map<string, { qtyBase: number; dim: Dimension }>();
  for (const row of ordered) {
    const prev = byForm.get(row.formId);
    if (prev) {
      byForm.set(row.formId, {
        qtyBase: prev.qtyBase + row.qtyBase,
        dim: row.dim,
      });
    } else {
      byForm.set(row.formId, { qtyBase: row.qtyBase, dim: row.dim });
    }
  }

  const formIds = [...byForm.keys()].sort((a, b) => {
    if (line.formId) {
      if (a === line.formId && b !== line.formId) return -1;
      if (b === line.formId && a !== line.formId) return 1;
    }
    return a.localeCompare(b);
  });

  let sawConvertibleAttempt = false;

  for (const pantryFormId of formIds) {
    const stock = byForm.get(pantryFormId)!;
    const toUnit = BASE_UNIT[stock.dim];
    const form = formsById.get(pantryFormId);
    const fromForm = line.formId ? formsById.get(line.formId) : undefined;

    const formsForConvert: IngredientForm[] = [];
    if (fromForm) formsForConvert.push(fromForm);
    if (form && form.id !== fromForm?.id) formsForConvert.push(form);
    // Include full catalog so multi-hop edges resolve
    for (const f of ctx.forms) {
      if (!formsForConvert.some((x) => x.id === f.id)) {
        formsForConvert.push(f);
      }
    }

    const converted = convert({
      value: qty,
      fromUnit: unit,
      toUnit,
      fromFormId: line.formId,
      toFormId: pantryFormId,
      form: form ?? fromForm,
      forms: formsForConvert,
      edges,
    });

    if (!converted.ok) {
      sawConvertibleAttempt = true;
      continue;
    }

    return {
      ok: true,
      needBase: converted.value,
      haveBase: stock.qtyBase,
      dim: stock.dim,
      pantryFormId,
      uncertaintyPct: converted.uncertaintyPct,
      ingredientId,
    };
  }

  // Same-dimension fallback when unit is known but forms missing from catalog
  const unitDim = dimensionOf(unit);
  if (unitDim) {
    for (const pantryFormId of formIds) {
      const stock = byForm.get(pantryFormId)!;
      if (stock.dim !== unitDim) continue;
      const toUnit = BASE_UNIT[stock.dim];
      const converted = convert({
        value: qty,
        fromUnit: unit,
        toUnit,
      });
      if (!converted.ok) {
        sawConvertibleAttempt = true;
        continue;
      }
      // Only allow formless same-dim when line has no form or matches pantry form
      if (line.formId && line.formId !== pantryFormId) {
        sawConvertibleAttempt = true;
        continue;
      }
      return {
        ok: true,
        needBase: converted.value,
        haveBase: stock.qtyBase,
        dim: stock.dim,
        pantryFormId,
        uncertaintyPct: converted.uncertaintyPct,
        ingredientId,
      };
    }
  }

  return {
    ok: false,
    reason: 'not-convertible',
    hadRows: true,
    uncertaintyPct: sawConvertibleAttempt ? null : null,
  };
}

function evaluateLine(
  line: ScaledRecipeLine,
  pantryByIng: Map<string, PantryStockRow[]>,
  ctx: ConversionContext,
  formsById: Map<string, IngredientForm>,
): CookPlanLine {
  if (isNonQuantifiedLine(line)) {
    return {
      line,
      needBase: null,
      haveBase: null,
      shortfallBase: null,
      convertible: false,
      uncertaintyPct: null,
      status: 'non-quantified',
      groupSatisfied: undefined,
    };
  }

  const qty = needQtyFromLine(line);
  const unit = line.unit;
  if (qty === null || unit === null) {
    return {
      line,
      needBase: null,
      haveBase: null,
      shortfallBase: null,
      convertible: false,
      uncertaintyPct: null,
      status: 'non-quantified',
    };
  }

  // Unmatched free text — no ingredient to look up
  if (!line.ingredientId) {
    const status: CookLineStatus = line.optional
      ? 'optional-missing'
      : 'not-in-pantry';
    return {
      line,
      needBase: null,
      haveBase: null,
      shortfallBase: null,
      convertible: false,
      uncertaintyPct: null,
      status,
    };
  }

  const candidates: string[] = [line.ingredientId];
  if (line.substitutes) {
    for (const s of line.substitutes) {
      if (s && !candidates.includes(s)) candidates.push(s);
    }
  }

  let anyHadRows = false;
  let anyNotConvertible = false;
  let bestShort: ConvertNeedResult & { ok: true } | null = null;

  for (const ingId of candidates) {
    const result = convertNeedAgainstIngredient(
      line,
      ingId,
      qty,
      unit,
      pantryByIng,
      ctx,
      formsById,
    );

    if (result.ok) {
      const shortfall = Math.max(0, result.needBase - result.haveBase);
      if (result.haveBase + 1e-9 >= result.needBase) {
        return {
          line,
          needBase: result.needBase,
          haveBase: result.haveBase,
          shortfallBase: 0,
          convertible: true,
          uncertaintyPct: result.uncertaintyPct,
          status: 'enough',
          pantryFormId: result.pantryFormId,
          needDim: result.dim,
          satisfiedByIngredientId: result.ingredientId,
        };
      }
      // Keep the "best" short (smallest shortfall) in case no candidate is enough
      if (!bestShort || shortfall < bestShort.needBase - bestShort.haveBase) {
        bestShort = result;
      }
      continue;
    }

    if (result.hadRows) {
      anyHadRows = true;
      anyNotConvertible = true;
    }
  }

  if (bestShort) {
    const shortfall = Math.max(0, bestShort.needBase - bestShort.haveBase);
    const status: CookLineStatus = line.optional ? 'optional-missing' : 'short';
    return {
      line,
      needBase: bestShort.needBase,
      haveBase: bestShort.haveBase,
      shortfallBase: shortfall,
      convertible: true,
      uncertaintyPct: bestShort.uncertaintyPct,
      status,
      pantryFormId: bestShort.pantryFormId,
      needDim: bestShort.dim,
      satisfiedByIngredientId: bestShort.ingredientId,
    };
  }

  if (anyNotConvertible || anyHadRows) {
    // In pantry but cannot convert — NEVER invent shortfallBase: 0
    return {
      line,
      needBase: null,
      haveBase: null,
      shortfallBase: null,
      convertible: false,
      uncertaintyPct: null,
      status: line.optional ? 'optional-missing' : 'not-convertible',
    };
  }

  return {
    line,
    needBase: null,
    haveBase: null,
    shortfallBase: null,
    convertible: false,
    uncertaintyPct: null,
    status: line.optional ? 'optional-missing' : 'not-in-pantry',
  };
}

function isMemberSatisfied(status: CookLineStatus): boolean {
  return status === 'enough' || status === 'non-quantified';
}

/**
 * Scale `recipe` to `servings` and evaluate every line against `pantry`.
 * Pure — does not write transactions.
 */
export function planCook(
  recipe: Recipe,
  servings: number,
  pantry: readonly PantryStockRow[],
  ctx: ConversionContext,
): CookPlan {
  const scaled = scaleRecipe(recipe, servings);
  const pantryByIng = indexPantryByIngredient(pantry);
  const formsById = formByIdMap(ctx.forms);

  const rawLines = scaled.ingredients.map((line) =>
    evaluateLine(line, pantryByIng, ctx, formsById),
  );

  // Substitution groups: any satisfied member satisfies the group
  const groupOk = new Map<string, boolean>();
  for (const pl of rawLines) {
    const g = pl.line.group;
    if (!g) continue;
    const prev = groupOk.get(g) ?? false;
    groupOk.set(g, prev || isMemberSatisfied(pl.status));
  }

  const lines: CookPlanLine[] = rawLines.map((pl) => {
    const g = pl.line.group;
    if (!g) return pl;
    return { ...pl, groupSatisfied: groupOk.get(g) === true };
  });

  const blockers: CookPlanLine[] = [];
  for (const pl of lines) {
    if (pl.line.optional) continue;
    if (isMemberSatisfied(pl.status)) continue;
    if (pl.groupSatisfied === true) continue;
    // optional-missing already filtered by optional
    if (
      pl.status === 'short' ||
      pl.status === 'not-convertible' ||
      pl.status === 'not-in-pantry'
    ) {
      blockers.push(pl);
    }
  }

  // missingCount: count distinct groups + ungrouped blockers
  const countedGroups = new Set<string>();
  let missingCount = 0;
  for (const b of blockers) {
    const g = b.line.group;
    if (g) {
      if (countedGroups.has(g)) continue;
      countedGroups.add(g);
      missingCount += 1;
    } else {
      missingCount += 1;
    }
  }

  let maxUncertaintyPct = 0;
  for (const pl of lines) {
    if (pl.uncertaintyPct !== null && pl.uncertaintyPct > maxUncertaintyPct) {
      maxUncertaintyPct = pl.uncertaintyPct;
    }
  }

  return {
    recipeId: recipe.id,
    servings,
    lines,
    blockers,
    canCook: blockers.length === 0,
    missingCount,
    maxUncertaintyPct,
  };
}
