/**
 * Dry pantry staples not covered by baking/grains — nuts, legumes dry, stocks cubes, etc.
 */

import { mergeBundles, simpleMass, simpleVolume } from '../helpers';
import { LB_G, OZ_G } from '../sources';
import type { SeedCategoryBundle } from '../types';

export const pantryStaples: SeedCategoryBundle = mergeBundles(
  simpleMass('beans-black-dry', 'Black beans (dry)', 'pantry-staples', {
    densityGPerMl: 0.85,
    uncertaintyPct: 10,
    aliases: ['DRY BLACK BEANS', 'DRIED BLACK BEANS'],
    packages: [{ label: 'bag_1lb', netG: LB_G }],
  }),
  simpleMass('beans-pinto-dry', 'Pinto beans (dry)', 'pantry-staples', {
    densityGPerMl: 0.85,
    uncertaintyPct: 10,
    aliases: ['DRY PINTO BEANS', 'DRIED PINTO BEANS'],
    packages: [{ label: 'bag_2lb', netG: 2 * LB_G }],
  }),
  simpleMass('lentils', 'Lentils', 'pantry-staples', {
    densityGPerMl: 0.85,
    uncertaintyPct: 10,
    aliases: ['LENTILS', 'BROWN LENTILS', 'GREEN LENTILS'],
    packages: [{ label: 'bag_1lb', netG: LB_G }],
  }),
  simpleMass('split-peas', 'Split peas', 'pantry-staples', {
    densityGPerMl: 0.85,
    uncertaintyPct: 10,
    aliases: ['SPLIT PEAS', 'GREEN SPLIT PEAS'],
    packages: [{ label: 'bag_1lb', netG: LB_G }],
  }),
  simpleMass('almonds', 'Almonds', 'pantry-staples', {
    densityGPerMl: 0.55,
    uncertaintyPct: 15,
    allergens: ['tree_nut'],
    aliases: ['ALMOND', 'ALMONDS', 'WHOLE ALMONDS'],
    packages: [{ label: 'bag_16oz', netG: 16 * OZ_G }],
  }),
  simpleMass('walnuts', 'Walnuts', 'pantry-staples', {
    densityGPerMl: 0.45,
    uncertaintyPct: 15,
    allergens: ['tree_nut'],
    aliases: ['WALNUT', 'WALNUTS', 'WALNUT HALVES'],
    packages: [{ label: 'bag_16oz', netG: 16 * OZ_G }],
  }),
  simpleMass('pecans', 'Pecans', 'pantry-staples', {
    densityGPerMl: 0.45,
    uncertaintyPct: 15,
    allergens: ['tree_nut'],
    aliases: ['PECAN', 'PECANS'],
    packages: [{ label: 'bag_8oz', netG: 8 * OZ_G }],
  }),
  simpleMass('cashews', 'Cashews', 'pantry-staples', {
    densityGPerMl: 0.55,
    uncertaintyPct: 15,
    allergens: ['tree_nut'],
    aliases: ['CASHEW', 'CASHEWS'],
    packages: [{ label: 'bag_16oz', netG: 16 * OZ_G }],
  }),
  simpleMass('peanuts', 'Peanuts', 'pantry-staples', {
    densityGPerMl: 0.55,
    uncertaintyPct: 15,
    allergens: ['peanut'],
    aliases: ['PEANUT', 'PEANUTS', 'ROASTED PEANUTS'],
    packages: [{ label: 'can_16oz', netG: 16 * OZ_G }],
  }),
  simpleMass('raisins', 'Raisins', 'pantry-staples', {
    densityGPerMl: 0.65,
    uncertaintyPct: 12,
    aliases: ['RAISIN', 'RAISINS'],
    packages: [{ label: 'box_12oz', netG: 12 * OZ_G }],
  }),
  simpleMass('dried-cranberries', 'Dried cranberries', 'pantry-staples', {
    densityGPerMl: 0.55,
    uncertaintyPct: 15,
    aliases: ['DRIED CRANBERRIES', 'CRAISINS'],
    packages: [{ label: 'bag_6oz', netG: 6 * OZ_G }],
  }),
  simpleMass('chocolate-chips-dark', 'Dark chocolate chips', 'pantry-staples', {
    densityGPerMl: 170 / 236.5882365,
    uncertaintyPct: 12,
    allergens: ['soy'],
    aliases: ['DARK CHIPS', 'DARK CHOCOLATE CHIPS'],
    packages: [{ label: 'bag_10oz', netG: 10 * OZ_G }],
  }),
  simpleMass('broth-cube', 'Bouillon cubes', 'pantry-staples', {
    uncertaintyPct: 15,
    // Often wheat + soy
    allergens: ['wheat', 'soy'],
    aliases: ['BOUILLON', 'BOUILLON CUBES', 'STOCK CUBES'],
    packages: [{ label: 'jar_3_3oz', netG: 3.3 * OZ_G }],
  }),
  simpleMass('broth-powder', 'Bouillon powder', 'pantry-staples', {
    densityGPerMl: 0.7,
    uncertaintyPct: 15,
    allergens: ['wheat', 'soy'],
    aliases: ['BOUILLON POWDER', 'STOCK POWDER'],
    packages: [{ label: 'jar_4oz', netG: 4 * OZ_G }],
  }),
  simpleMass('tortilla-chips', 'Tortilla chips', 'pantry-staples', {
    densityGPerMl: 0.2,
    uncertaintyPct: 25,
    aliases: ['TORTILLA CHIPS', 'CORN CHIPS', 'NACHOS'],
    packages: [{ label: 'bag_13oz', netG: 13 * OZ_G }],
  }),
  simpleMass('potato-chips', 'Potato chips', 'pantry-staples', {
    densityGPerMl: 0.12,
    uncertaintyPct: 25,
    aliases: ['CHIPS', 'POTATO CHIPS', 'LAYS'],
    packages: [{ label: 'bag_8oz', netG: 8 * OZ_G }],
  }),
  simpleMass('crackers', 'Crackers', 'pantry-staples', {
    densityGPerMl: 0.3,
    uncertaintyPct: 20,
    allergens: ['wheat', 'soy'],
    aliases: ['CRACKERS', 'SALTINES', 'RITZ'],
    packages: [{ label: 'box_16oz', netG: 16 * OZ_G }],
  }),
  simpleMass('pretzels', 'Pretzels', 'pantry-staples', {
    densityGPerMl: 0.25,
    uncertaintyPct: 20,
    allergens: ['wheat'],
    aliases: ['PRETZELS', 'PRETZEL'],
    packages: [{ label: 'bag_16oz', netG: 16 * OZ_G }],
  }),
  simpleMass('popcorn-kernels', 'Popcorn kernels', 'pantry-staples', {
    densityGPerMl: 0.75,
    uncertaintyPct: 10,
    aliases: ['POPCORN', 'POPCORN KERNELS'],
    packages: [{ label: 'bag_2lb', netG: 2 * LB_G }],
  }),
  simpleMass('nuts-mixed', 'Mixed nuts', 'pantry-staples', {
    densityGPerMl: 0.5,
    uncertaintyPct: 20,
    allergens: ['tree_nut', 'peanut'],
    aliases: ['MIXED NUTS'],
    packages: [{ label: 'can_15oz', netG: 15 * OZ_G }],
  }),
  simpleMass('sunflower-seeds', 'Sunflower seeds', 'pantry-staples', {
    densityGPerMl: 0.55,
    uncertaintyPct: 15,
    aliases: ['SUNFLOWER SEEDS', 'SUNFLOWER SEED'],
    packages: [{ label: 'bag_16oz', netG: 16 * OZ_G }],
  }),
  simpleMass('chia-seeds', 'Chia seeds', 'pantry-staples', {
    densityGPerMl: 0.65,
    uncertaintyPct: 12,
    aliases: ['CHIA', 'CHIA SEEDS'],
    packages: [{ label: 'bag_12oz', netG: 12 * OZ_G }],
  }),
  simpleMass('flax-seed', 'Flax seed', 'pantry-staples', {
    densityGPerMl: 0.65,
    uncertaintyPct: 12,
    aliases: ['FLAX', 'FLAX SEED', 'FLAXSEED', 'GROUND FLAX'],
    packages: [{ label: 'bag_16oz', netG: 16 * OZ_G }],
  }),
  simpleVolume('molasses', 'Molasses', 'pantry-staples', 1.4, {
    uncertaintyPct: 8,
    aliases: ['MOLASSES', 'BLACKSTRAP MOLASSES'],
    packages: [{ label: 'bottle_12oz', netG: 12 * OZ_G }],
  }),
  simpleVolume('corn-syrup', 'Corn syrup', 'pantry-staples', 1.38, {
    uncertaintyPct: 8,
    aliases: ['CORN SYRUP', 'LIGHT CORN SYRUP', 'KARO'],
    packages: [{ label: 'bottle_16oz', netG: 16 * OZ_G }],
  }),
  simpleMass('marshmallow-fluff', 'Marshmallow creme', 'pantry-staples', {
    densityGPerMl: 0.4,
    uncertaintyPct: 20,
    // Egg white in some formulas
    allergens: ['egg'],
    aliases: ['MARSHMALLOW FLUFF', 'MARSHMALLOW CREME'],
    packages: [{ label: 'jar_7_5oz', netG: 7.5 * OZ_G }],
  }),
  simpleMass('evaporated-milk', 'Evaporated milk', 'pantry-staples', {
    densityGPerMl: 1.07,
    uncertaintyPct: 5,
    allergens: ['milk'],
    aliases: ['EVAPORATED MILK', 'EVAP MILK'],
    packages: [{ label: 'can_12oz', netG: 12 * OZ_G }],
  }),
  simpleMass('condensed-milk', 'Sweetened condensed milk', 'pantry-staples', {
    densityGPerMl: 1.3,
    uncertaintyPct: 8,
    allergens: ['milk'],
    aliases: ['CONDENSED MILK', 'SWEETENED CONDENSED MILK'],
    packages: [{ label: 'can_14oz', netG: 14 * OZ_G }],
  }),
  simpleMass('coconut-flakes', 'Coconut flakes', 'pantry-staples', {
    densityGPerMl: 0.3,
    uncertaintyPct: 20,
    allergens: ['tree_nut'],
    aliases: ['COCONUT FLAKES', 'SHREDDED COCONUT', 'SWEETENED COCONUT'],
    packages: [{ label: 'bag_14oz', netG: 14 * OZ_G }],
  }),
);
