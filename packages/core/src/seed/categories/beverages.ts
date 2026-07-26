/**
 * Beverages — coffee, tea, juice, soda, water.
 */

import { mergeBundles, simpleMass, simpleVolume } from '../helpers';
import { GALLON_ML, OZ_G } from '../sources';
import type { SeedCategoryBundle } from '../types';

export const beverages: SeedCategoryBundle = mergeBundles(
  simpleMass('coffee-grounds', 'Coffee (ground)', 'beverages', {
    densityGPerMl: 0.4,
    uncertaintyPct: 20,
    isStaple: true,
    aliases: ['COFFEE', 'GROUND COFFEE', 'COFFEE GROUNDS'],
    packages: [
      { label: 'can_11_3oz', netG: 11.3 * OZ_G },
      { label: 'bag_12oz', netG: 12 * OZ_G },
    ],
  }),
  simpleMass('coffee-beans', 'Coffee beans', 'beverages', {
    densityGPerMl: 0.4,
    uncertaintyPct: 20,
    aliases: ['COFFEE BEANS', 'WHOLE BEAN COFFEE'],
    packages: [{ label: 'bag_12oz', netG: 12 * OZ_G }],
  }),
  simpleMass('coffee-pods', 'Coffee pods', 'beverages', {
    // each pod ~9–12 g; stock as mass of box
    uncertaintyPct: 15,
    aliases: ['KEURIG', 'K-CUPS', 'COFFEE PODS', 'KCUPS'],
    packages: [{ label: 'box_12ct', netG: 12 * 10 }],
  }),
  simpleMass('tea-bags', 'Tea bags', 'beverages', {
    uncertaintyPct: 15,
    isStaple: true,
    aliases: ['TEA', 'TEA BAGS', 'BLACK TEA'],
    packages: [{ label: 'box_20ct', netG: 40 }],
  }),
  simpleMass('tea-green', 'Green tea', 'beverages', {
    uncertaintyPct: 15,
    aliases: ['GREEN TEA'],
    packages: [{ label: 'box_20ct', netG: 40 }],
  }),
  simpleVolume('orange-juice', 'Orange juice', 'beverages', 1.04, {
    uncertaintyPct: 5,
    isStaple: true,
    aliases: ['OJ', 'ORANGE JUICE', 'ORANGE JCE'],
    packages: [
      { label: 'carton_52oz', netG: 52 * 29.5735295625 * 1.04 },
      { label: 'half_gallon', netG: (GALLON_ML / 2) * 1.04 },
    ],
  }),
  simpleVolume('apple-juice', 'Apple juice', 'beverages', 1.04, {
    uncertaintyPct: 5,
    aliases: ['APPLE JUICE', 'APPLE JCE'],
    packages: [{ label: 'bottle_64oz', netG: 64 * 29.5735295625 * 1.04 }],
  }),
  simpleVolume('cranberry-juice', 'Cranberry juice', 'beverages', 1.05, {
    uncertaintyPct: 8,
    aliases: ['CRANBERRY JUICE', 'CRANBERRY JCE'],
    packages: [{ label: 'bottle_64oz', netG: 64 * 29.5735295625 * 1.05 }],
  }),
  simpleVolume('soda-cola', 'Cola soda', 'beverages', 1.04, {
    uncertaintyPct: 5,
    aliases: ['COLA', 'COKE', 'PEPSI', 'SODA', 'POP'],
    packages: [
      { label: 'can_12oz', netG: 12 * 29.5735295625 * 1.04 },
      { label: 'bottle_2l', netG: 2000 * 1.04 },
      { label: '12pk_cans', netG: 12 * 12 * 29.5735295625 * 1.04 },
    ],
  }),
  simpleVolume('soda-lemon-lime', 'Lemon-lime soda', 'beverages', 1.03, {
    uncertaintyPct: 5,
    aliases: ['SPRITE', 'SIERRA MIST', 'LEMON LIME SODA', '7UP'],
    packages: [{ label: 'bottle_2l', netG: 2000 * 1.03 }],
  }),
  simpleVolume('sparkling-water', 'Sparkling water', 'beverages', 1.0, {
    uncertaintyPct: 2,
    aliases: ['SPARKLING WATER', 'SELTZER', 'LA CROIX', 'CLUB SODA'],
    packages: [{ label: '12pk_cans', netG: 12 * 12 * 29.5735295625 }],
  }),
  simpleVolume('water-bottled', 'Bottled water', 'beverages', 1.0, {
    uncertaintyPct: 1,
    aliases: ['WATER', 'BOTTLED WATER', 'SPRING WATER'],
    packages: [
      { label: 'bottle_16_9oz', netG: 16.9 * 29.5735295625 },
      { label: 'case_24', netG: 24 * 16.9 * 29.5735295625 },
    ],
  }),
  simpleMass('drink-mix-powder', 'Drink mix powder', 'beverages', {
    densityGPerMl: 0.7,
    uncertaintyPct: 20,
    aliases: ['KOOL AID', 'CRYSTAL LIGHT', 'DRINK MIX'],
    packages: [{ label: 'canister_19oz', netG: 19 * OZ_G }],
  }),
  simpleVolume('sports-drink', 'Sports drink', 'beverages', 1.03, {
    uncertaintyPct: 5,
    aliases: ['GATORADE', 'POWERADE', 'SPORTS DRINK'],
    packages: [{ label: 'bottle_28oz', netG: 28 * 29.5735295625 * 1.03 }],
  }),
  simpleMass('protein-powder', 'Protein powder', 'beverages', {
    densityGPerMl: 0.5,
    uncertaintyPct: 20,
    allergens: ['milk', 'soy'],
    aliases: ['PROTEIN POWDER', 'WHEY PROTEIN', 'PROTEIN'],
    packages: [{ label: 'tub_2lb', netG: 2 * 453.59237 }],
  }),
);
