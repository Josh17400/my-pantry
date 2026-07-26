/**
 * Sibling exclusion — co-hyponyms must not auto-accept from fuzzy.
 *
 * Spec examples: cream / sour cream / heavy cream / cream cheese;
 * stock / broth / stock cube.
 */

/**
 * Well-known sibling families for seed catalogs that omit taxonomy parents.
 * Keys are stable parent ids; values are ingredient name needles (normalized).
 */
export const DEFAULT_SIBLING_FAMILIES: Readonly<Record<string, readonly string[]>> =
  {
    'family:cream': [
      'cream',
      'heavy cream',
      'whipping cream',
      'sour cream',
      'cream cheese',
      'half and half',
      'half half',
      'light cream',
      'double cream',
    ],
    'family:stock-broth': [
      'stock',
      'broth',
      'chicken stock',
      'chicken broth',
      'beef stock',
      'beef broth',
      'vegetable stock',
      'vegetable broth',
      'stock cube',
      'bouillon',
      'bouillon cube',
      'chicken stock cube',
      'beef stock cube',
    ],
    'family:milk': [
      'milk',
      'whole milk',
      'skim milk',
      '2 percent milk',
      '1 percent milk',
      'fat free milk',
      'buttermilk',
      'evaporated milk',
      'condensed milk',
      'coconut milk',
      'almond milk',
      'oat milk',
      'soy milk',
    ],
    'family:butter': [
      'butter',
      'unsalted butter',
      'salted butter',
      'clarified butter',
      'ghee',
      'butter substitute',
    ],
    'family:flour': [
      'flour',
      'all purpose flour',
      'bread flour',
      'cake flour',
      'whole wheat flour',
      'self rising flour',
      'almond flour',
      'coconut flour',
    ],
    'family:sugar': [
      'sugar',
      'white sugar',
      'brown sugar',
      'powdered sugar',
      'confectioners sugar',
      'cane sugar',
      'raw sugar',
    ],
    'family:oil': [
      'oil',
      'olive oil',
      'vegetable oil',
      'canola oil',
      'coconut oil',
      'sesame oil',
      'peanut oil',
      'avocado oil',
    ],
    'family:cheese-hard': [
      'parmesan',
      'parmigiano',
      'pecorino',
      'romano',
      'asiago',
    ],
  };

/**
 * Resolve taxonomy parent for an ingredient.
 * Prefers explicit catalog map; falls back to name membership in default families.
 */
export function taxonomyParentId(
  ingredientId: string,
  nameNormalized: string,
  taxonomyParentByIngredientId: Readonly<Record<string, string>>,
): string | undefined {
  const explicit = taxonomyParentByIngredientId[ingredientId];
  if (explicit !== undefined) return explicit;

  for (const [parent, names] of Object.entries(DEFAULT_SIBLING_FAMILIES)) {
    if (names.includes(nameNormalized)) return parent;
  }
  return undefined;
}

/**
 * True when `ingredientId` shares a taxonomic parent with at least one
 * other ingredient in the catalog (co-hyponym set size ≥ 2).
 */
export function hasSiblings(
  ingredientId: string,
  nameNormalized: string,
  catalogIdsAndNames: ReadonlyArray<{ id: string; nameNormalized: string }>,
  taxonomyParentByIngredientId: Readonly<Record<string, string>>,
): boolean {
  const parent = taxonomyParentId(
    ingredientId,
    nameNormalized,
    taxonomyParentByIngredientId,
  );
  if (parent === undefined) return false;

  for (const other of catalogIdsAndNames) {
    if (other.id === ingredientId) continue;
    const otherParent = taxonomyParentId(
      other.id,
      other.nameNormalized,
      taxonomyParentByIngredientId,
    );
    if (otherParent === parent) return true;
  }
  return false;
}

/**
 * All co-hyponym ingredient ids under the same parent (including self).
 */
export function siblingIds(
  ingredientId: string,
  nameNormalized: string,
  catalogIdsAndNames: ReadonlyArray<{ id: string; nameNormalized: string }>,
  taxonomyParentByIngredientId: Readonly<Record<string, string>>,
): string[] {
  const parent = taxonomyParentId(
    ingredientId,
    nameNormalized,
    taxonomyParentByIngredientId,
  );
  if (parent === undefined) return [ingredientId];

  const ids: string[] = [];
  for (const other of catalogIdsAndNames) {
    const otherParent = taxonomyParentId(
      other.id,
      other.nameNormalized,
      taxonomyParentByIngredientId,
    );
    if (otherParent === parent) ids.push(other.id);
  }
  return ids.length > 0 ? ids : [ingredientId];
}
