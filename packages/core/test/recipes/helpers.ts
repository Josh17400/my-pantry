/**
 * Shared fixtures for recipe / cook-now / grocery tests.
 */

import type { ConversionEdge, Ingredient, IngredientForm } from '../../src/domain/types';
import type { PantryStockRow, Recipe, RecipeLine } from '../../src/recipes/types';

export const flourForm: IngredientForm = {
  id: 'form-flour-ap',
  ingredientId: 'ing-flour',
  form: 'all-purpose',
  dim: 'mass',
  uncertaintyPct: 0,
};

export const milkForm: IngredientForm = {
  id: 'form-milk-liquid',
  ingredientId: 'ing-milk',
  form: 'liquid',
  dim: 'volume',
  densityGPerMl: 1.03,
  uncertaintyPct: 5,
};

export const eggForm: IngredientForm = {
  id: 'form-egg-whole',
  ingredientId: 'ing-egg',
  form: 'whole',
  dim: 'count',
  gramsPerCount: 50,
  uncertaintyPct: 10,
};

export const garlicClove: IngredientForm = {
  id: 'form-garlic-clove',
  ingredientId: 'ing-garlic',
  form: 'clove',
  dim: 'count',
  gramsPerCount: 3,
  uncertaintyPct: 20,
};

export const garlicMinced: IngredientForm = {
  id: 'form-garlic-minced',
  ingredientId: 'ing-garlic',
  form: 'minced',
  dim: 'volume',
  densityGPerMl: 0.5,
  uncertaintyPct: 25,
};

export const spinachForm: IngredientForm = {
  id: 'form-spinach-leaf',
  ingredientId: 'ing-spinach',
  form: 'leaf',
  dim: 'mass',
  uncertaintyPct: 0,
};

export const parmesanForm: IngredientForm = {
  id: 'form-parmesan-grated',
  ingredientId: 'ing-parmesan',
  form: 'grated',
  dim: 'volume',
  densityGPerMl: 0.38,
  uncertaintyPct: 15,
};

export const butterForm: IngredientForm = {
  id: 'form-butter',
  ingredientId: 'ing-butter',
  form: 'solid',
  dim: 'mass',
  uncertaintyPct: 0,
};

export const oilForm: IngredientForm = {
  id: 'form-oil',
  ingredientId: 'ing-oil',
  form: 'liquid',
  dim: 'volume',
  densityGPerMl: 0.91,
  uncertaintyPct: 5,
};

/** Garlic clove ↔ minced via mass bridge edges (illustrative). */
export const garlicEdges: ConversionEdge[] = [
  {
    fromFormId: 'form-garlic-clove',
    toFormId: 'form-garlic-minced',
    // 1 clove (3 g) → minced volume: 3g / 0.5 g/ml = 6 ml
    factor: 6, // each → ml (base count → base volume) when dims differ via graph?
    uncertaintyPct: 30,
    source: 'test',
  },
];

export const ALL_FORMS: IngredientForm[] = [
  flourForm,
  milkForm,
  eggForm,
  garlicClove,
  garlicMinced,
  spinachForm,
  parmesanForm,
  butterForm,
  oilForm,
];

export const INGREDIENTS: Ingredient[] = [
  {
    id: 'ing-flour',
    name: 'All-purpose flour',
    category: 'Baking',
    allergens: ['wheat'],
    dietaryFlags: ['gluten'],
    isStaple: true,
    defaultFormId: flourForm.id,
  },
  {
    id: 'ing-milk',
    name: 'Milk',
    category: 'Dairy',
    allergens: ['milk'],
    dietaryFlags: [],
    isStaple: true,
    defaultFormId: milkForm.id,
  },
  {
    id: 'ing-egg',
    name: 'Egg',
    category: 'Dairy',
    allergens: ['egg'],
    dietaryFlags: [],
    isStaple: true,
    defaultFormId: eggForm.id,
  },
  {
    id: 'ing-garlic',
    name: 'Garlic',
    category: 'Produce',
    allergens: [],
    dietaryFlags: [],
    isStaple: false,
    defaultFormId: garlicClove.id,
  },
  {
    id: 'ing-spinach',
    name: 'Spinach',
    category: 'Produce',
    allergens: [],
    dietaryFlags: [],
    isStaple: false,
    defaultFormId: spinachForm.id,
  },
  {
    id: 'ing-parmesan',
    name: 'Parmesan',
    category: 'Dairy',
    allergens: ['milk'],
    dietaryFlags: [],
    isStaple: false,
    defaultFormId: parmesanForm.id,
  },
  {
    id: 'ing-butter',
    name: 'Butter',
    category: 'Dairy',
    allergens: ['milk'],
    dietaryFlags: [],
    isStaple: true,
    defaultFormId: butterForm.id,
  },
  {
    id: 'ing-oil',
    name: 'Olive oil',
    category: 'Pantry',
    allergens: [],
    dietaryFlags: [],
    isStaple: true,
    defaultFormId: oilForm.id,
  },
];

export function line(partial: RecipeLine): RecipeLine {
  return partial;
}

export function recipe(
  id: string,
  title: string,
  servings: number,
  ingredients: RecipeLine[],
): Recipe {
  return {
    id,
    title,
    servings,
    ingredients,
    steps: [{ text: 'Cook it.' }],
  };
}

export function stock(
  ingredientId: string,
  formId: string,
  qtyBase: number,
  dim: 'mass' | 'volume' | 'count',
  expiresAt?: string | null,
): PantryStockRow {
  return { ingredientId, formId, qtyBase, dim, expiresAt };
}
