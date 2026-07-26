/**
 * Starter catalog integrity — every recipe line must resolve against seed ingredients/forms.
 * A dangling id is a silently broken cook-now / deduct path.
 */

import { describe, expect, it } from 'vitest';
import { seedForms, seedIngredients } from '../../src/seed';
import {
  countStarterRecipes,
  getStarterRecipe,
  starterRecipes,
  STARTER_RECIPE_CATEGORIES,
} from '../../src/seed/recipes';
import type { Recipe, RecipeStep } from '../../src/recipes/types';

const ingredientIds = new Set(seedIngredients.map((i) => i.id));
const formById = new Map(seedForms.map((f) => [f.id, f]));

/**
 * Steps that receive durationSec should mention a timed action (timer is useful).
 * Matches explicit durations, common cook verbs, or package-direction cook times.
 */
const TIMER_HINT =
  /\b(\d+\s*[-–—]?\s*\d*\s*(minute|min|second|sec|hour|hr)s?|simmer|boil|bake|roast|chill|rest|sear|poach|steam|broil|scramble|wilt|soften|brown|fry|melt|glaze|toast|warm through|al dente|package directions?|cook(?:ed|ing)?|pour|beat|stir|mash|fold|until (just |the |tender|cooked|done|soft|set|opaque|bubbling|golden|fragrant)|overnight)\b/i;

function quantifiedLines(recipe: Recipe) {
  return recipe.ingredients.filter(
    (l) => l.qty !== null && l.unit !== null && !l.nonQuantified,
  );
}

describe('starter recipe catalog', () => {
  it('ships exactly 50 recipes', () => {
    expect(countStarterRecipes()).toBe(50);
    expect(starterRecipes).toHaveLength(50);
  });

  it('has no duplicate recipe ids', () => {
    const ids = starterRecipes.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every recipe id is deterministic recipe-* slug', () => {
    for (const r of starterRecipes) {
      expect(r.id).toMatch(/^recipe-[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('every recipe has servings > 0, ≥1 step, ≥2 ingredients', () => {
    for (const r of starterRecipes) {
      expect(r.servings, r.id).toBeGreaterThan(0);
      expect(r.steps.length, r.id).toBeGreaterThanOrEqual(1);
      expect(r.ingredients.length, r.id).toBeGreaterThanOrEqual(2);
      expect(r.prepMin, r.id).toBeGreaterThanOrEqual(0);
      expect(r.cookMin, r.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('every ingredientId and formId resolves against the seeded catalog', () => {
    const issues: string[] = [];

    for (const r of starterRecipes) {
      for (const [idx, line] of r.ingredients.entries()) {
        const path = `${r.id} ingredients[${idx}] (${line.rawText})`;

        if (!line.ingredientId) {
          issues.push(`${path}: missing ingredientId`);
          continue;
        }
        if (!ingredientIds.has(line.ingredientId)) {
          issues.push(`${path}: unknown ingredientId "${line.ingredientId}"`);
        }

        if (!line.formId) {
          issues.push(`${path}: missing formId`);
          continue;
        }
        const form = formById.get(line.formId);
        if (!form) {
          issues.push(`${path}: unknown formId "${line.formId}"`);
          continue;
        }
        if (form.ingredientId !== line.ingredientId) {
          issues.push(
            `${path}: formId "${line.formId}" belongs to "${form.ingredientId}", not "${line.ingredientId}"`,
          );
        }

        // Catalog lines must be allergen-resolved
        if (line.unknownAllergens === true) {
          issues.push(`${path}: unknownAllergens must be false for catalog lines`);
        }
      }
    }

    expect(issues, issues.join('\n')).toEqual([]);
  });

  it('quantified lines have finite positive qty and a unit string', () => {
    for (const r of starterRecipes) {
      for (const line of quantifiedLines(r)) {
        expect(Number.isFinite(line.qty!), `${r.id} ${line.rawText}`).toBe(true);
        expect(line.qty!, `${r.id} ${line.rawText}`).toBeGreaterThan(0);
        expect(typeof line.unit).toBe('string');
        expect((line.unit as string).length).toBeGreaterThan(0);
      }
    }
  });

  it('non-quantified lines omit qty/unit (or set nonQuantified)', () => {
    for (const r of starterRecipes) {
      for (const line of r.ingredients) {
        if (line.nonQuantified || line.qty === null || line.unit === null) {
          expect(
            line.qty === null || line.nonQuantified === true,
            `${r.id} ${line.rawText}`,
          ).toBe(true);
        }
      }
    }
  });

  it('timers only appear on steps that plausibly need them', () => {
    const bad: string[] = [];

    for (const r of starterRecipes) {
      for (const [idx, s] of r.steps.entries()) {
        if (s.durationSec === undefined) continue;

        if (!Number.isFinite(s.durationSec) || s.durationSec <= 0) {
          bad.push(`${r.id} step ${idx}: durationSec must be finite > 0`);
          continue;
        }
        // Cooking-mode timers: 30s floor, 12h ceiling (overnight oats)
        if (s.durationSec < 30 || s.durationSec > 12 * 3600) {
          bad.push(
            `${r.id} step ${idx}: durationSec ${s.durationSec} outside 30s–12h`,
          );
        }
        if (!TIMER_HINT.test(s.text)) {
          bad.push(
            `${r.id} step ${idx}: timer without timed-action language: "${s.text.slice(0, 80)}…"`,
          );
        }
      }
    }

    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('not every step has a timer (timers are selective)', () => {
    let withTimer = 0;
    let without = 0;
    for (const r of starterRecipes) {
      for (const s of r.steps) {
        if (s.durationSec !== undefined) withTimer += 1;
        else without += 1;
      }
    }
    expect(withTimer).toBeGreaterThan(20);
    expect(without).toBeGreaterThan(20);
  });

  it('categories barrel covers the full catalog without overlap', () => {
    const fromCategories = STARTER_RECIPE_CATEGORIES.flatMap((c) => c.recipes);
    expect(fromCategories).toHaveLength(starterRecipes.length);
    const ids = new Set(fromCategories.map((r) => r.id));
    expect(ids.size).toBe(starterRecipes.length);
  });

  it('getStarterRecipe finds known recipes', () => {
    const sample = starterRecipes[0]!;
    expect(getStarterRecipe(sample.id)?.title).toBe(sample.title);
    expect(getStarterRecipe('recipe-does-not-exist')).toBeUndefined();
  });

  it('visibility is public and author is good-pantry', () => {
    for (const r of starterRecipes) {
      expect(r.visibility, r.id).toBe('public');
      expect(r.authorId, r.id).toBe('good-pantry');
      expect(r.householdId, r.id).toBeUndefined();
    }
  });

  it('every recipe has at least one tag', () => {
    for (const r of starterRecipes) {
      expect(r.tags?.length ?? 0, r.id).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('starter recipe steps type smoke', () => {
  it('steps are readonly RecipeStep shapes', () => {
    const steps: readonly RecipeStep[] = starterRecipes[0]!.steps;
    expect(steps[0]!.text.length).toBeGreaterThan(0);
  });
});
