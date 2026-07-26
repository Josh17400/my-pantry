/**
 * Dairy + eggs.
 *
 * Densities: USDA FDC whole milk ~1.03 g/ml; butter ~0.911 g/ml;
 * US stick butter = 1/4 lb = 113.398 g. Cheese shredded density is packing-
 * dependent — elevated uncertaintyPct.
 */

import {
  bundle,
  countForm,
  edge,
  ingredient,
  massForm,
  mergeBundles,
  pack,
  simpleCount,
  simpleMass,
  simpleVolume,
  volumeForm,
} from '../helpers';
import {
  CUP_ML,
  GALLON_ML,
  KNOWN_DENSITIES,
  OZ_G,
} from '../sources';
import type { SeedCategoryBundle } from '../types';

const MILK = KNOWN_DENSITIES.whole_milk_g_per_ml;
const BUTTER_D = KNOWN_DENSITIES.butter_g_per_ml;
const STICK_G = KNOWN_DENSITIES.butter_stick_g;
const EGG_G = KNOWN_DENSITIES.large_egg_g;

/** Multi-form: butter (stick / tbsp volume / bulk mass). */
const butter: SeedCategoryBundle = (() => {
  const id = 'butter';
  const stick = countForm(id, 'stick', STICK_G, 2);
  // tbsp as volume of melted/soft butter via density
  const tbspVol = volumeForm(id, 'tbsp', BUTTER_D, 8);
  const bulk = massForm(id, 'bulk', {
    densityGPerMl: BUTTER_D,
    uncertaintyPct: 5,
  });
  // 1 stick = 8 tbsp US; stick stores as count (each), tbsp as ml.
  // 1 stick → 8 tbsp * 14.78676 ml/tbsp ≈ 118.29 ml
  // factor: each → ml = 8 * 14.78676478125
  const stickToTbspMl = 8 * 14.78676478125;
  return bundle(
    [
      ingredient({
        id,
        name: 'Butter',
        category: 'dairy',
        allergens: ['milk'],
        isStaple: true,
        defaultFormId: stick.id,
        aliases: ['BUTTER', 'SWEET CREAM BUTTER', 'UNSALTED BUTTER', 'SALTED BUTTER'],
      }),
    ],
    [stick, tbspVol, bulk],
    [
      // stick (each) → bulk (g): gramsPerCount already 113.398; edge for graph clarity
      edge({
        fromFormId: stick.id,
        toFormId: bulk.id,
        factor: STICK_G, // 1 each → STICK_G grams
        uncertaintyPct: 2,
        source: 'us_dairy',
      }),
      edge({
        fromFormId: stick.id,
        toFormId: tbspVol.id,
        factor: stickToTbspMl, // 1 each → ml
        uncertaintyPct: 5,
        source: 'us_dairy',
      }),
    ],
    [
      pack(stick.id, 'stick_4oz', STICK_G),
      pack(stick.id, 'box_4_sticks', STICK_G * 4),
      pack(bulk.id, 'lb', 453.59237),
    ],
  );
})();

/** Multi-form: cheddar block / shredded. */
const cheddar: SeedCategoryBundle = (() => {
  const id = 'cheddar';
  // Block: mass. Shredded: mass with volume density for cup measures.
  // Shredded cheddar ~113 g/cup loosely packed (culinary) → 0.478 g/ml; packing varies a lot.
  const block = massForm(id, 'block', { uncertaintyPct: 3 });
  const shredded = massForm(id, 'shredded', {
    densityGPerMl: 113 / CUP_ML,
    uncertaintyPct: 25,
  });
  // Block ↔ shredded is same mass (1:1) ignoring air — factor 1 on mass base.
  return bundle(
    [
      ingredient({
        id,
        name: 'Cheddar cheese',
        category: 'dairy',
        allergens: ['milk'],
        isStaple: true,
        defaultFormId: block.id,
        aliases: [
          'CHEDDAR',
          'CHDR',
          'SHRD CHDR',
          'SHREDDED CHEDDAR',
          'CHEDDAR BLOCK',
          'MILD CHEDDAR',
          'SHARP CHEDDAR',
        ],
      }),
    ],
    [block, shredded],
    [
      edge({
        fromFormId: block.id,
        toFormId: shredded.id,
        factor: 1,
        uncertaintyPct: 5,
        source: 'seed',
      }),
    ],
    [
      pack(block.id, 'block_8oz', 8 * OZ_G),
      pack(block.id, 'block_16oz', 16 * OZ_G),
      pack(shredded.id, 'bag_8oz_shredded', 8 * OZ_G),
    ],
  );
})();

/** Multi-form: Parmesan block / grated / shredded. */
const parmesan: SeedCategoryBundle = (() => {
  const id = 'parmesan';
  const block = massForm(id, 'block', { uncertaintyPct: 3 });
  // Grated Parmesan ~90 g/cup (culinary / units test uses 0.38 g/ml)
  const grated = massForm(id, 'grated', {
    densityGPerMl: 0.38,
    uncertaintyPct: 20,
  });
  const shredded = massForm(id, 'shredded', {
    densityGPerMl: 0.35,
    uncertaintyPct: 25,
  });
  return bundle(
    [
      ingredient({
        id,
        name: 'Parmesan',
        category: 'dairy',
        allergens: ['milk'],
        isStaple: false,
        defaultFormId: grated.id,
        aliases: ['PARM', 'PARMESAN CHEESE', 'PARMGIANO', 'PARMIGIANO', 'PARMIGIANO REGGIANO'],
      }),
    ],
    [block, grated, shredded],
    [
      edge({
        fromFormId: block.id,
        toFormId: grated.id,
        factor: 1,
        uncertaintyPct: 10,
        source: 'seed',
      }),
      edge({
        fromFormId: block.id,
        toFormId: shredded.id,
        factor: 1,
        uncertaintyPct: 10,
        source: 'seed',
      }),
    ],
    [
      pack(block.id, 'wedge_8oz', 8 * OZ_G),
      pack(grated.id, 'canister_8oz', 8 * OZ_G),
      pack(shredded.id, 'bag_5oz', 5 * OZ_G),
    ],
  );
})();

/** Eggs — large default, dozen package. */
const eggs: SeedCategoryBundle = (() => {
  const id = 'egg';
  const whole = countForm(id, 'whole', EGG_G, 10);
  return bundle(
    [
      ingredient({
        id,
        name: 'Egg',
        category: 'dairy',
        allergens: ['egg'],
        isStaple: true,
        defaultFormId: whole.id,
        aliases: ['EGGS', 'LG EGGS', 'LARGE EGGS', 'GRADE A EGGS'],
      }),
    ],
    [whole],
    [],
    [pack(whole.id, 'dozen', 12 * EGG_G), pack(whole.id, '18ct', 18 * EGG_G)],
  );
})();

/** Whole milk — gallon package. */
const milk: SeedCategoryBundle = (() => {
  const id = 'milk';
  const liquid = volumeForm(id, 'liquid', MILK, 3);
  const galG = GALLON_ML * MILK;
  const halfGalG = (GALLON_ML / 2) * MILK;
  return bundle(
    [
      ingredient({
        id,
        name: 'Milk (whole)',
        category: 'dairy',
        allergens: ['milk'],
        isStaple: true,
        defaultFormId: liquid.id,
        aliases: ['WHOLE MILK', 'MILK WHOLE', 'VIT D MILK', 'HOMO MILK'],
      }),
    ],
    [liquid],
    [],
    [
      pack(liquid.id, 'gallon', galG),
      pack(liquid.id, 'half_gallon', halfGalG),
      pack(liquid.id, 'quart', (GALLON_ML / 4) * MILK),
    ],
  );
})();

const rest = mergeBundles(
  simpleVolume('milk-2pct', 'Milk (2%)', 'dairy', 1.03, {
    isStaple: true,
    allergens: ['milk'],
    aliases: ['2% MILK', '2 PCT MILK', 'REDUCED FAT MILK'],
    packages: [{ label: 'gallon', netG: GALLON_ML * 1.03 }],
  }),
  simpleVolume('milk-skim', 'Milk (skim)', 'dairy', 1.033, {
    allergens: ['milk'],
    aliases: ['SKIM MILK', 'FAT FREE MILK', 'NONFAT MILK'],
    packages: [{ label: 'gallon', netG: GALLON_ML * 1.033 }],
  }),
  simpleVolume('buttermilk', 'Buttermilk', 'dairy', 1.03, {
    allergens: ['milk'],
    aliases: ['BUTTERMILK'],
    packages: [{ label: 'quart', netG: (GALLON_ML / 4) * 1.03 }],
  }),
  simpleVolume('heavy-cream', 'Heavy cream', 'dairy', 0.994, {
    // USDA heavy whipping cream ~0.994 g/ml
    allergens: ['milk'],
    aliases: ['HEAVY CREAM', 'HEAVY WHIPPING CREAM', 'WHIPPING CREAM'],
    packages: [{ label: 'pint', netG: 473.176473 * 0.994 }],
  }),
  simpleVolume('half-and-half', 'Half-and-half', 'dairy', 1.02, {
    allergens: ['milk'],
    aliases: ['HALF AND HALF', 'HALF & HALF', 'H&H'],
    packages: [{ label: 'pint', netG: 473.176473 * 1.02 }],
  }),
  simpleVolume('sour-cream', 'Sour cream', 'dairy', 0.97, {
    allergens: ['milk'],
    aliases: ['SOUR CREAM', 'SOUR CRM'],
    packages: [{ label: 'tub_16oz', netG: 16 * OZ_G }],
  }),
  simpleMass('cream-cheese', 'Cream cheese', 'dairy', {
    densityGPerMl: 0.98,
    uncertaintyPct: 10,
    allergens: ['milk'],
    isStaple: true,
    aliases: ['CREAM CHEESE', 'CRM CHEESE', 'PHILADELPHIA'],
    packages: [{ label: 'block_8oz', netG: 8 * OZ_G }],
  }),
  simpleMass('mozzarella', 'Mozzarella', 'dairy', {
    densityGPerMl: 113 / CUP_ML,
    uncertaintyPct: 25,
    allergens: ['milk'],
    isStaple: true,
    aliases: ['MOZZ', 'MOZZARELLA', 'SHRD MOZZ', 'MOZZ CHEESE'],
    packages: [
      { label: 'block_16oz', netG: 16 * OZ_G },
      { label: 'bag_8oz_shredded', netG: 8 * OZ_G },
    ],
  }),
  simpleMass('swiss-cheese', 'Swiss cheese', 'dairy', {
    allergens: ['milk'],
    aliases: ['SWISS', 'SWISS CHEESE'],
    packages: [{ label: 'block_8oz', netG: 8 * OZ_G }],
  }),
  simpleMass('provolone', 'Provolone', 'dairy', {
    allergens: ['milk'],
    aliases: ['PROVOLONE'],
    packages: [{ label: 'block_8oz', netG: 8 * OZ_G }],
  }),
  simpleMass('pepper-jack', 'Pepper jack cheese', 'dairy', {
    allergens: ['milk'],
    aliases: ['PEPPER JACK', 'PEPPERJACK'],
    packages: [{ label: 'block_8oz', netG: 8 * OZ_G }],
  }),
  simpleMass('american-cheese', 'American cheese', 'dairy', {
    allergens: ['milk'],
    aliases: ['AMERICAN CHEESE', 'AMER SINGLES', 'CHEESE SINGLES'],
    packages: [{ label: 'pack_16_slices', netG: 12 * OZ_G }],
  }),
  simpleMass('feta', 'Feta cheese', 'dairy', {
    allergens: ['milk'],
    aliases: ['FETA', 'FETA CHEESE'],
    packages: [{ label: 'block_8oz', netG: 8 * OZ_G }],
  }),
  simpleMass('goat-cheese', 'Goat cheese', 'dairy', {
    allergens: ['milk'],
    aliases: ['GOAT CHEESE', 'CHEVRE', 'CHÈVRE'],
    packages: [{ label: 'log_4oz', netG: 4 * OZ_G }],
  }),
  simpleMass('ricotta', 'Ricotta', 'dairy', {
    densityGPerMl: 1.04,
    uncertaintyPct: 12,
    allergens: ['milk'],
    aliases: ['RICOTTA', 'RICOTTA CHEESE'],
    packages: [{ label: 'tub_15oz', netG: 15 * OZ_G }],
  }),
  simpleMass('cottage-cheese', 'Cottage cheese', 'dairy', {
    densityGPerMl: 1.02,
    uncertaintyPct: 12,
    allergens: ['milk'],
    aliases: ['COTTAGE CHEESE', 'COTT CHEESE'],
    packages: [{ label: 'tub_24oz', netG: 24 * OZ_G }],
  }),
  simpleMass('yogurt-plain', 'Plain yogurt', 'dairy', {
    densityGPerMl: 1.04,
    uncertaintyPct: 10,
    allergens: ['milk'],
    isStaple: true,
    aliases: ['YOGURT', 'PLAIN YOGURT', 'YOGHURT'],
    packages: [{ label: 'tub_32oz', netG: 32 * OZ_G }],
  }),
  simpleMass('yogurt-greek', 'Greek yogurt', 'dairy', {
    densityGPerMl: 1.06,
    uncertaintyPct: 10,
    allergens: ['milk'],
    isStaple: true,
    aliases: ['GREEK YOGURT', 'GRK YOGURT'],
    packages: [
      { label: 'tub_32oz', netG: 32 * OZ_G },
      { label: 'cup_5_3oz', netG: 5.3 * OZ_G },
    ],
  }),
  simpleMass('butter-ghee', 'Ghee', 'dairy', {
    densityGPerMl: 0.91,
    uncertaintyPct: 8,
    allergens: ['milk'],
    aliases: ['GHEE', 'CLARIFIED BUTTER'],
    packages: [{ label: 'jar_13oz', netG: 13 * OZ_G }],
  }),
  simpleVolume('oat-milk', 'Oat milk', 'dairy', 1.03, {
    // Conventional oat milk often uses non-GF oats (cross-contamination).
    // Certified GF brands exist — we under-assume safety, not over-clear.
    allergens: [],
    dietaryFlags: ['gluten'],
    aliases: ['OAT MILK', 'OATMILK'],
    packages: [{ label: 'half_gallon', netG: (GALLON_ML / 2) * 1.03 }],
  }),
  simpleVolume('almond-milk', 'Almond milk', 'dairy', 1.01, {
    allergens: ['tree_nut'],
    aliases: ['ALMOND MILK', 'ALM MILK'],
    packages: [{ label: 'half_gallon', netG: (GALLON_ML / 2) * 1.01 }],
  }),
  simpleVolume('soy-milk', 'Soy milk', 'dairy', 1.04, {
    allergens: ['soy'],
    aliases: ['SOY MILK', 'SOYMILK'],
    packages: [{ label: 'half_gallon', netG: (GALLON_ML / 2) * 1.04 }],
  }),
  simpleMass('whipped-cream', 'Whipped cream (aerosol)', 'dairy', {
    allergens: ['milk'],
    aliases: ['WHIPPED CREAM', 'COOL WHIP', 'WHIP CREAM'],
    packages: [{ label: 'can_6_5oz', netG: 6.5 * OZ_G }],
  }),
  simpleCount('string-cheese', 'String cheese', 'dairy', 28, {
    uncertaintyPct: 10,
    allergens: ['milk'],
    aliases: ['STRING CHEESE STICKS'],
    packages: [{ label: 'pack_12', netG: 12 * 28 }],
  }),
);

export const dairy: SeedCategoryBundle = mergeBundles(
  butter,
  cheddar,
  parmesan,
  eggs,
  milk,
  rest,
);
