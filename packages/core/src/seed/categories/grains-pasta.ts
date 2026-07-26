/**
 * Grains, pasta, rice, bread, cereal.
 */

import type { SeedCategoryBundle } from '../types';
import { mergeBundles, simpleMass, simpleCount } from '../helpers';
import { KNOWN_DENSITIES, LB_G, OZ_G } from '../sources';

export const grainsPasta: SeedCategoryBundle = mergeBundles(
  simpleMass('rice-white', 'White rice', 'grains-pasta', {
    densityGPerMl: KNOWN_DENSITIES.white_rice_uncooked_g_per_ml,
    uncertaintyPct: 8,
    isStaple: true,
    aliases: ['RICE', 'WHITE RICE', 'LONG GRAIN RICE', 'JASMINE RICE', 'BASMATI'],
    packages: [
      { label: 'bag_2lb', netG: 2 * LB_G },
      { label: 'bag_5lb', netG: 5 * LB_G },
      { label: 'bag_20lb', netG: 20 * LB_G },
    ],
  }),
  simpleMass('rice-brown', 'Brown rice', 'grains-pasta', {
    densityGPerMl: 190 / 236.5882365,
    uncertaintyPct: 10,
    aliases: ['BROWN RICE'],
    packages: [{ label: 'bag_2lb', netG: 2 * LB_G }],
  }),
  simpleMass('rice-arborio', 'Arborio rice', 'grains-pasta', {
    densityGPerMl: 200 / 236.5882365,
    uncertaintyPct: 12,
    aliases: ['ARBORIO', 'RISOTTO RICE'],
    packages: [{ label: 'bag_2lb', netG: 2 * LB_G }],
  }),
  simpleMass('pasta-spaghetti', 'Spaghetti', 'grains-pasta', {
    isStaple: true,
    allergens: ['wheat'],
    aliases: ['SPAGHETTI', 'SPAGHETTI PASTA'],
    packages: [
      { label: 'box_16oz', netG: 16 * OZ_G },
      { label: 'box_32oz', netG: 32 * OZ_G },
    ],
  }),
  simpleMass('pasta-penne', 'Penne', 'grains-pasta', {
    isStaple: true,
    allergens: ['wheat'],
    aliases: ['PENNE', 'PENNE PASTA'],
    packages: [{ label: 'box_16oz', netG: 16 * OZ_G }],
  }),
  simpleMass('pasta-rotini', 'Rotini', 'grains-pasta', {
    allergens: ['wheat'],
    aliases: ['ROTINI', 'FUSILLI'],
    packages: [{ label: 'box_16oz', netG: 16 * OZ_G }],
  }),
  simpleMass('pasta-elbow', 'Elbow macaroni', 'grains-pasta', {
    isStaple: true,
    allergens: ['wheat'],
    aliases: ['ELBOW MACARONI', 'MACARONI', 'ELBOWS', 'MAC'],
    packages: [{ label: 'box_16oz', netG: 16 * OZ_G }],
  }),
  simpleMass('pasta-lasagna', 'Lasagna noodles', 'grains-pasta', {
    allergens: ['wheat', 'egg'],
    aliases: ['LASAGNA', 'LASAGNA NOODLES', 'LASAGNE'],
    packages: [{ label: 'box_16oz', netG: 16 * OZ_G }],
  }),
  simpleMass('pasta-egg-noodles', 'Egg noodles', 'grains-pasta', {
    allergens: ['wheat', 'egg'],
    aliases: ['EGG NOODLES', 'WIDE EGG NOODLES'],
    packages: [{ label: 'bag_12oz', netG: 12 * OZ_G }],
  }),
  simpleMass('pasta-orzo', 'Orzo', 'grains-pasta', {
    allergens: ['wheat'],
    aliases: ['ORZO'],
    packages: [{ label: 'box_16oz', netG: 16 * OZ_G }],
  }),
  simpleMass('couscous', 'Couscous', 'grains-pasta', {
    densityGPerMl: 180 / 236.5882365,
    uncertaintyPct: 12,
    allergens: ['wheat'],
    aliases: ['COUSCOUS'],
    packages: [{ label: 'box_10oz', netG: 10 * OZ_G }],
  }),
  simpleMass('quinoa', 'Quinoa', 'grains-pasta', {
    densityGPerMl: 170 / 236.5882365,
    uncertaintyPct: 10,
    aliases: ['QUINOA'],
    packages: [{ label: 'bag_16oz', netG: 16 * OZ_G }],
  }),
  simpleMass('oats-rolled', 'Rolled oats', 'grains-pasta', {
    // KA old-fashioned oats 89 g/cup
    densityGPerMl: 89 / 236.5882365,
    uncertaintyPct: 12,
    isStaple: true,
    // Conventional oats: high gluten cross-contamination risk (shared mills).
    // Pure GF-certified oats exist but we cannot assume that at retail default.
    dietaryFlags: ['gluten'],
    aliases: ['OATS', 'ROLLED OATS', 'OLD FASHIONED OATS', 'OATMEAL'],
    packages: [
      { label: 'canister_42oz', netG: 42 * OZ_G },
      { label: 'bag_18oz', netG: 18 * OZ_G },
    ],
  }),
  simpleMass('oats-steel-cut', 'Steel-cut oats', 'grains-pasta', {
    densityGPerMl: 160 / 236.5882365,
    uncertaintyPct: 12,
    dietaryFlags: ['gluten'], // same conventional-oats cross-contamination note
    aliases: ['STEEL CUT OATS', 'IRISH OATS'],
    packages: [{ label: 'canister_24oz', netG: 24 * OZ_G }],
  }),
  simpleMass('cereal-cheerios', 'Cheerios-style cereal', 'grains-pasta', {
    densityGPerMl: 0.15,
    uncertaintyPct: 20,
    // Oat cereal — conventional oats often gluten cross-contaminated.
    dietaryFlags: ['gluten'],
    aliases: ['CHEERIOS', 'TOASTED OAT CEREAL'],
    packages: [{ label: 'box_12oz', netG: 12 * OZ_G }],
  }),
  simpleMass('cereal-corn-flakes', 'Corn flakes', 'grains-pasta', {
    densityGPerMl: 0.12,
    uncertaintyPct: 20,
    aliases: ['CORN FLAKES', 'CORNFLAKES'],
    packages: [{ label: 'box_18oz', netG: 18 * OZ_G }],
  }),
  simpleMass('cereal-granola', 'Granola', 'grains-pasta', {
    densityGPerMl: 0.45,
    uncertaintyPct: 20,
    // Often tree nuts + wheat + soy
    allergens: ['tree_nut', 'wheat', 'soy'],
    aliases: ['GRANOLA'],
    packages: [{ label: 'bag_12oz', netG: 12 * OZ_G }],
  }),
  simpleCount('bread-sandwich', 'Sandwich bread', 'grains-pasta', 28, {
    // slice ~28 g
    uncertaintyPct: 15,
    isStaple: true,
    formName: 'slice',
    allergens: ['wheat', 'soy'],
    aliases: ['BREAD', 'SANDWICH BREAD', 'WHITE BREAD', 'WHEAT BREAD', 'LOAF BREAD'],
    packages: [{ label: 'loaf_20oz', netG: 20 * OZ_G }],
  }),
  simpleMass('bread-sourdough', 'Sourdough bread', 'grains-pasta', {
    allergens: ['wheat'],
    aliases: ['SOURDOUGH', 'SOURDOUGH BREAD'],
    packages: [{ label: 'loaf', netG: 16 * OZ_G }],
  }),
  simpleMass('tortilla-flour', 'Flour tortillas', 'grains-pasta', {
    isStaple: true,
    allergens: ['wheat'],
    aliases: ['TORTILLA', 'TORTILLAS', 'FLOUR TORTILLA', 'FLOUR TORTILLAS'],
    packages: [{ label: 'pack_10ct', netG: 15 * OZ_G }],
  }),
  simpleMass('tortilla-corn', 'Corn tortillas', 'grains-pasta', {
    aliases: ['CORN TORTILLA', 'CORN TORTILLAS'],
    packages: [{ label: 'pack_30ct', netG: 25 * OZ_G }],
  }),
  simpleMass('pita', 'Pita bread', 'grains-pasta', {
    allergens: ['wheat'],
    aliases: ['PITA', 'PITA BREAD', 'PITAS'],
    packages: [{ label: 'pack_6ct', netG: 12 * OZ_G }],
  }),
  simpleMass('bagel', 'Bagels', 'grains-pasta', {
    allergens: ['wheat'],
    aliases: ['BAGEL', 'BAGELS'],
    packages: [{ label: 'pack_6ct', netG: 18 * OZ_G }],
  }),
  simpleMass('english-muffin', 'English muffins', 'grains-pasta', {
    allergens: ['wheat'],
    aliases: ['ENGLISH MUFFIN', 'ENGLISH MUFFINS'],
    packages: [{ label: 'pack_6ct', netG: 12 * OZ_G }],
  }),
  simpleMass('hamburger-bun', 'Hamburger buns', 'grains-pasta', {
    allergens: ['wheat', 'soy'],
    aliases: ['HAMBURGER BUNS', 'BURGER BUNS', 'HAMBURGER BUN'],
    packages: [{ label: 'pack_8ct', netG: 14 * OZ_G }],
  }),
  simpleMass('hot-dog-bun', 'Hot dog buns', 'grains-pasta', {
    allergens: ['wheat', 'soy'],
    aliases: ['HOT DOG BUNS', 'HOTDOG BUNS'],
    packages: [{ label: 'pack_8ct', netG: 12 * OZ_G }],
  }),
  simpleMass('polenta', 'Polenta / grits', 'grains-pasta', {
    densityGPerMl: 160 / 236.5882365,
    uncertaintyPct: 12,
    aliases: ['POLENTA', 'GRITS', 'CORN GRITS'],
    packages: [{ label: 'bag_24oz', netG: 24 * OZ_G }],
  }),
  simpleMass('barley', 'Pearl barley', 'grains-pasta', {
    densityGPerMl: 200 / 236.5882365,
    uncertaintyPct: 12,
    // Barley is NOT FALCPA "wheat" — do not fake the allergen. It does contain gluten.
    allergens: [],
    dietaryFlags: ['gluten'],
    aliases: ['BARLEY', 'PEARL BARLEY'],
    packages: [{ label: 'bag_16oz', netG: 16 * OZ_G }],
  }),
  simpleMass('rye', 'Rye flour / rye grain', 'grains-pasta', {
    densityGPerMl: 102 / 236.5882365,
    uncertaintyPct: 15,
    allergens: [],
    dietaryFlags: ['gluten'],
    aliases: ['RYE', 'RYE FLOUR', 'RYE BERRIES'],
    packages: [{ label: 'bag_2lb', netG: 2 * LB_G }],
  }),
  simpleMass('spelt', 'Spelt flour', 'grains-pasta', {
    densityGPerMl: KNOWN_DENSITIES.ap_flour_g_per_ml,
    uncertaintyPct: 15,
    // Spelt is a wheat species — FALCPA wheat + gluten.
    allergens: ['wheat'],
    aliases: ['SPELT', 'SPELT FLOUR'],
    packages: [{ label: 'bag_2lb', netG: 2 * LB_G }],
  }),
  simpleMass('farro', 'Farro', 'grains-pasta', {
    densityGPerMl: 190 / 236.5882365,
    uncertaintyPct: 12,
    // Farro is wheat (emmer/einkorn/spelt family) — FALCPA wheat + gluten.
    allergens: ['wheat'],
    aliases: ['FARRO', 'EMMER'],
    packages: [{ label: 'bag_16oz', netG: 16 * OZ_G }],
  }),
);
