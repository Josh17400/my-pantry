/**
 * Frozen foods — common weekly US purchases.
 */

import { mergeBundles, simpleMass } from '../helpers';
import { LB_G, OZ_G } from '../sources';
import type { SeedCategoryBundle } from '../types';

export const frozen: SeedCategoryBundle = mergeBundles(
  simpleMass('frozen-peas', 'Frozen peas', 'frozen', {
    isStaple: true,
    aliases: ['FROZEN PEAS', 'PEAS FROZEN'],
    packages: [
      { label: 'bag_12oz', netG: 12 * OZ_G },
      { label: 'bag_16oz', netG: 16 * OZ_G },
    ],
  }),
  simpleMass('frozen-corn', 'Frozen corn', 'frozen', {
    isStaple: true,
    aliases: ['FROZEN CORN', 'CORN FROZEN'],
    packages: [{ label: 'bag_12oz', netG: 12 * OZ_G }],
  }),
  simpleMass('frozen-broccoli', 'Frozen broccoli', 'frozen', {
    aliases: ['FROZEN BROCCOLI', 'BROCCOLI FROZEN'],
    packages: [{ label: 'bag_12oz', netG: 12 * OZ_G }],
  }),
  simpleMass('frozen-spinach', 'Frozen spinach', 'frozen', {
    aliases: ['FROZEN SPINACH', 'SPINACH FROZEN'],
    packages: [{ label: 'box_10oz', netG: 10 * OZ_G }],
  }),
  simpleMass('frozen-mixed-veg', 'Frozen mixed vegetables', 'frozen', {
    aliases: ['MIXED VEGETABLES', 'FROZEN MIXED VEG', 'MIXED VEG'],
    packages: [{ label: 'bag_12oz', netG: 12 * OZ_G }],
  }),
  simpleMass('frozen-berries', 'Frozen mixed berries', 'frozen', {
    aliases: ['FROZEN BERRIES', 'MIXED BERRIES FROZEN'],
    packages: [{ label: 'bag_12oz', netG: 12 * OZ_G }],
  }),
  simpleMass('frozen-blueberries', 'Frozen blueberries', 'frozen', {
    aliases: ['FROZEN BLUEBERRIES'],
    packages: [{ label: 'bag_12oz', netG: 12 * OZ_G }],
  }),
  simpleMass('frozen-pizza', 'Frozen pizza', 'frozen', {
    allergens: ['wheat', 'milk', 'soy'],
    aliases: ['FROZEN PIZZA', 'PIZZA FROZEN'],
    packages: [{ label: 'pizza_each', netG: 20 * OZ_G }],
  }),
  simpleMass('ice-cream', 'Ice cream', 'frozen', {
    densityGPerMl: 0.55,
    uncertaintyPct: 25,
    allergens: ['milk'],
    // Many flavors tree_nut/egg/soy — base vanilla often milk+soy
    aliases: ['ICE CREAM', 'ICECREAM'],
    packages: [
      { label: 'pint', netG: 14 * OZ_G },
      { label: 'half_gallon', netG: 48 * OZ_G },
    ],
  }),
  simpleMass('frozen-fries', 'Frozen french fries', 'frozen', {
    allergens: ['soy'],
    aliases: ['FRENCH FRIES', 'FROZEN FRIES', 'FRIES'],
    packages: [{ label: 'bag_32oz', netG: 32 * OZ_G }],
  }),
  simpleMass('frozen-chicken-nuggets', 'Frozen chicken nuggets', 'frozen', {
    allergens: ['wheat'],
    aliases: ['CHICKEN NUGGETS', 'NUGGETS', 'FROZEN NUGGETS'],
    packages: [{ label: 'bag_2lb', netG: 2 * LB_G }],
  }),
  simpleMass('frozen-fish-sticks', 'Frozen fish sticks', 'frozen', {
    allergens: ['fish', 'wheat'],
    aliases: ['FISH STICKS', 'FISHSTICKS'],
    packages: [{ label: 'box_24oz', netG: 24 * OZ_G }],
  }),
  simpleMass('frozen-waffles', 'Frozen waffles', 'frozen', {
    allergens: ['wheat', 'egg', 'milk', 'soy'],
    aliases: ['WAFFLES', 'FROZEN WAFFLES', 'EGGO'],
    packages: [{ label: 'box_12_3oz', netG: 12.3 * OZ_G }],
  }),
  simpleMass('frozen-shrimp', 'Frozen shrimp', 'frozen', {
    allergens: ['shellfish'],
    aliases: ['FROZEN SHRIMP'],
    packages: [{ label: 'bag_1lb', netG: LB_G }],
  }),
  simpleMass('edamame-frozen', 'Frozen edamame', 'frozen', {
    allergens: ['soy'],
    aliases: ['EDAMAME', 'FROZEN EDAMAME'],
    packages: [{ label: 'bag_12oz', netG: 12 * OZ_G }],
  }),
  simpleMass('hash-browns', 'Hash browns', 'frozen', {
    aliases: ['HASH BROWNS', 'HASHBROWNS'],
    packages: [{ label: 'bag_30oz', netG: 30 * OZ_G }],
  }),
);
