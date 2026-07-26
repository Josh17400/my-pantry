/**
 * Compact builders for seed category modules.
 * Keep ids deterministic slugs; never generate at runtime beyond pure functions.
 */

import type { Allergen, DietaryFlag } from '../domain/allergens';
import type {
  ConversionEdge,
  Dimension,
  IngredientForm,
  PackageSpec,
} from '../domain/types';
import type { SeedCategoryBundle, SeedIngredient } from './types';

export type IngredientDef = {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly allergens?: readonly Allergen[];
  readonly dietaryFlags?: readonly DietaryFlag[];
  readonly isStaple?: boolean;
  readonly defaultFormId: string;
  readonly aliases?: readonly string[];
};

/**
 * Build a seed ingredient.
 *
 * Wheat (FALCPA) always implies dietary `gluten` — celiac users avoid gluten,
 * not only labeled wheat. Non-wheat gluten sources (barley, rye, oats, malt)
 * must still set `dietaryFlags: ['gluten']` explicitly.
 */
export function ingredient(def: IngredientDef): SeedIngredient {
  const allergens = def.allergens ?? [];
  const flags = new Set<DietaryFlag>(def.dietaryFlags ?? []);
  if (allergens.includes('wheat')) {
    flags.add('gluten');
  }
  return {
    id: def.id,
    name: def.name,
    category: def.category,
    allergens,
    dietaryFlags: [...flags].sort(),
    isStaple: def.isStaple ?? false,
    defaultFormId: def.defaultFormId,
    aliases: def.aliases ?? [],
  };
}

export type FormDef = {
  readonly id: string;
  readonly ingredientId: string;
  readonly form: string;
  readonly dim: Dimension;
  readonly densityGPerMl?: number;
  readonly gramsPerCount?: number;
  readonly uncertaintyPct: number;
};

export function form(def: FormDef): IngredientForm {
  const out: IngredientForm = {
    id: def.id,
    ingredientId: def.ingredientId,
    form: def.form,
    dim: def.dim,
    uncertaintyPct: def.uncertaintyPct,
  };
  // Only attach optional fields when present (keeps objects lean / diffable).
  if (def.densityGPerMl !== undefined) {
    return { ...out, densityGPerMl: def.densityGPerMl, gramsPerCount: def.gramsPerCount };
  }
  if (def.gramsPerCount !== undefined) {
    return { ...out, gramsPerCount: def.gramsPerCount };
  }
  return out;
}

/** Mass form with optional volume density bridge (cup → g recipes). */
export function massForm(
  ingredientId: string,
  formName: string,
  opts: {
    densityGPerMl?: number;
    gramsPerCount?: number;
    uncertaintyPct?: number;
  } = {},
): IngredientForm {
  return form({
    id: `${ingredientId}-${formName}`,
    ingredientId,
    form: formName,
    dim: 'mass',
    densityGPerMl: opts.densityGPerMl,
    gramsPerCount: opts.gramsPerCount,
    uncertaintyPct: opts.uncertaintyPct ?? (opts.densityGPerMl !== undefined ? 12 : 5),
  });
}

/** Volume form (liquids, oils, sauces) with density for mass bridge. */
export function volumeForm(
  ingredientId: string,
  formName: string,
  densityGPerMl: number,
  uncertaintyPct = 8,
): IngredientForm {
  return form({
    id: `${ingredientId}-${formName}`,
    ingredientId,
    form: formName,
    dim: 'volume',
    densityGPerMl,
    uncertaintyPct,
  });
}

/** Count form (eggs, cloves, cans as count when needed). */
export function countForm(
  ingredientId: string,
  formName: string,
  gramsPerCount: number,
  uncertaintyPct = 15,
): IngredientForm {
  return form({
    id: `${ingredientId}-${formName}`,
    ingredientId,
    form: formName,
    dim: 'count',
    gramsPerCount,
    uncertaintyPct,
  });
}

export type EdgeDef = {
  readonly fromFormId: string;
  readonly toFormId: string;
  readonly factor: number;
  readonly uncertaintyPct: number;
  readonly source: string;
  readonly oneWay?: boolean;
};

export function edge(def: EdgeDef): ConversionEdge {
  const e: ConversionEdge = {
    fromFormId: def.fromFormId,
    toFormId: def.toFormId,
    factor: def.factor,
    uncertaintyPct: def.uncertaintyPct,
    source: def.source,
  };
  if (def.oneWay === true) {
    return { ...e, oneWay: true };
  }
  return e;
}

export function pack(
  formId: string,
  label: string,
  netG: number,
  drainedG?: number,
): PackageSpec {
  if (drainedG !== undefined) {
    return { formId, label, netG, drainedG };
  }
  return { formId, label, netG };
}

export function bundle(
  ingredients: readonly SeedIngredient[],
  forms: readonly IngredientForm[],
  edges: readonly ConversionEdge[] = [],
  packages: readonly PackageSpec[] = [],
): SeedCategoryBundle {
  return { ingredients, forms, edges, packages };
}

/**
 * One-ingredient convenience: single default form, optional packs/aliases.
 * Use for the long tail where multi-form modeling is not needed.
 */
export function simpleMass(
  id: string,
  name: string,
  category: string,
  opts: {
    formName?: string;
    densityGPerMl?: number;
    uncertaintyPct?: number;
    allergens?: readonly Allergen[];
    dietaryFlags?: readonly DietaryFlag[];
    isStaple?: boolean;
    aliases?: readonly string[];
    packages?: readonly Omit<PackageSpec, 'formId'>[];
  } = {},
): SeedCategoryBundle {
  const formName = opts.formName ?? 'bulk';
  const formId = `${id}-${formName}`;
  const ing = ingredient({
    id,
    name,
    category,
    allergens: opts.allergens,
    dietaryFlags: opts.dietaryFlags,
    isStaple: opts.isStaple,
    defaultFormId: formId,
    aliases: opts.aliases,
  });
  const f = massForm(id, formName, {
    densityGPerMl: opts.densityGPerMl,
    uncertaintyPct: opts.uncertaintyPct,
  });
  const packages = (opts.packages ?? []).map((p) =>
    pack(formId, p.label, p.netG, p.drainedG),
  );
  return bundle([ing], [f], [], packages);
}

export function simpleVolume(
  id: string,
  name: string,
  category: string,
  densityGPerMl: number,
  opts: {
    formName?: string;
    uncertaintyPct?: number;
    allergens?: readonly Allergen[];
    dietaryFlags?: readonly DietaryFlag[];
    isStaple?: boolean;
    aliases?: readonly string[];
    packages?: readonly Omit<PackageSpec, 'formId'>[];
  } = {},
): SeedCategoryBundle {
  const formName = opts.formName ?? 'liquid';
  const formId = `${id}-${formName}`;
  const ing = ingredient({
    id,
    name,
    category,
    allergens: opts.allergens,
    dietaryFlags: opts.dietaryFlags,
    isStaple: opts.isStaple,
    defaultFormId: formId,
    aliases: opts.aliases,
  });
  const f = volumeForm(id, formName, densityGPerMl, opts.uncertaintyPct ?? 8);
  const packages = (opts.packages ?? []).map((p) =>
    pack(formId, p.label, p.netG, p.drainedG),
  );
  return bundle([ing], [f], [], packages);
}

export function simpleCount(
  id: string,
  name: string,
  category: string,
  gramsPerCount: number,
  opts: {
    formName?: string;
    uncertaintyPct?: number;
    allergens?: readonly Allergen[];
    dietaryFlags?: readonly DietaryFlag[];
    isStaple?: boolean;
    aliases?: readonly string[];
    packages?: readonly Omit<PackageSpec, 'formId'>[];
  } = {},
): SeedCategoryBundle {
  const formName = opts.formName ?? 'each';
  const formId = `${id}-${formName}`;
  const ing = ingredient({
    id,
    name,
    category,
    allergens: opts.allergens,
    dietaryFlags: opts.dietaryFlags,
    isStaple: opts.isStaple,
    defaultFormId: formId,
    aliases: opts.aliases,
  });
  const f = countForm(id, formName, gramsPerCount, opts.uncertaintyPct ?? 20);
  const packages = (opts.packages ?? []).map((p) =>
    pack(formId, p.label, p.netG, p.drainedG),
  );
  return bundle([ing], [f], [], packages);
}

/** Merge category bundles into one. */
export function mergeBundles(
  ...parts: readonly SeedCategoryBundle[]
): SeedCategoryBundle {
  return {
    ingredients: parts.flatMap((p) => p.ingredients),
    forms: parts.flatMap((p) => p.forms),
    edges: parts.flatMap((p) => p.edges),
    packages: parts.flatMap((p) => p.packages),
  };
}
