/**
 * Cook-line substitution helpers — rank pantry candidates and convert amounts.
 * Domain conversion stays in @larder/core; this is pure UI planning glue.
 */

import {
  BASE_UNIT,
  convert,
  type Dimension,
  formatQuantity,
} from '@larder/core';

import type { PantryItemView } from '../../db/types';
import {
  catalogConversionContext,
  getIngredientCategory,
  getIngredientName,
} from './catalog';
import type { CookLineEdit, PantrySubstitution } from './cook-machine';

export type RankedPantryCandidate = {
  readonly ingredientId: string;
  readonly formId: string;
  readonly name: string;
  readonly formName: string | null;
  readonly locationName: string | null;
  readonly category: string;
  readonly dim: Dimension;
  readonly qtyBase: number;
  readonly qtyLabel: string;
  /** Higher = better match for this recipe line. */
  readonly score: number;
  readonly sameCategory: boolean;
  readonly inStock: boolean;
};

/**
 * Rank pantry rows for a cook line: same category first, then any in-stock,
 * then out-of-stock (still selectable — user may know better).
 */
export function rankPantryForSubstitution(
  line: CookLineEdit,
  pantry: readonly PantryItemView[],
  query = '',
): RankedPantryCandidate[] {
  const q = query.trim().toLowerCase();
  const originalCategory = getIngredientCategory(line.ingredientId);
  const originalId = line.ingredientId;

  const scored: RankedPantryCandidate[] = [];

  for (const item of pantry) {
    // Do not offer the exact same stock row as a "substitute"
    if (
      item.ingredientId === originalId &&
      item.formId === (line.formId ?? line.pantryFormId)
    ) {
      continue;
    }

    const name =
      (item.ingredientName && item.ingredientName.trim()) ||
      getIngredientName(item.ingredientId) ||
      item.ingredientId;
    const formName = item.formName;
    const locationName = item.locationName;
    const category =
      getIngredientCategory(item.ingredientId) || item.ingredientId;
    const sameCategory =
      Boolean(originalCategory) &&
      originalCategory !== 'Other' &&
      category === originalCategory;
    const inStock = item.qtyBase > 0;

    if (q) {
      const hay = `${name} ${formName ?? ''} ${locationName ?? ''} ${category}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }

    let score = 0;
    if (sameCategory) score += 100;
    if (inStock) score += 50;
    if (item.ingredientId === originalId) score += 30; // same ingredient, other form
    // Prefer larger remaining stock slightly (stable tie-break)
    score += Math.min(20, Math.log10(Math.max(item.qtyBase, 1) + 1) * 5);
    if (q && name.toLowerCase().startsWith(q)) score += 15;

    scored.push({
      ingredientId: item.ingredientId,
      formId: item.formId,
      name,
      formName,
      locationName,
      category,
      dim: item.dim,
      qtyBase: item.qtyBase,
      qtyLabel: formatQuantity(item.qtyBase, item.dim, { locale: 'us' }),
      score,
      sameCategory,
      inStock,
    });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.name.localeCompare(b.name) ||
      a.formId.localeCompare(b.formId),
  );
  return scored;
}

/**
 * Build a pantry substitution for a line, converting the planned need into
 * the substitute's base units when possible.
 */
export function buildPantrySubstitution(
  line: CookLineEdit,
  candidate: RankedPantryCandidate,
): PantrySubstitution {
  const ctx = catalogConversionContext();
  const fromFormId = line.formId ?? line.pantryFormId;
  let actualUsedBase: number | null = null;
  let amountFromConversion = false;
  let needsAmount = true;

  if (
    line.needBase != null &&
    Number.isFinite(line.needBase) &&
    line.needDim &&
    fromFormId
  ) {
    const fromUnit = BASE_UNIT[line.needDim];
    const toUnit = BASE_UNIT[candidate.dim];
    const converted = convert({
      value: line.needBase,
      fromUnit,
      toUnit,
      fromFormId,
      toFormId: candidate.formId,
      forms: [...ctx.forms],
      edges: [...(ctx.edges ?? [])],
    });
    if (converted.ok) {
      actualUsedBase = converted.value;
      amountFromConversion = true;
      needsAmount = false;
    }
  } else if (
    line.needBase != null &&
    Number.isFinite(line.needBase) &&
    line.needDim === candidate.dim
  ) {
    // Same dimension, no form id — still try pure unit convert
    const converted = convert({
      value: line.needBase,
      fromUnit: BASE_UNIT[line.needDim],
      toUnit: BASE_UNIT[candidate.dim],
    });
    if (converted.ok) {
      actualUsedBase = converted.value;
      amountFromConversion = true;
      needsAmount = false;
    }
  }

  return {
    kind: 'pantry',
    ingredientId: candidate.ingredientId,
    formId: candidate.formId,
    name: candidate.name,
    formName: candidate.formName,
    locationName: candidate.locationName,
    category: candidate.category,
    dim: candidate.dim,
    haveBase: candidate.qtyBase,
    actualUsedBase,
    amountFromConversion,
    needsAmount,
  };
}

export function substitutionSummaryLabel(
  sub: CookLineEdit['substitution'],
): string | null {
  if (!sub) return null;
  if (sub.kind === 'other') {
    return `Other: ${sub.note} (noted, nothing deducted)`;
  }
  const qty =
    sub.actualUsedBase != null
      ? formatQuantity(sub.actualUsedBase, sub.dim, { locale: 'us' })
      : 'amount needed';
  return `Using ${sub.name} · ${qty}`;
}
