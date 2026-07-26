/**
 * Condiments & sauces — allergen-critical: soy sauce (wheat+soy),
 * Worcestershire (fish/anchovy), mayo (egg), etc.
 */

import type { SeedCategoryBundle } from '../types';
import { mergeBundles, simpleMass, simpleVolume } from '../helpers';
import { OZ_G } from '../sources';

export const condiments: SeedCategoryBundle = mergeBundles(
  simpleVolume('ketchup', 'Ketchup', 'condiments', 1.15, {
    uncertaintyPct: 8,
    isStaple: true,
    aliases: ['KETCHUP', 'CATSUP', 'TOMATO KETCHUP'],
    packages: [
      { label: 'bottle_20oz', netG: 20 * 29.5735295625 * 1.15 },
      { label: 'bottle_38oz', netG: 38 * 29.5735295625 * 1.15 },
    ],
  }),
  simpleVolume('mustard-yellow', 'Yellow mustard', 'condiments', 1.05, {
    uncertaintyPct: 8,
    isStaple: true,
    aliases: ['MUSTARD', 'YELLOW MUSTARD', 'AMERICAN MUSTARD'],
    packages: [{ label: 'bottle_14oz', netG: 14 * 29.5735295625 * 1.05 }],
  }),
  simpleVolume('mustard-dijon', 'Dijon mustard', 'condiments', 1.1, {
    uncertaintyPct: 10,
    aliases: ['DIJON', 'DIJON MUSTARD'],
    packages: [{ label: 'jar_12oz', netG: 12 * OZ_G }],
  }),
  simpleVolume('mayo', 'Mayonnaise', 'condiments', 0.91, {
    uncertaintyPct: 8,
    isStaple: true,
    allergens: ['egg'],
    // Many mayos also soy oil — soy oil highly refined often exempt; tag egg only.
    aliases: ['MAYO', 'MAYONNAISE', 'HELLMANS', 'HELLMANN'],
    packages: [
      { label: 'jar_30oz', netG: 30 * OZ_G },
      { label: 'jar_48oz', netG: 48 * OZ_G },
    ],
  }),
  simpleVolume('soy-sauce', 'Soy sauce', 'condiments', 1.12, {
    uncertaintyPct: 8,
    isStaple: true,
    // Wheat → gluten auto-derived in ingredient(); explicit for clarity.
    allergens: ['wheat', 'soy'],
    aliases: ['SOY SAUCE', 'SOY', 'SHOYU', 'LIGHT SOY SAUCE'],
    packages: [
      { label: 'bottle_10oz', netG: 10 * 29.5735295625 * 1.12 },
      { label: 'bottle_15oz', netG: 15 * 29.5735295625 * 1.12 },
    ],
  }),
  simpleVolume('soy-sauce-tamari', 'Tamari', 'condiments', 1.12, {
    uncertaintyPct: 8,
    allergens: ['soy'],
    // Traditional tamari is wheat-free / often GF; some brands add wheat.
    // Do not tag gluten by default — over-tagging GF-labeled tamari is annoying;
    // under-tagging is worse only when wheat is present (those brands should match soy-sauce).
    aliases: ['TAMARI', 'GLUTEN FREE SOY SAUCE'],
    packages: [{ label: 'bottle_10oz', netG: 10 * 29.5735295625 * 1.12 }],
  }),
  simpleVolume('worcestershire', 'Worcestershire sauce', 'condiments', 1.15, {
    uncertaintyPct: 10,
    // Anchovy is standard in Lea & Perrins / most US brands
    allergens: ['fish'],
    aliases: ['WORCESTERSHIRE', 'WORCESTERSHIRE SAUCE', 'WORCESTER'],
    packages: [{ label: 'bottle_10oz', netG: 10 * 29.5735295625 * 1.15 }],
  }),
  simpleVolume('hot-sauce', 'Hot sauce', 'condiments', 1.05, {
    uncertaintyPct: 10,
    isStaple: true,
    aliases: ['HOT SAUCE', 'TABASCO', 'FRANKS RED HOT'],
    packages: [{ label: 'bottle_5oz', netG: 5 * 29.5735295625 * 1.05 }],
  }),
  simpleVolume('sriracha', 'Sriracha', 'condiments', 1.1, {
    uncertaintyPct: 10,
    aliases: ['SRIRACHA SAUCE', 'ROOSTER SAUCE'],
    packages: [{ label: 'bottle_17oz', netG: 17 * OZ_G }],
  }),
  simpleVolume('bbq-sauce', 'BBQ sauce', 'condiments', 1.15, {
    uncertaintyPct: 10,
    aliases: ['BBQ SAUCE', 'BARBECUE SAUCE', 'BAR-B-Q SAUCE'],
    packages: [{ label: 'bottle_18oz', netG: 18 * OZ_G }],
  }),
  simpleVolume('teriyaki', 'Teriyaki sauce', 'condiments', 1.15, {
    uncertaintyPct: 10,
    allergens: ['wheat', 'soy'],
    aliases: ['TERIYAKI', 'TERIYAKI SAUCE'],
    packages: [{ label: 'bottle_10oz', netG: 10 * 29.5735295625 * 1.15 }],
  }),
  simpleVolume('fish-sauce', 'Fish sauce', 'condiments', 1.18, {
    uncertaintyPct: 10,
    allergens: ['fish'],
    aliases: ['FISH SAUCE', 'NAM PLA'],
    packages: [{ label: 'bottle_6_76oz', netG: 6.76 * 29.5735295625 * 1.18 }],
  }),
  simpleVolume('hoisin', 'Hoisin sauce', 'condiments', 1.2, {
    uncertaintyPct: 12,
    allergens: ['wheat', 'soy', 'sesame'],
    aliases: ['HOISIN', 'HOISIN SAUCE'],
    packages: [{ label: 'jar_8_5oz', netG: 8.5 * OZ_G }],
  }),
  simpleVolume('oyster-sauce', 'Oyster sauce', 'condiments', 1.2, {
    uncertaintyPct: 12,
    allergens: ['shellfish', 'wheat', 'soy'],
    dietaryFlags: ['shellfish-derived'], // also shellfish allergen; flag for non-allergic shellfish avoiders
    aliases: ['OYSTER SAUCE'],
    packages: [{ label: 'bottle_9oz', netG: 9 * OZ_G }],
  }),
  simpleVolume('vinegar-rice', 'Rice vinegar', 'condiments', 1.01, {
    uncertaintyPct: 5,
    aliases: ['RICE VINEGAR', 'RICE WINE VINEGAR'],
    packages: [{ label: 'bottle_12oz', netG: 12 * 29.5735295625 * 1.01 }],
  }),
  simpleMass('peanut-butter', 'Peanut butter', 'condiments', {
    densityGPerMl: 1.09,
    uncertaintyPct: 10,
    isStaple: true,
    allergens: ['peanut'],
    aliases: ['PEANUT BUTTER', 'PB', 'CREAMY PEANUT BUTTER', 'JIF', 'SKIPPY'],
    packages: [
      { label: 'jar_16oz', netG: 16 * OZ_G },
      { label: 'jar_40oz', netG: 40 * OZ_G },
    ],
  }),
  simpleMass('almond-butter', 'Almond butter', 'condiments', {
    densityGPerMl: 1.05,
    uncertaintyPct: 12,
    allergens: ['tree_nut'],
    aliases: ['ALMOND BUTTER'],
    packages: [{ label: 'jar_16oz', netG: 16 * OZ_G }],
  }),
  simpleMass('jam-strawberry', 'Strawberry jam', 'condiments', {
    densityGPerMl: 1.3,
    uncertaintyPct: 10,
    aliases: ['STRAWBERRY JAM', 'STRAWBERRY PRESERVES', 'JAM'],
    packages: [{ label: 'jar_18oz', netG: 18 * OZ_G }],
  }),
  simpleMass('jelly-grape', 'Grape jelly', 'condiments', {
    densityGPerMl: 1.3,
    uncertaintyPct: 10,
    aliases: ['GRAPE JELLY', 'JELLY'],
    packages: [{ label: 'jar_18oz', netG: 18 * OZ_G }],
  }),
  simpleMass('honey', 'Honey', 'condiments', {
    densityGPerMl: 1.42,
    uncertaintyPct: 5,
    isStaple: true,
    aliases: ['HONEY', 'CLOVER HONEY'],
    packages: [
      { label: 'bottle_12oz', netG: 12 * OZ_G },
      { label: 'bottle_32oz', netG: 32 * OZ_G },
    ],
  }),
  simpleMass('maple-syrup', 'Maple syrup', 'condiments', {
    densityGPerMl: 1.32,
    uncertaintyPct: 8,
    aliases: ['MAPLE SYRUP', 'PURE MAPLE SYRUP'],
    packages: [{ label: 'bottle_12oz', netG: 12 * OZ_G }],
  }),
  simpleMass('pancake-syrup', 'Pancake syrup', 'condiments', {
    densityGPerMl: 1.32,
    uncertaintyPct: 10,
    aliases: ['PANCAKE SYRUP', 'AUNT JEMIMA', 'MRS BUTTERWORTH'],
    packages: [{ label: 'bottle_24oz', netG: 24 * OZ_G }],
  }),
  simpleVolume('ranch-dressing', 'Ranch dressing', 'condiments', 0.98, {
    uncertaintyPct: 12,
    allergens: ['milk', 'egg'],
    aliases: ['RANCH', 'RANCH DRESSING'],
    packages: [{ label: 'bottle_16oz', netG: 16 * OZ_G }],
  }),
  simpleVolume('italian-dressing', 'Italian dressing', 'condiments', 0.95, {
    uncertaintyPct: 12,
    aliases: ['ITALIAN DRESSING'],
    packages: [{ label: 'bottle_16oz', netG: 16 * OZ_G }],
  }),
  simpleVolume('caesar-dressing', 'Caesar dressing', 'condiments', 0.98, {
    uncertaintyPct: 12,
    allergens: ['fish', 'egg', 'milk'],
    aliases: ['CAESAR', 'CAESAR DRESSING'],
    packages: [{ label: 'bottle_16oz', netG: 16 * OZ_G }],
  }),
  simpleMass('relish', 'Sweet relish', 'condiments', {
    densityGPerMl: 1.1,
    uncertaintyPct: 15,
    aliases: ['RELISH', 'SWEET RELISH', 'PICKLE RELISH'],
    packages: [{ label: 'jar_10oz', netG: 10 * OZ_G }],
  }),
  simpleMass('pickles', 'Pickles', 'condiments', {
    aliases: ['PICKLES', 'DILL PICKLES', 'KOSHER DILLS'],
    packages: [{ label: 'jar_24oz', netG: 24 * OZ_G }],
  }),
  simpleMass('pickle-chips', 'Pickle chips', 'condiments', {
    aliases: ['PICKLE CHIPS', 'DILL CHIPS', 'HAMBURGER PICKLES'],
    packages: [{ label: 'jar_16oz', netG: 16 * OZ_G }],
  }),
  simpleVolume('tahini', 'Tahini', 'condiments', 1.1, {
    uncertaintyPct: 12,
    allergens: ['sesame'],
    aliases: ['TAHINI', 'SESAME PASTE'],
    packages: [{ label: 'jar_16oz', netG: 16 * OZ_G }],
  }),
  simpleMass('hummus', 'Hummus', 'condiments', {
    densityGPerMl: 1.05,
    uncertaintyPct: 12,
    allergens: ['sesame'],
    aliases: ['HUMMUS'],
    packages: [{ label: 'tub_10oz', netG: 10 * OZ_G }],
  }),
  simpleVolume('gochujang', 'Gochujang', 'condiments', 1.2, {
    uncertaintyPct: 15,
    allergens: ['wheat', 'soy'],
    aliases: ['GOCHUJANG', 'KOREAN CHILI PASTE'],
    packages: [{ label: 'tub_17_6oz', netG: 17.6 * OZ_G }],
  }),
  simpleVolume('miso', 'Miso paste', 'condiments', 1.15, {
    uncertaintyPct: 12,
    allergens: ['soy'],
    aliases: ['MISO', 'MISO PASTE', 'WHITE MISO', 'RED MISO'],
    packages: [{ label: 'tub_16oz', netG: 16 * OZ_G }],
  }),
);
