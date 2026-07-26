/**
 * Ingredient checklist for the current step, scaled to chosen servings.
 * Steps are free text — we match ingredient names / rawText into step text.
 */

import type {
  Recipe,
  RecipeLine,
  ScaledRecipeLine,
} from '../../../../../packages/core/src/recipes/types.ts';
import { scaleRecipe } from '../../../../../packages/core/src/recipes/index.ts';

import { getIngredientName } from '../recipes/catalog';

export type ChecklistItem = {
  readonly index: number;
  readonly rawText: string;
  readonly name: string;
  readonly qty: number | null;
  readonly unit: string | null;
  readonly optional: boolean;
  readonly nonQuantified: boolean;
  /** True when this line's tokens appear in the current step text. */
  readonly forCurrentStep: boolean;
};

function tokensForLine(line: RecipeLine | ScaledRecipeLine): string[] {
  const name = getIngredientName(line.ingredientId);
  const parts = [line.rawText, name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
  return [...new Set(parts)];
}

/**
 * Build scaled checklist; marks items relevant to `stepIndex`.
 * If no tokens match the step, all items are listed with forCurrentStep=false
 * so the cook still sees mise en place context.
 */
export function buildStepChecklist(
  recipe: Recipe,
  servings: number,
  stepIndex: number,
): {
  items: readonly ChecklistItem[];
  stepRelevant: readonly ChecklistItem[];
  stepText: string;
} {
  const scaled = scaleRecipe(recipe, servings);
  const step = recipe.steps[stepIndex];
  const stepText = step?.text ?? '';
  const stepLower = stepText.toLowerCase();

  const items: ChecklistItem[] = scaled.ingredients.map((line, index) => {
    const tokens = tokensForLine(line);
    const forCurrentStep =
      tokens.length > 0 &&
      tokens.some((t) => stepLower.includes(t));
    const name =
      getIngredientName(line.ingredientId) || line.rawText || 'Ingredient';
    return {
      index,
      rawText: line.rawText,
      name,
      qty: line.qty,
      unit: line.unit,
      optional: line.optional === true,
      nonQuantified: line.nonQuantified === true || line.qty == null,
      forCurrentStep,
    };
  });

  const stepRelevant = items.filter((i) => i.forCurrentStep);
  return { items, stepRelevant, stepText };
}

export function formatChecklistQty(item: ChecklistItem): string {
  if (item.nonQuantified || item.qty == null) {
    return item.optional ? 'optional' : 'to taste';
  }
  const q =
    Number.isInteger(item.qty) || item.qty >= 10
      ? String(item.qty)
      : item.qty.toFixed(1).replace(/\.0$/, '');
  return item.unit ? `${q} ${item.unit}` : q;
}
