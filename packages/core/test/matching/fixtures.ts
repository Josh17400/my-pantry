/**
 * Adversarial matching fixtures — real-world receipt strings + near-miss negatives.
 *
 * Used by fixtures.test.ts to compute false-positive rate as a release gate.
 */

import type { Allergen, DietaryFlag, Ingredient } from '../../src/domain';
import type { IngredientAlias, MatchCatalog } from '../../src/matching';

function ing(
  id: string,
  name: string,
  opts: {
    category?: string;
    allergens?: readonly Allergen[];
    dietaryFlags?: readonly DietaryFlag[];
    isStaple?: boolean;
  } = {},
): Ingredient {
  const allergens = opts.allergens ?? [];
  const flags = new Set<DietaryFlag>(opts.dietaryFlags ?? []);
  if (allergens.includes('wheat')) flags.add('gluten');
  return {
    id,
    name,
    category: opts.category ?? 'other',
    allergens,
    dietaryFlags: [...flags].sort(),
    isStaple: opts.isStaple ?? false,
    defaultFormId: `${id}-default`,
  };
}

/** Canonical catalog for fixture evaluation (cream/stock families + staples). */
export const FIXTURE_INGREDIENTS: readonly Ingredient[] = [
  // Cream family (siblings)
  ing('cream', 'cream', { category: 'dairy', allergens: ['milk'] }),
  ing('heavy-cream', 'heavy cream', { category: 'dairy', allergens: ['milk'] }),
  ing('whipping-cream', 'whipping cream', {
    category: 'dairy',
    allergens: ['milk'],
  }),
  ing('sour-cream', 'sour cream', { category: 'dairy', allergens: ['milk'] }),
  ing('cream-cheese', 'cream cheese', {
    category: 'dairy',
    allergens: ['milk'],
  }),
  ing('half-and-half', 'half and half', {
    category: 'dairy',
    allergens: ['milk'],
  }),
  // Stock / broth family
  ing('stock', 'stock', { category: 'broth' }),
  ing('broth', 'broth', { category: 'broth' }),
  ing('chicken-stock', 'chicken stock', { category: 'broth' }),
  ing('chicken-broth', 'chicken broth', { category: 'broth' }),
  ing('beef-stock', 'beef stock', { category: 'broth' }),
  ing('beef-broth', 'beef broth', { category: 'broth' }),
  ing('stock-cube', 'stock cube', { category: 'broth' }),
  ing('chicken-stock-cube', 'chicken stock cube', { category: 'broth' }),
  ing('bouillon', 'bouillon', { category: 'broth' }),
  // Milk family
  ing('milk', 'milk', {
    category: 'dairy',
    allergens: ['milk'],
    isStaple: true,
  }),
  ing('whole-milk', 'whole milk', {
    category: 'dairy',
    allergens: ['milk'],
    isStaple: true,
  }),
  ing('skim-milk', 'skim milk', { category: 'dairy', allergens: ['milk'] }),
  // Butter
  ing('butter', 'butter', {
    category: 'dairy',
    allergens: ['milk'],
    isStaple: true,
  }),
  ing('unsalted-butter', 'unsalted butter', {
    category: 'dairy',
    allergens: ['milk'],
  }),
  // Staples / common
  ing('flour', 'flour', { category: 'baking', allergens: ['wheat'], isStaple: true }),
  ing('all-purpose-flour', 'all purpose flour', {
    category: 'baking',
    allergens: ['wheat'],
  }),
  ing('sugar', 'sugar', { category: 'baking', isStaple: true }),
  ing('brown-sugar', 'brown sugar', { category: 'baking' }),
  ing('salt', 'salt', { category: 'spice', isStaple: true }),
  ing('black-pepper', 'black pepper', { category: 'spice', isStaple: true }),
  ing('olive-oil', 'olive oil', { category: 'oil', isStaple: true }),
  ing('vegetable-oil', 'vegetable oil', { category: 'oil' }),
  ing('eggs', 'eggs', { category: 'dairy', allergens: ['egg'], isStaple: true }),
  ing('chicken', 'chicken', { category: 'meat' }),
  ing('ground-beef', 'ground beef', { category: 'meat' }),
  ing('rice', 'rice', { category: 'grain', isStaple: true }),
  ing('pasta', 'pasta', { category: 'grain', allergens: ['wheat'] }),
  ing('tomato', 'tomato', { category: 'produce' }),
  ing('onion', 'onion', { category: 'produce' }),
  ing('garlic', 'garlic', { category: 'produce' }),
  ing('parmesan', 'parmesan', { category: 'dairy', allergens: ['milk'] }),
  ing('mozzarella', 'mozzarella', { category: 'dairy', allergens: ['milk'] }),
  ing('cheddar', 'cheddar', { category: 'dairy', allergens: ['milk'] }),
  ing('yogurt', 'yogurt', { category: 'dairy', allergens: ['milk'] }),
  ing('peanut-butter', 'peanut butter', {
    category: 'spread',
    allergens: ['peanut'],
  }),
  ing('almond-butter', 'almond butter', {
    category: 'spread',
    allergens: ['tree_nut'],
  }),
  ing('soy-sauce', 'soy sauce', { category: 'condiment', allergens: ['soy', 'wheat'] }),
  ing('mayonnaise', 'mayonnaise', { category: 'condiment', allergens: ['egg'] }),
  ing('lemon', 'lemon', { category: 'produce' }),
  ing('potato', 'potato', { category: 'produce' }),
  ing('carrot', 'carrot', { category: 'produce' }),
  ing('celery', 'celery', { category: 'produce' }),
  ing('basil', 'basil', { category: 'herb' }),
  ing('oregano', 'oregano', { category: 'herb' }),
  ing('cinnamon', 'cinnamon', { category: 'spice' }),
  ing('vanilla-extract', 'vanilla extract', { category: 'baking' }),
  ing('baking-soda', 'baking soda', { category: 'baking' }),
  ing('baking-powder', 'baking powder', { category: 'baking' }),
  ing('honey', 'honey', { category: 'sweetener' }),
  ing('maple-syrup', 'maple syrup', { category: 'sweetener' }),
  ing('bread', 'bread', { category: 'bakery', allergens: ['wheat'] }),
  ing('bacon', 'bacon', { category: 'meat' }),
  ing('shrimp', 'shrimp', { category: 'seafood', allergens: ['shellfish'] }),
  ing('salmon', 'salmon', { category: 'seafood', allergens: ['fish'] }),
];

export const FIXTURE_TAXONOMY: Readonly<Record<string, string>> = {
  cream: 'family:cream',
  'heavy-cream': 'family:cream',
  'whipping-cream': 'family:cream',
  'sour-cream': 'family:cream',
  'cream-cheese': 'family:cream',
  'half-and-half': 'family:cream',
  stock: 'family:stock-broth',
  broth: 'family:stock-broth',
  'chicken-stock': 'family:stock-broth',
  'chicken-broth': 'family:stock-broth',
  'beef-stock': 'family:stock-broth',
  'beef-broth': 'family:stock-broth',
  'stock-cube': 'family:stock-broth',
  'chicken-stock-cube': 'family:stock-broth',
  bouillon: 'family:stock-broth',
  milk: 'family:milk',
  'whole-milk': 'family:milk',
  'skim-milk': 'family:milk',
  butter: 'family:butter',
  'unsalted-butter': 'family:butter',
  flour: 'family:flour',
  'all-purpose-flour': 'family:flour',
  sugar: 'family:sugar',
  'brown-sugar': 'family:sugar',
  'olive-oil': 'family:oil',
  'vegetable-oil': 'family:oil',
};

export const FIXTURE_GLOBAL_ALIASES: readonly IngredientAlias[] = [
  { alias: 'AP flour', ingredientId: 'all-purpose-flour', scope: 'global' },
  { alias: 'EVOO', ingredientId: 'olive-oil', scope: 'global' },
  { alias: 'parm', ingredientId: 'parmesan', scope: 'global' },
  { alias: 'mozz', ingredientId: 'mozzarella', scope: 'global' },
  { alias: 'PB', ingredientId: 'peanut-butter', scope: 'global' },
  { alias: 'ground chuck', ingredientId: 'ground-beef', scope: 'global' },
];

export const FIXTURE_USER_ALIASES: readonly IngredientAlias[] = [
  {
    alias: 'HVY CRM',
    ingredientId: 'heavy-cream',
    scope: 'user',
    householdId: 'hh-1',
  },
  {
    alias: 'my flour',
    ingredientId: 'all-purpose-flour',
    scope: 'user',
    householdId: 'hh-1',
  },
];

export function fixtureCatalog(
  overrides: Partial<MatchCatalog> = {},
): MatchCatalog {
  return {
    ingredients: FIXTURE_INGREDIENTS,
    taxonomyParentByIngredientId: FIXTURE_TAXONOMY,
    globalAliases: FIXTURE_GLOBAL_ALIASES,
    userAliases: FIXTURE_USER_ALIASES,
    ...overrides,
  };
}

export type FixtureCase = {
  readonly id: string;
  readonly raw: string;
  /**
   * Expected primary ingredient id when a match is acceptable.
   * For near-miss negatives, list of ids that must NOT be the auto-accepted match.
   */
  readonly expectIngredientId?: string;
  /** Ingredient ids that must never be chosen as the primary match. */
  readonly mustNotMatchIds?: readonly string[];
  /**
   * If true, primary match autoAccept must be false (or non-match outcome).
   * Near-miss negatives set this.
   */
  readonly forbidAutoAccept?: boolean;
  /** When set, path used for matching (default receipt for fixture gate). */
  readonly path?: 'receipt' | 'recipe' | 'general';
  readonly householdId?: string;
  /**
   * Positive case: we expect a correct match (id matches expectIngredientId).
   * Negative case: success means we did NOT false-positive onto mustNotMatchIds with autoAccept.
   */
  readonly kind: 'positive' | 'negative';
};

/**
 * Positive cases: receipt-ish strings that should resolve correctly
 * (or at least not auto-accept the wrong sibling).
 */
export const POSITIVE_FIXTURES: readonly FixtureCase[] = [
  {
    id: 'pos-hvy-crm-learned',
    raw: 'HVY CRM',
    expectIngredientId: 'heavy-cream',
    kind: 'positive',
    path: 'receipt',
    householdId: 'hh-1',
  },
  {
    id: 'pos-evoo',
    raw: 'EVOO',
    expectIngredientId: 'olive-oil',
    kind: 'positive',
    path: 'receipt',
  },
  {
    id: 'pos-parm',
    raw: 'parm',
    expectIngredientId: 'parmesan',
    kind: 'positive',
    path: 'receipt',
  },
  {
    id: 'pos-pb',
    raw: 'PB',
    expectIngredientId: 'peanut-butter',
    kind: 'positive',
    path: 'receipt',
  },
  {
    id: 'pos-flour-norm',
    raw: 'King Arthur All Purpose Flour 5lb',
    expectIngredientId: 'all-purpose-flour',
    kind: 'positive',
    path: 'receipt',
  },
  {
    id: 'pos-eggs',
    raw: 'EGGS LARGE GRADE A 12CT',
    expectIngredientId: 'eggs',
    kind: 'positive',
    path: 'receipt',
  },
  {
    id: 'pos-butter',
    raw: 'UNSLTD BTR 1LB',
    expectIngredientId: 'unsalted-butter',
    kind: 'positive',
    path: 'receipt',
  },
  {
    id: 'pos-rice',
    raw: 'RICE LONG GRAIN 5LB',
    expectIngredientId: 'rice',
    kind: 'positive',
    path: 'receipt',
  },
  {
    id: 'pos-onion',
    raw: 'YELLOW ONIONS 3LB BAG',
    expectIngredientId: 'onion',
    kind: 'positive',
    path: 'receipt',
  },
  {
    id: 'pos-garlic',
    raw: 'GARLIC BULB',
    expectIngredientId: 'garlic',
    kind: 'positive',
    path: 'receipt',
  },
  {
    id: 'pos-salt',
    raw: 'MORTON SALT 26OZ',
    expectIngredientId: 'salt',
    kind: 'positive',
    path: 'receipt',
  },
  {
    id: 'pos-sugar',
    raw: 'DOMINO SUGAR 4LB',
    expectIngredientId: 'sugar',
    kind: 'positive',
    path: 'receipt',
  },
  {
    id: 'pos-ground-beef',
    raw: 'ground chuck',
    expectIngredientId: 'ground-beef',
    kind: 'positive',
    path: 'receipt',
  },
  {
    id: 'pos-exact-chicken',
    raw: 'chicken',
    expectIngredientId: 'chicken',
    kind: 'positive',
    path: 'receipt',
  },
  {
    id: 'pos-honey',
    raw: 'LOCAL HONEY 16OZ',
    expectIngredientId: 'honey',
    kind: 'positive',
    path: 'receipt',
  },
  {
    id: 'pos-bacon',
    raw: 'BACON THICK CUT 16OZ',
    expectIngredientId: 'bacon',
    kind: 'positive',
    path: 'receipt',
  },
  {
    id: 'pos-yogurt',
    raw: 'GREEK YOGURT PLAIN 32OZ',
    expectIngredientId: 'yogurt',
    kind: 'positive',
    path: 'receipt',
  },
  {
    id: 'pos-lemon',
    raw: 'LEMONS',
    expectIngredientId: 'lemon',
    kind: 'positive',
    path: 'receipt',
  },
  {
    id: 'pos-carrot',
    raw: 'CARROTS 2LB',
    expectIngredientId: 'carrot',
    kind: 'positive',
    path: 'receipt',
  },
  {
    id: 'pos-celery',
    raw: 'CELERY BUNCH',
    expectIngredientId: 'celery',
    kind: 'positive',
    path: 'receipt',
  },
];

/**
 * Near-miss negatives — must NOT auto-accept onto the wrong sibling / lookalike.
 * A false positive = kind match + autoAccept + id in mustNotMatchIds
 * OR kind match with id in mustNotMatchIds when we expected a different id.
 *
 * Gate definition used in fixtures.test.ts:
 * FP when result is auto-accepted onto a mustNotMatch id, OR
 * for negatives, when primary match id is in mustNotMatchIds (even without autoAccept
 * for the strict "resolve" sense) — we use the stricter auto-accept FP for the rate,
 * and separately assert mustNotMatch is not auto-accepted.
 */
export const NEGATIVE_FIXTURES: readonly FixtureCase[] = [
  {
    id: 'neg-hvy-crm-not-plain-cream',
    raw: 'HVY CRM 16OZ',
    // without user alias, must not auto-accept plain cream
    mustNotMatchIds: ['cream', 'sour-cream', 'cream-cheese'],
    forbidAutoAccept: true,
    kind: 'negative',
    path: 'receipt',
    // no householdId → user alias for HVY CRM not applied
  },
  {
    id: 'neg-sour-not-cream',
    raw: 'SOUR CRM 16OZ',
    mustNotMatchIds: ['cream', 'heavy-cream', 'cream-cheese'],
    forbidAutoAccept: true,
    kind: 'negative',
    path: 'receipt',
  },
  {
    id: 'neg-cream-cheese-not-cream',
    raw: 'CRM CHZ 8OZ',
    mustNotMatchIds: ['cream', 'heavy-cream', 'sour-cream'],
    forbidAutoAccept: true,
    kind: 'negative',
    path: 'receipt',
  },
  {
    id: 'neg-chkn-brth-not-stock-cube',
    raw: 'CHKN BRTH 32OZ',
    mustNotMatchIds: ['stock-cube', 'chicken-stock-cube', 'stock', 'bouillon'],
    forbidAutoAccept: true,
    kind: 'negative',
    path: 'receipt',
  },
  {
    id: 'neg-stock-cube-not-broth',
    raw: 'CHKN STK CUBE',
    mustNotMatchIds: ['chicken-broth', 'broth', 'chicken-stock'],
    forbidAutoAccept: true,
    kind: 'negative',
    path: 'receipt',
  },
  {
    id: 'neg-half-half-not-cream',
    raw: 'HALF AND HALF',
    mustNotMatchIds: ['cream', 'heavy-cream', 'sour-cream'],
    forbidAutoAccept: true,
    kind: 'negative',
    path: 'receipt',
  },
  {
    id: 'neg-skim-not-whole',
    raw: 'SKM MLK GALLON',
    mustNotMatchIds: ['whole-milk'],
    forbidAutoAccept: true,
    kind: 'negative',
    path: 'receipt',
  },
  {
    id: 'neg-brown-sugar-not-white',
    raw: 'BROWN SGR 2LB',
    mustNotMatchIds: ['sugar'],
    // brown sugar should win if normalized; forbidding auto onto white is enough
    forbidAutoAccept: true,
    kind: 'negative',
    path: 'receipt',
  },
  {
    id: 'neg-almond-butter-not-peanut',
    raw: 'ALMOND BUTTER 16OZ',
    mustNotMatchIds: ['peanut-butter'],
    forbidAutoAccept: true,
    kind: 'negative',
    path: 'receipt',
  },
  {
    id: 'neg-veg-oil-not-olive',
    raw: 'VEGETABLE OIL 48OZ',
    mustNotMatchIds: ['olive-oil'],
    forbidAutoAccept: true,
    kind: 'negative',
    path: 'receipt',
  },
  {
    id: 'neg-beef-broth-not-chicken',
    raw: 'BEEF BRTH 32OZ',
    mustNotMatchIds: ['chicken-broth', 'chicken-stock', 'chicken-stock-cube'],
    forbidAutoAccept: true,
    kind: 'negative',
    path: 'receipt',
  },
  {
    id: 'neg-whipping-not-sour',
    raw: 'WHPNG CRM',
    mustNotMatchIds: ['sour-cream', 'cream-cheese', 'cream'],
    forbidAutoAccept: true,
    kind: 'negative',
    path: 'receipt',
  },
];

export const ALL_FIXTURES: readonly FixtureCase[] = [
  ...POSITIVE_FIXTURES,
  ...NEGATIVE_FIXTURES,
];

/**
 * Release-gate threshold: fraction of cases that produce a false positive.
 * A false positive is:
 * - positive case: auto-accepted onto the wrong ingredient, OR no correct match when
 *   an exact/alias path should have hit (counted as miss, not FP)
 * - negative case: auto-accepted onto any mustNotMatchIds ingredient
 *
 * Tracked FP rate must be ≤ this (failing threshold).
 */
export const FALSE_POSITIVE_RATE_THRESHOLD = 0.05;
