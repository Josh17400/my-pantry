/**
 * Baby / household-adjacent edibles that appear on grocery receipts
 * and pantries (not cleaners).
 */

import { mergeBundles, simpleCount,simpleMass, simpleVolume } from '../helpers';
import { OZ_G } from '../sources';
import type { SeedCategoryBundle } from '../types';

export const babyHousehold: SeedCategoryBundle = mergeBundles(
  simpleMass('baby-formula', 'Baby formula', 'baby-household', {
    densityGPerMl: 0.5,
    uncertaintyPct: 15,
    allergens: ['milk', 'soy'],
    aliases: ['FORMULA', 'BABY FORMULA', 'INFANT FORMULA'],
    packages: [
      { label: 'can_12_4oz', netG: 12.4 * OZ_G },
      { label: 'can_23_2oz', netG: 23.2 * OZ_G },
    ],
  }),
  simpleMass('baby-food-jar', 'Baby food (jar)', 'baby-household', {
    densityGPerMl: 1.05,
    uncertaintyPct: 15,
    aliases: ['BABY FOOD', 'BABY FOOD JAR'],
    packages: [{ label: 'jar_4oz', netG: 4 * OZ_G }],
  }),
  simpleMass('baby-cereal', 'Baby cereal', 'baby-household', {
    densityGPerMl: 0.4,
    uncertaintyPct: 20,
    // Rice cereal typically none; oat may have wheat — leave empty
    aliases: ['BABY CEREAL', 'INFANT CEREAL', 'RICE CEREAL'],
    packages: [{ label: 'box_8oz', netG: 8 * OZ_G }],
  }),
  simpleCount('baby-pouch', 'Baby food pouch', 'baby-household', 100, {
    uncertaintyPct: 15,
    formName: 'pouch',
    aliases: ['BABY POUCH', 'FOOD POUCH'],
    packages: [{ label: 'pouch_each', netG: 100 }],
  }),
  simpleMass('applesauce-pouch', 'Applesauce pouch', 'baby-household', {
    densityGPerMl: 1.05,
    uncertaintyPct: 10,
    aliases: ['APPLESAUCE POUCH'],
    packages: [{ label: 'pouch_3_2oz', netG: 3.2 * OZ_G }],
  }),
  simpleVolume('pedialyte', 'Electrolyte solution', 'baby-household', 1.02, {
    uncertaintyPct: 5,
    aliases: ['PEDIALYTE', 'ELECTROLYTE SOLUTION'],
    packages: [{ label: 'bottle_33_8oz', netG: 33.8 * 29.5735295625 * 1.02 }],
  }),
  simpleMass('gelatin-snack', 'Gelatin cups', 'baby-household', {
    densityGPerMl: 1.0,
    uncertaintyPct: 15,
    aliases: ['JELL-O CUPS', 'GELATIN CUPS', 'JELLO CUPS'],
    packages: [{ label: 'pack_4ct', netG: 13 * OZ_G }],
  }),
  simpleMass('pudding-cup', 'Pudding cups', 'baby-household', {
    densityGPerMl: 1.1,
    uncertaintyPct: 12,
    allergens: ['milk'],
    aliases: ['PUDDING', 'PUDDING CUPS'],
    packages: [{ label: 'pack_4ct', netG: 14 * OZ_G }],
  }),
  simpleMass('granola-bar', 'Granola bars', 'baby-household', {
    uncertaintyPct: 15,
    allergens: ['wheat', 'soy', 'tree_nut'],
    aliases: ['GRANOLA BARS', 'CEREAL BARS', 'NATURE VALLEY'],
    packages: [{ label: 'box_6ct', netG: 7.4 * OZ_G }],
  }),
  simpleMass('fruit-snacks', 'Fruit snacks', 'baby-household', {
    uncertaintyPct: 15,
    aliases: ['FRUIT SNACKS', 'GUMMY FRUIT'],
    packages: [{ label: 'box_10ct', netG: 8 * OZ_G }],
  }),
  simpleMass('applesauce-cups', 'Applesauce cups', 'baby-household', {
    densityGPerMl: 1.05,
    uncertaintyPct: 10,
    aliases: ['APPLESAUCE CUPS'],
    packages: [{ label: 'pack_6ct', netG: 24 * OZ_G }],
  }),
  simpleMass('nutritional-shake', 'Nutritional shake', 'baby-household', {
    densityGPerMl: 1.05,
    uncertaintyPct: 10,
    allergens: ['milk', 'soy'],
    aliases: ['ENSURE', 'BOOST', 'NUTRITIONAL SHAKE'],
    packages: [{ label: 'pack_6ct', netG: 6 * 8 * OZ_G }],
  }),
);
