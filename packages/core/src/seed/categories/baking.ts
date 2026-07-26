/**
 * Baking staples — flour, sugar, leaveners, chocolate chips.
 *
 * Cup weights: King Arthur Baking chart + USDA where available.
 * densityGPerMl = g_per_cup / 236.5882365 (US customary cup).
 */

import type { SeedCategoryBundle } from '../types';
import { mergeBundles, simpleMass, simpleVolume } from '../helpers';
import { KNOWN_DENSITIES, LB_G, OZ_G } from '../sources';

export const baking: SeedCategoryBundle = mergeBundles(
  simpleMass('flour-ap', 'All-purpose flour', 'baking', {
    densityGPerMl: KNOWN_DENSITIES.ap_flour_g_per_ml,
    uncertaintyPct: 12,
    isStaple: true,
    allergens: ['wheat'],
    aliases: ['FLOUR', 'AP FLOUR', 'ALL PURPOSE FLOUR', 'ALL-PURPOSE FLOUR', 'WF FLOUR'],
    packages: [
      { label: 'bag_5lb', netG: 5 * LB_G },
      { label: 'bag_10lb', netG: 10 * LB_G },
      { label: 'bag_2lb', netG: 2 * LB_G },
    ],
  }),
  simpleMass('flour-bread', 'Bread flour', 'baking', {
    densityGPerMl: KNOWN_DENSITIES.bread_flour_g_per_ml,
    uncertaintyPct: 12,
    allergens: ['wheat'],
    aliases: ['BREAD FLOUR'],
    packages: [{ label: 'bag_5lb', netG: 5 * LB_G }],
  }),
  simpleMass('flour-ww', 'Whole wheat flour', 'baking', {
    densityGPerMl: KNOWN_DENSITIES.whole_wheat_flour_g_per_ml,
    uncertaintyPct: 12,
    allergens: ['wheat'],
    aliases: ['WHOLE WHEAT FLOUR', 'WW FLOUR', 'WHOLE WHEAT'],
    packages: [{ label: 'bag_5lb', netG: 5 * LB_G }],
  }),
  simpleMass('flour-cake', 'Cake flour', 'baking', {
    // King Arthur cake flour ~120 g/cup same spooned; some charts 114 g
    densityGPerMl: 114 / 236.5882365,
    uncertaintyPct: 15,
    allergens: ['wheat'],
    aliases: ['CAKE FLOUR'],
    packages: [{ label: 'box_32oz', netG: 32 * OZ_G }],
  }),
  simpleMass('flour-self-rising', 'Self-rising flour', 'baking', {
    densityGPerMl: KNOWN_DENSITIES.ap_flour_g_per_ml,
    uncertaintyPct: 12,
    allergens: ['wheat'],
    aliases: ['SELF RISING FLOUR', 'SELF-RISING FLOUR'],
    packages: [{ label: 'bag_5lb', netG: 5 * LB_G }],
  }),
  simpleMass('flour-almond', 'Almond flour', 'baking', {
    // King Arthur almond flour ~96 g/cup
    densityGPerMl: 96 / 236.5882365,
    uncertaintyPct: 15,
    allergens: ['tree_nut'],
    aliases: ['ALMOND FLOUR', 'ALMOND MEAL'],
    packages: [{ label: 'bag_16oz', netG: 16 * OZ_G }],
  }),
  simpleMass('flour-coconut', 'Coconut flour', 'baking', {
    densityGPerMl: 128 / 236.5882365,
    uncertaintyPct: 18,
    // Coconut is not tree_nut under FALCPA but often grouped; we do NOT tag tree_nut
    // (FDA: coconut is a tree nut for labeling — actually FDA does list coconut as tree nut!)
    allergens: ['tree_nut'],
    aliases: ['COCONUT FLOUR'],
    packages: [{ label: 'bag_16oz', netG: 16 * OZ_G }],
  }),
  simpleMass('sugar-granulated', 'Granulated sugar', 'baking', {
    densityGPerMl: KNOWN_DENSITIES.granulated_sugar_g_per_ml,
    uncertaintyPct: 5,
    isStaple: true,
    aliases: ['SUGAR', 'WHITE SUGAR', 'GRANULATED SUGAR', 'CANE SUGAR'],
    packages: [
      { label: 'bag_4lb', netG: 4 * LB_G },
      { label: 'bag_5lb', netG: 5 * LB_G },
      { label: 'bag_10lb', netG: 10 * LB_G },
    ],
  }),
  simpleMass('sugar-brown', 'Brown sugar', 'baking', {
    densityGPerMl: KNOWN_DENSITIES.brown_sugar_packed_g_per_ml,
    uncertaintyPct: 15,
    isStaple: true,
    aliases: ['BROWN SUGAR', 'LT BROWN SUGAR', 'DK BROWN SUGAR', 'LIGHT BROWN SUGAR'],
    packages: [{ label: 'bag_2lb', netG: 2 * LB_G }],
  }),
  simpleMass('sugar-powdered', 'Powdered sugar', 'baking', {
    densityGPerMl: KNOWN_DENSITIES.powdered_sugar_g_per_ml,
    uncertaintyPct: 15,
    aliases: ['POWDERED SUGAR', 'CONFECTIONERS SUGAR', 'ICING SUGAR', '10X SUGAR'],
    packages: [{ label: 'bag_2lb', netG: 2 * LB_G }],
  }),
  simpleMass('sugar-raw', 'Raw sugar / turbinado', 'baking', {
    densityGPerMl: 200 / 236.5882365,
    uncertaintyPct: 12,
    aliases: ['RAW SUGAR', 'TURBINADO', 'DEMERARA'],
    packages: [{ label: 'bag_2lb', netG: 2 * LB_G }],
  }),
  simpleMass('baking-soda', 'Baking soda', 'baking', {
    // USDA sodium bicarbonate ~0.87–1.0 g/ml; King Arthur 288 g/cup → 1.217? Wait KA says 1/2 tsp = 3g
    // 1 cup baking soda ≈ 288 g (KA) → 1.217 g/ml — same order as salt
    densityGPerMl: 288 / 236.5882365,
    uncertaintyPct: 10,
    isStaple: true,
    aliases: ['BAKING SODA', 'BICARB', 'SODIUM BICARBONATE'],
    packages: [{ label: 'box_16oz', netG: 16 * OZ_G }],
  }),
  simpleMass('baking-powder', 'Baking powder', 'baking', {
    // KA: 1 tsp ≈ 4 g; ~192 g/cup → 0.811 g/ml
    densityGPerMl: 192 / 236.5882365,
    uncertaintyPct: 12,
    isStaple: true,
    // Many US double-acting powders are corn-starch based, gluten-free — no wheat default
    aliases: ['BAKING POWDER', 'BKNG PWD'],
    packages: [{ label: 'can_8_1oz', netG: 8.1 * OZ_G }],
  }),
  simpleMass('cornstarch', 'Cornstarch', 'baking', {
    // KA 112 g/cup
    densityGPerMl: 112 / 236.5882365,
    uncertaintyPct: 10,
    isStaple: true,
    aliases: ['CORNSTARCH', 'CORN STARCH', 'CORNFLOUR'],
    packages: [{ label: 'box_16oz', netG: 16 * OZ_G }],
  }),
  simpleMass('yeast-active-dry', 'Active dry yeast', 'baking', {
    // Packets ~7 g; density ~0.8 g/ml for granules
    densityGPerMl: 0.8,
    uncertaintyPct: 15,
    // Pure yeast is not a major allergen; wheat tag omitted (facility cross-contact is brand-specific).
    aliases: ['YEAST', 'ACTIVE DRY YEAST', 'DRY YEAST'],
    packages: [
      { label: 'strip_3pk', netG: 21 },
      { label: 'jar_4oz', netG: 4 * OZ_G },
    ],
  }),
  simpleMass('yeast-instant', 'Instant yeast', 'baking', {
    densityGPerMl: 0.8,
    uncertaintyPct: 15,
    aliases: ['INSTANT YEAST', 'RAPID RISE YEAST', 'BREAD MACHINE YEAST'],
    packages: [{ label: 'jar_4oz', netG: 4 * OZ_G }],
  }),
  simpleMass('chocolate-chips', 'Chocolate chips', 'baking', {
    // Semi-sweet chips ~170 g/cup
    densityGPerMl: 170 / 236.5882365,
    uncertaintyPct: 12,
    // Most US chocolate chips: milk and soy lecithin
    allergens: ['milk', 'soy'],
    isStaple: true,
    aliases: ['CHOC CHIPS', 'CHOCOLATE CHIPS', 'SEMI SWEET CHIPS', 'SEMISWEET CHIPS'],
    packages: [
      { label: 'bag_12oz', netG: 12 * OZ_G },
      { label: 'bag_24oz', netG: 24 * OZ_G },
    ],
  }),
  simpleMass('chocolate-chips-white', 'White chocolate chips', 'baking', {
    densityGPerMl: 170 / 236.5882365,
    uncertaintyPct: 12,
    allergens: ['milk', 'soy'],
    aliases: ['WHITE CHIPS', 'WHITE CHOCOLATE CHIPS'],
    packages: [{ label: 'bag_12oz', netG: 12 * OZ_G }],
  }),
  simpleMass('cocoa-powder', 'Cocoa powder (unsweetened)', 'baking', {
    // KA 42 g/cup natural cocoa — very light
    densityGPerMl: 42 / 236.5882365,
    uncertaintyPct: 20,
    // Cocoa often processed with soy lecithin in some brands; pure cocoa is fine.
    // Conservative: no soy on pure unsweetened; milk-free.
    aliases: ['COCOA', 'COCOA POWDER', 'UNSWEETENED COCOA'],
    packages: [{ label: 'can_8oz', netG: 8 * OZ_G }],
  }),
  simpleMass('chocolate-bar-baking', 'Baking chocolate', 'baking', {
    allergens: ['soy'],
    aliases: ['BAKING CHOCOLATE', 'UNSWEETENED CHOCOLATE', 'BAKERS CHOCOLATE'],
    packages: [{ label: 'bar_4oz', netG: 4 * OZ_G }],
  }),
  simpleVolume('vanilla-extract', 'Vanilla extract', 'baking', 0.88, {
    // Alcoholic extract density ~0.88 g/ml (culinary; varies by brand strength)
    uncertaintyPct: 10,
    isStaple: true,
    dietaryFlags: ['alcohol'],
    aliases: ['VANILLA', 'VANILLA EXTRACT', 'PURE VANILLA'],
    packages: [{ label: 'bottle_2oz', netG: 2 * 29.5735295625 * 0.88 }],
  }),
  simpleMass('malt-extract', 'Malt extract / malt syrup', 'baking', {
    densityGPerMl: 1.4,
    uncertaintyPct: 15,
    // Barley malt — gluten, not FALCPA wheat.
    allergens: [],
    dietaryFlags: ['gluten'],
    aliases: ['MALT', 'MALT EXTRACT', 'MALT SYRUP', 'BARLEY MALT'],
    packages: [{ label: 'jar_12oz', netG: 12 * OZ_G }],
  }),
  simpleMass('yeast-brewers', "Brewer's yeast", 'baking', {
    densityGPerMl: 0.5,
    uncertaintyPct: 20,
    // Brewer's yeast is often a byproduct of beer brewing (barley) — gluten risk.
    // Not the same as nutritional yeast (typically GF); do not alias those together.
    allergens: [],
    dietaryFlags: ['gluten'],
    aliases: ['BREWERS YEAST', "BREWER'S YEAST"],
    packages: [{ label: 'jar_8oz', netG: 8 * OZ_G }],
  }),
  simpleMass('shortening', 'Vegetable shortening', 'baking', {
    densityGPerMl: 0.92,
    uncertaintyPct: 8,
    // Crisco-style may have soy
    allergens: ['soy'],
    aliases: ['SHORTENING', 'CRISCO', 'VEGETABLE SHORTENING'],
    packages: [{ label: 'can_48oz', netG: 48 * OZ_G }],
  }),
  simpleMass('marshmallows', 'Marshmallows', 'baking', {
    densityGPerMl: 0.2,
    uncertaintyPct: 30,
    // Gelatin is not a major allergen; some vegan use agar
    aliases: ['MARSHMALLOWS', 'MINI MARSHMALLOWS'],
    packages: [{ label: 'bag_10oz', netG: 10 * OZ_G }],
  }),
  simpleMass('gelatin', 'Gelatin (powdered)', 'baking', {
    densityGPerMl: 0.7,
    uncertaintyPct: 20,
    aliases: ['GELATIN', 'KNOX', 'GELATINE'],
    packages: [{ label: 'box_1oz', netG: 1 * OZ_G }],
  }),
  simpleMass('food-coloring', 'Food coloring', 'baking', {
    densityGPerMl: 1.0,
    uncertaintyPct: 15,
    aliases: ['FOOD COLORING', 'FOOD COLOUR'],
    packages: [{ label: 'set_4', netG: 40 }],
  }),
  simpleMass('pie-crust', 'Pie crust (refrigerated)', 'baking', {
    allergens: ['wheat', 'soy'],
    aliases: ['PIE CRUST', 'REFRIGERATED PIE CRUST'],
    packages: [{ label: 'pack_2ct', netG: 14 * OZ_G }],
  }),
  simpleMass('puff-pastry', 'Puff pastry', 'baking', {
    allergens: ['wheat', 'milk', 'soy'],
    aliases: ['PUFF PASTRY', 'PUFF PASTRY SHEETS'],
    packages: [{ label: 'box_17_3oz', netG: 17.3 * OZ_G }],
  }),
  simpleMass('cornmeal', 'Cornmeal', 'baking', {
    densityGPerMl: 156 / 236.5882365,
    uncertaintyPct: 12,
    aliases: ['CORNMEAL', 'CORN MEAL', 'YELLOW CORNMEAL'],
    packages: [{ label: 'bag_2lb', netG: 2 * LB_G }],
  }),
  simpleMass('breadcrumbs', 'Breadcrumbs', 'baking', {
    densityGPerMl: 108 / 236.5882365,
    uncertaintyPct: 20,
    allergens: ['wheat'],
    aliases: ['BREADCRUMBS', 'BREAD CRUMBS', 'ITALIAN BREADCRUMBS'],
    packages: [{ label: 'can_15oz', netG: 15 * OZ_G }],
  }),
  simpleMass('panko', 'Panko breadcrumbs', 'baking', {
    densityGPerMl: 50 / 236.5882365,
    uncertaintyPct: 25,
    allergens: ['wheat'],
    aliases: ['PANKO BREADCRUMBS', 'PANKO CRUMBS'],
    packages: [{ label: 'box_8oz', netG: 8 * OZ_G }],
  }),
);
