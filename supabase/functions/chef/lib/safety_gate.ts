/**
 * Hard allergen / dietary gate for chef responses.
 *
 * THIS IS THE SAFETY CONTROL — not the system prompt.
 * Models do not reliably obey instructions; every structured recommendation
 * is checked in code after the model responds. Unknown is never "clear".
 */

import type {
  Allergen,
  CatalogIngredientRef,
  ChefGeneratedRecipe,
  ChefRecipeLine,
  ChefSubstitution,
  DietaryFlag,
  DietaryProfile,
  GateViolation,
  ModelChefResponse,
  PantrySnapshotItem,
} from './types.ts';
import { isAllergen, isDietaryFlag } from './types.ts';

export interface SafetyGateInput {
  readonly model: ModelChefResponse;
  readonly dietary: DietaryProfile;
  readonly catalog: readonly CatalogIngredientRef[];
  readonly pantry: readonly PantrySnapshotItem[];
}

export interface SafetyGateResult {
  readonly allowed: boolean;
  readonly violations: readonly GateViolation[];
  /** Model payload with unsafe recipe/subs stripped when partially salvageable. */
  readonly sanitized: ModelChefResponse;
}

function catalogById(
  catalog: readonly CatalogIngredientRef[],
): Map<string, CatalogIngredientRef> {
  const m = new Map<string, CatalogIngredientRef>();
  for (const c of catalog) m.set(c.id, c);
  return m;
}

function catalogByName(
  catalog: readonly CatalogIngredientRef[],
): Map<string, CatalogIngredientRef> {
  const m = new Map<string, CatalogIngredientRef>();
  for (const c of catalog) m.set(c.name.trim().toLowerCase(), c);
  return m;
}

function uniqueAllergens(xs: readonly string[]): Allergen[] {
  const out: Allergen[] = [];
  for (const x of xs) {
    if (isAllergen(x) && !out.includes(x)) out.push(x);
  }
  return out;
}

function uniqueFlags(xs: readonly string[]): DietaryFlag[] {
  const out: DietaryFlag[] = [];
  for (const x of xs) {
    if (isDietaryFlag(x) && !out.includes(x)) out.push(x);
  }
  return out;
}

interface ResolvedTags {
  readonly allergens: readonly Allergen[];
  readonly dietaryFlags: readonly DietaryFlag[];
  readonly unknownAllergens: boolean;
  readonly ingredientId?: string;
  readonly rawText: string;
}

function resolveLine(
  line: {
    readonly ingredientId?: string;
    readonly rawText?: string;
    readonly allergens?: readonly Allergen[];
    readonly dietaryFlags?: readonly DietaryFlag[];
    readonly unknownAllergens?: boolean;
    readonly forIngredient?: string;
    readonly suggestion?: string;
  },
  byId: Map<string, CatalogIngredientRef>,
  byName: Map<string, CatalogIngredientRef>,
): ResolvedTags {
  const rawText =
    line.rawText ??
    line.suggestion ??
    line.forIngredient ??
    line.ingredientId ??
    'unknown';

  // Explicit unknown from model or free-text without resolution → unsafe.
  if (line.unknownAllergens === true) {
    return {
      allergens: uniqueAllergens(line.allergens ?? []),
      dietaryFlags: uniqueFlags(line.dietaryFlags ?? []),
      unknownAllergens: true,
      ingredientId: line.ingredientId,
      rawText,
    };
  }

  const fromCatalog = line.ingredientId
    ? byId.get(line.ingredientId)
    : byName.get(rawText.trim().toLowerCase());

  if (fromCatalog) {
    return {
      allergens: uniqueAllergens([
        ...fromCatalog.allergens,
        ...(line.allergens ?? []),
      ]),
      dietaryFlags: uniqueFlags([
        ...fromCatalog.dietaryFlags,
        ...(line.dietaryFlags ?? []),
      ]),
      unknownAllergens: false,
      ingredientId: fromCatalog.id,
      rawText: fromCatalog.name,
    };
  }

  // Has inline tags and no unknown flag — trust closed tags only if both present.
  if (line.allergens !== undefined || line.dietaryFlags !== undefined) {
    // Still unknown if we couldn't map to catalog and no explicit known-clear.
    // Free-text with only partial tags remains unsafe.
    if (line.ingredientId && !fromCatalog) {
      return {
        allergens: uniqueAllergens(line.allergens ?? []),
        dietaryFlags: uniqueFlags(line.dietaryFlags ?? []),
        unknownAllergens: true,
        ingredientId: line.ingredientId,
        rawText,
      };
    }
    return {
      allergens: uniqueAllergens(line.allergens ?? []),
      dietaryFlags: uniqueFlags(line.dietaryFlags ?? []),
      // No ingredientId and free text: if model omitted unknownAllergens but
      // gave empty arrays, still treat free-text as unknown for safety.
      unknownAllergens: line.ingredientId === undefined,
      ingredientId: line.ingredientId,
      rawText,
    };
  }

  // Unresolved free text — unknown is unsafe.
  return {
    allergens: [],
    dietaryFlags: [],
    unknownAllergens: true,
    ingredientId: line.ingredientId,
    rawText,
  };
}

function checkTags(
  tags: ResolvedTags,
  dietary: DietaryProfile,
): GateViolation[] {
  const violations: GateViolation[] = [];
  const avoidA = new Set(dietary.avoidAllergens);
  const avoidD = new Set(dietary.avoidDietaryFlags);
  const userHasAvoids = avoidA.size > 0 || avoidD.size > 0;

  if (tags.unknownAllergens) {
    // Unknown is never clear — always block structured recommendations that
    // did not resolve. (userHasAvoids reserved for future soft-warn UX.)
    void userHasAvoids;
    violations.push({
      kind: 'unknown_allergens',
      detail: `Unresolved or unknown allergens for "${tags.rawText}" — treated as unsafe`,
      ingredientId: tags.ingredientId,
      rawText: tags.rawText,
    });
    return violations;
  }

  for (const a of tags.allergens) {
    if (avoidA.has(a)) {
      violations.push({
        kind: 'flagged_allergen',
        detail: `Contains avoided allergen "${a}" in "${tags.rawText}"`,
        ingredientId: tags.ingredientId,
        rawText: tags.rawText,
        allergen: a,
      });
    }
  }
  for (const d of tags.dietaryFlags) {
    if (avoidD.has(d)) {
      violations.push({
        kind: 'flagged_dietary',
        detail: `Contains avoided dietary flag "${d}" in "${tags.rawText}"`,
        ingredientId: tags.ingredientId,
        rawText: tags.rawText,
        dietaryFlag: d,
      });
    }
  }
  return violations;
}

/**
 * Scan free-text message for catalog names that hit the avoid list.
 * Secondary net for chat answers that invent ingredients in prose.
 */
function scanMessageForFlaggedNames(
  message: string,
  dietary: DietaryProfile,
  catalog: readonly CatalogIngredientRef[],
): GateViolation[] {
  const violations: GateViolation[] = [];
  if (!message.trim()) return violations;
  const lower = message.toLowerCase();
  const avoidA = new Set(dietary.avoidAllergens);
  const avoidD = new Set(dietary.avoidDietaryFlags);
  if (avoidA.size === 0 && avoidD.size === 0) return violations;

  // Longest names first to reduce partial false hits.
  const sorted = [...catalog].sort((a, b) => b.name.length - a.name.length);
  const hitIds = new Set<string>();
  for (const c of sorted) {
    if (c.name.length < 3) continue;
    const name = c.name.toLowerCase();
    if (!lower.includes(name)) continue;
    if (hitIds.has(c.id)) continue;
    const tags: ResolvedTags = {
      allergens: c.allergens,
      dietaryFlags: c.dietaryFlags,
      unknownAllergens: false,
      ingredientId: c.id,
      rawText: c.name,
    };
    const v = checkTags(tags, dietary);
    if (v.length > 0) {
      hitIds.add(c.id);
      violations.push(...v);
    }
  }
  return violations;
}

function filterRecipe(
  recipe: ChefGeneratedRecipe,
  dietary: DietaryProfile,
  byId: Map<string, CatalogIngredientRef>,
  byName: Map<string, CatalogIngredientRef>,
): { recipe: ChefGeneratedRecipe | null; violations: GateViolation[] } {
  const violations: GateViolation[] = [];
  for (const line of recipe.ingredients) {
    const tags = resolveLine(line, byId, byName);
    violations.push(...checkTags(tags, dietary));
  }
  if (violations.length > 0) {
    return { recipe: null, violations };
  }
  // Normalize unknown flags on lines for client honesty.
  const ingredients: ChefRecipeLine[] = recipe.ingredients.map((line) => {
    const tags = resolveLine(line, byId, byName);
    return {
      ...line,
      ingredientId: tags.ingredientId ?? line.ingredientId,
      allergens: tags.allergens,
      dietaryFlags: tags.dietaryFlags,
      unknownAllergens: tags.unknownAllergens,
    };
  });
  return { recipe: { ...recipe, ingredients }, violations: [] };
}

function filterSubs(
  subs: readonly ChefSubstitution[],
  dietary: DietaryProfile,
  byId: Map<string, CatalogIngredientRef>,
  byName: Map<string, CatalogIngredientRef>,
): { subs: ChefSubstitution[]; violations: GateViolation[] } {
  const violations: GateViolation[] = [];
  const kept: ChefSubstitution[] = [];
  for (const s of subs) {
    const tags = resolveLine(
      {
        ingredientId: s.ingredientId,
        rawText: s.suggestion,
        allergens: s.allergens,
        dietaryFlags: s.dietaryFlags,
        unknownAllergens: s.unknownAllergens,
        forIngredient: s.forIngredient,
        suggestion: s.suggestion,
      },
      byId,
      byName,
    );
    const v = checkTags(tags, dietary);
    if (v.length > 0) {
      violations.push(...v);
      continue;
    }
    kept.push({
      ...s,
      ingredientId: tags.ingredientId ?? s.ingredientId,
      allergens: tags.allergens,
      dietaryFlags: tags.dietaryFlags,
      unknownAllergens: tags.unknownAllergens,
    });
  }
  return { subs: kept, violations };
}

/**
 * Enforce the hard gate on a model response.
 * Returns allowed:false when any structured recommendation is unsafe.
 * Chat-only messages that mention avoided ingredients in prose are also blocked
 * when the user has an avoid list (belt-and-suspenders with structured fields).
 */
export function enforceSafetyGate(input: SafetyGateInput): SafetyGateResult {
  const dietary: DietaryProfile = {
    avoidAllergens: input.dietary.avoidAllergens ?? [],
    avoidDietaryFlags: input.dietary.avoidDietaryFlags ?? [],
    notes: input.dietary.notes,
  };
  const byId = catalogById(input.catalog);
  const byName = catalogByName(input.catalog);
  const allViolations: GateViolation[] = [];

  let recipe = input.model.recipe ?? null;
  if (recipe) {
    const fr = filterRecipe(recipe, dietary, byId, byName);
    allViolations.push(...fr.violations);
    recipe = fr.recipe;
  }

  let substitutions = input.model.substitutions
    ? [...input.model.substitutions]
    : undefined;
  if (substitutions && substitutions.length > 0) {
    const fs = filterSubs(substitutions, dietary, byId, byName);
    // If ANY sub was blocked, fail the whole turn — partial bad advice is worse.
    if (fs.violations.length > 0) {
      allViolations.push(...fs.violations);
      substitutions = undefined;
    } else {
      substitutions = fs.subs;
    }
  }

  // Prose scan against catalog for avoided ingredients.
  allViolations.push(
    ...scanMessageForFlaggedNames(
      input.model.message,
      dietary,
      input.catalog,
    ),
  );

  // Also scan pantry-grounded names that are themselves flagged? No —
  // grounding display is separate; we only block recommendations.

  if (allViolations.length > 0) {
    return {
      allowed: false,
      violations: allViolations,
      sanitized: {
        ...input.model,
        message:
          'I cannot recommend that option because it conflicts with your allergen or dietary restrictions. Please try a different request.',
        recipe: null,
        substitutions: [],
      },
    };
  }

  return {
    allowed: true,
    violations: [],
    sanitized: {
      ...input.model,
      recipe,
      substitutions,
    },
  };
}

/**
 * Pure helper for tests / callers: does this ingredient hit the avoid list?
 */
export function hitsAvoidList(args: {
  readonly allergens: readonly Allergen[];
  readonly dietaryFlags: readonly DietaryFlag[];
  readonly unknownAllergens?: boolean;
  readonly avoidAllergens: readonly Allergen[];
  readonly avoidDietaryFlags: readonly DietaryFlag[];
}): boolean {
  if (args.unknownAllergens) return true;
  const avoidA = new Set(args.avoidAllergens);
  const avoidD = new Set(args.avoidDietaryFlags);
  if (args.allergens.some((a) => avoidA.has(a))) return true;
  if (args.dietaryFlags.some((d) => avoidD.has(d))) return true;
  return false;
}
