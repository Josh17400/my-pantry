/**
 * Density / weight source registry for seed data.
 *
 * Prefer USDA FoodData Central (FDC) SR Legacy or Foundation foods.
 * Culinary references (King Arthur, Serious Eats) used only where USDA lacks
 * a cup-weight for a prepared form (e.g. scooped flour).
 *
 * Keys are short tags used in form comments and conversion `source` fields.
 * Do not invent numbers; if a value is a rough kitchen average, tag it
 * `kitchen-avg` with high uncertaintyPct.
 */

export const DENSITY_SOURCES = {
  /**
   * USDA FoodData Central — SR Legacy / Foundation.
   * https://fdc.nal.usda.gov/
   */
  usda: 'USDA FoodData Central (SR Legacy / Foundation)',

  /**
   * King Arthur Baking ingredient weight chart (cup → g for baking staples).
   * https://www.kingarthurbaking.com/learn/ingredient-weight-chart
   */
  king_arthur: 'King Arthur Baking ingredient weight chart',

  /**
   * NIST / SI-derived physical constants (water 1.0 g/ml at ~4 °C reference;
   * US customary volume factors already in units/).
   */
  physical: 'Physical / metrology (water density, unit definitions)',

  /**
   * US dairy industry / stick butter definition: 1 stick = 1/4 lb = 113.398 g.
   */
  us_dairy: 'US dairy stick standard (1/4 lb butter stick)',

  /**
   * Typical retail drained-weight ratios (canned goods) from common US labels
   * and USDA canned drained-weight tables — high uncertainty when applied
   * generically.
   */
  retail_label: 'US retail label / drained-weight typicals',

  /**
   * Kitchen averages for produce counts (clove, medium onion, bunch).
   * Highly variable by cultivar/store/season — always high uncertaintyPct.
   */
  kitchen_avg: 'Kitchen average (variable produce; high uncertainty)',

  /**
   * Culinary conversion consensus (e.g. Serious Eats, Cook’s Illustrated)
   * cross-checked against USDA where available.
   */
  culinary: 'Culinary reference (cross-checked vs USDA where possible)',
} as const;

export type DensitySourceKey = keyof typeof DENSITY_SOURCES;

/**
 * Well-known mass densities (g/ml) used across categories.
 * Each value is documented; do not drift these without updating citations.
 *
 * Cup weights use US customary cup = 236.5882365 ml (see units/factors.ts).
 * densityGPerMl = grams_per_cup / 236.5882365
 */
export const KNOWN_DENSITIES = {
  /** Water ≈ 1.0 g/ml — physical reference. */
  water_g_per_ml: 1.0,

  /**
   * Granulated sugar ≈ 200 g/cup → 0.845 g/ml
   * King Arthur: 198 g/cup; USDA granulated sugar cup weight ~200 g.
   */
  granulated_sugar_g_per_ml: 200 / 236.5882365,

  /**
   * All-purpose flour, spooned/leveled ≈ 120 g/cup → 0.507 g/ml
   * King Arthur 120 g; USDA unsifted ~125 g — we use spooned standard.
   */
  ap_flour_g_per_ml: 120 / 236.5882365,

  /**
   * Bread flour ≈ 120 g/cup (King Arthur).
   */
  bread_flour_g_per_ml: 120 / 236.5882365,

  /**
   * Whole wheat flour ≈ 113 g/cup (King Arthur) → 0.478 g/ml
   */
  whole_wheat_flour_g_per_ml: 113 / 236.5882365,

  /**
   * Packed brown sugar ≈ 213 g/cup (King Arthur) → 0.900 g/ml
   */
  brown_sugar_packed_g_per_ml: 213 / 236.5882365,

  /**
   * Confectioners’ / powdered sugar ≈ 113 g/cup (King Arthur) → 0.478 g/ml
   */
  powdered_sugar_g_per_ml: 113 / 236.5882365,

  /**
   * Butter: USDA ~0.911 g/ml; 1 stick = 113.398 g (1/4 lb).
   */
  butter_g_per_ml: 0.911,
  butter_stick_g: 113.398,

  /**
   * Honey: USDA ~1.42 g/ml (viscous syrup).
   * FDC: Honey ~339 g per cup → 1.433 g/ml
   */
  honey_g_per_ml: 1.42,

  /**
   * Olive oil: USDA ~0.91 g/ml
   */
  olive_oil_g_per_ml: 0.91,

  /**
   * Vegetable / canola oil: ~0.92 g/ml (USDA oils cluster)
   */
  vegetable_oil_g_per_ml: 0.92,

  /**
   * Whole milk: USDA ~1.03 g/ml
   */
  whole_milk_g_per_ml: 1.03,

  /**
   * Table salt: USDA ~1.217 g/ml
   */
  table_salt_g_per_ml: 1.217,

  /**
   * Large egg, without shell: USDA ~50 g (whole egg with shell ~57 g;
   * edible portion commonly 50 g for recipes).
   */
  large_egg_g: 50,

  /**
   * Garlic clove: kitchen avg ~3 g (USDA raw garlic ~3 g/clove typical).
   */
  garlic_clove_g: 3,

  /**
   * Kosher salt (Diamond Crystal) is much lighter by volume — ~0.5× table.
   * King Arthur: Diamond Crystal 140 g/cup → 0.591 g/ml
   */
  kosher_salt_diamond_g_per_ml: 140 / 236.5882365,

  /**
   * White rice, uncooked: ~185 g/cup (USDA) → 0.782 g/ml
   */
  white_rice_uncooked_g_per_ml: 185 / 236.5882365,

  /**
   * Dry pasta shapes vary widely; long pasta ~100 g/cup broken — high uncertainty.
   * Prefer mass packages for pasta.
   */
  dry_pasta_g_per_ml: 100 / 236.5882365,
} as const;

/** Ounces (avoirdupois) → grams — International yard and pound. */
export const OZ_G = 28.349523125;
export const LB_G = 453.59237;
/** US fluid ounce → ml (NIST). */
export const FL_OZ_ML = 29.5735295625;
/** US cup → ml. */
export const CUP_ML = 236.5882365;
/** US gallon → ml. */
export const GALLON_ML = 3785.411784;
