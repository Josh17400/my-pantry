/**
 * Canned & jarred goods — package nets in grams; drainedG where relevant.
 * 14.5 oz diced tomatoes is a par-level seed exemplar.
 */

import type { SeedCategoryBundle } from '../types';
import { mergeBundles, simpleMass } from '../helpers';
import { OZ_G } from '../sources';

const CAN_14_5 = 14.5 * OZ_G;
const CAN_15 = 15 * OZ_G;
const CAN_28 = 28 * OZ_G;

export const canned: SeedCategoryBundle = mergeBundles(
  simpleMass('tomato-diced', 'Diced tomatoes (canned)', 'canned', {
    isStaple: true,
    aliases: ['DICED TOMATOES', 'CANNED DICED TOMATOES', 'TOMATOES DICED'],
    packages: [
      {
        label: 'can_14_5oz',
        netG: CAN_14_5,
        drainedG: 10 * OZ_G, // typical drained solids — retail_label / high variance
      },
      { label: 'can_28oz', netG: CAN_28, drainedG: 20 * OZ_G },
    ],
  }),
  simpleMass('tomato-crushed', 'Crushed tomatoes', 'canned', {
    isStaple: true,
    aliases: ['CRUSHED TOMATOES'],
    packages: [
      { label: 'can_14_5oz', netG: CAN_14_5 },
      { label: 'can_28oz', netG: CAN_28 },
    ],
  }),
  simpleMass('tomato-sauce', 'Tomato sauce', 'canned', {
    densityGPerMl: 1.04,
    uncertaintyPct: 10,
    isStaple: true,
    aliases: ['TOMATO SAUCE', 'CANNED TOMATO SAUCE'],
    packages: [
      { label: 'can_8oz', netG: 8 * OZ_G },
      { label: 'can_15oz', netG: CAN_15 },
      { label: 'can_29oz', netG: 29 * OZ_G },
    ],
  }),
  simpleMass('tomato-paste', 'Tomato paste', 'canned', {
    densityGPerMl: 1.1,
    uncertaintyPct: 10,
    isStaple: true,
    aliases: ['TOMATO PASTE'],
    packages: [
      { label: 'can_6oz', netG: 6 * OZ_G },
      { label: 'tube_4_5oz', netG: 4.5 * OZ_G },
    ],
  }),
  simpleMass('tomato-whole-peeled', 'Whole peeled tomatoes', 'canned', {
    aliases: ['WHOLE PEELED TOMATOES', 'WHOLE TOMATOES CANNED', 'SAN MARZANO'],
    packages: [
      { label: 'can_14_5oz', netG: CAN_14_5, drainedG: 9 * OZ_G },
      { label: 'can_28oz', netG: CAN_28, drainedG: 18 * OZ_G },
    ],
  }),
  simpleMass('beans-black', 'Black beans (canned)', 'canned', {
    isStaple: true,
    aliases: ['BLACK BEANS', 'CANNED BLACK BEANS'],
    packages: [
      { label: 'can_15oz', netG: CAN_15, drainedG: 9.5 * OZ_G },
    ],
  }),
  simpleMass('beans-pinto', 'Pinto beans (canned)', 'canned', {
    aliases: ['PINTO BEANS', 'CANNED PINTO BEANS'],
    packages: [{ label: 'can_15oz', netG: CAN_15, drainedG: 9.5 * OZ_G }],
  }),
  simpleMass('beans-kidney', 'Kidney beans (canned)', 'canned', {
    aliases: ['KIDNEY BEANS', 'RED KIDNEY BEANS'],
    packages: [{ label: 'can_15oz', netG: CAN_15, drainedG: 9.5 * OZ_G }],
  }),
  simpleMass('beans-cannellini', 'Cannellini beans (canned)', 'canned', {
    aliases: ['CANNELLINI', 'WHITE BEANS', 'CANNELLINI BEANS'],
    packages: [{ label: 'can_15oz', netG: CAN_15, drainedG: 9.5 * OZ_G }],
  }),
  simpleMass('beans-garbanzo', 'Chickpeas / garbanzo (canned)', 'canned', {
    isStaple: true,
    aliases: ['CHICKPEAS', 'GARBANZO', 'GARBANZO BEANS', 'CHICK PEAS'],
    packages: [{ label: 'can_15oz', netG: CAN_15, drainedG: 9.5 * OZ_G }],
  }),
  simpleMass('beans-refried', 'Refried beans', 'canned', {
    aliases: ['REFRIED BEANS'],
    packages: [{ label: 'can_16oz', netG: 16 * OZ_G }],
  }),
  simpleMass('corn-canned', 'Canned corn', 'canned', {
    isStaple: true,
    aliases: ['CANNED CORN', 'CORN CAN', 'SWEET CORN CANNED'],
    packages: [
      { label: 'can_15oz', netG: CAN_15, drainedG: 10 * OZ_G },
    ],
  }),
  simpleMass('green-beans-canned', 'Canned green beans', 'canned', {
    aliases: ['CANNED GREEN BEANS'],
    packages: [{ label: 'can_14_5oz', netG: CAN_14_5, drainedG: 8 * OZ_G }],
  }),
  simpleMass('peas-canned', 'Canned peas', 'canned', {
    aliases: ['CANNED PEAS', 'GREEN PEAS CANNED'],
    packages: [{ label: 'can_15oz', netG: CAN_15, drainedG: 9 * OZ_G }],
  }),
  simpleMass('soup-chicken-noodle', 'Chicken noodle soup (canned)', 'canned', {
    allergens: ['wheat', 'egg'],
    aliases: ['CHICKEN NOODLE SOUP', 'CAMPBELLS CHICKEN NOODLE'],
    packages: [{ label: 'can_10_5oz', netG: 10.5 * OZ_G }],
  }),
  simpleMass('soup-tomato', 'Tomato soup (canned)', 'canned', {
    allergens: ['milk', 'wheat'], // condensed often has wheat; cream varieties milk
    aliases: ['TOMATO SOUP'],
    packages: [{ label: 'can_10_75oz', netG: 10.75 * OZ_G }],
  }),
  simpleMass('broth-chicken', 'Chicken broth', 'canned', {
    densityGPerMl: 1.01,
    uncertaintyPct: 5,
    isStaple: true,
    aliases: ['CHICKEN BROTH', 'CHICKEN STOCK', 'CHKN BROTH'],
    packages: [
      { label: 'carton_32oz', netG: 32 * OZ_G },
      { label: 'can_14_5oz', netG: CAN_14_5 },
    ],
  }),
  simpleMass('broth-beef', 'Beef broth', 'canned', {
    densityGPerMl: 1.01,
    uncertaintyPct: 5,
    aliases: ['BEEF BROTH', 'BEEF STOCK'],
    packages: [{ label: 'carton_32oz', netG: 32 * OZ_G }],
  }),
  simpleMass('broth-vegetable', 'Vegetable broth', 'canned', {
    densityGPerMl: 1.01,
    uncertaintyPct: 5,
    aliases: ['VEGETABLE BROTH', 'VEG BROTH', 'VEGETABLE STOCK'],
    packages: [{ label: 'carton_32oz', netG: 32 * OZ_G }],
  }),
  simpleMass('coconut-milk-canned', 'Coconut milk (canned)', 'canned', {
    densityGPerMl: 0.97,
    uncertaintyPct: 10,
    allergens: ['tree_nut'], // FDA treats coconut as tree nut
    aliases: ['COCONUT MILK', 'CANNED COCONUT MILK'],
    packages: [{ label: 'can_13_5oz', netG: 13.5 * OZ_G }],
  }),
  simpleMass('pumpkin-puree', 'Pumpkin puree', 'canned', {
    densityGPerMl: 1.05,
    uncertaintyPct: 10,
    aliases: ['PUMPKIN PUREE', 'CANNED PUMPKIN', 'PUMPKIN'],
    packages: [{ label: 'can_15oz', netG: CAN_15 }],
  }),
  simpleMass('applesauce', 'Applesauce', 'canned', {
    densityGPerMl: 1.05,
    uncertaintyPct: 8,
    aliases: ['APPLESAUCE', 'APPLE SAUCE'],
    packages: [{ label: 'jar_24oz', netG: 24 * OZ_G }],
  }),
  simpleMass('olives-black', 'Black olives', 'canned', {
    aliases: ['BLACK OLIVES', 'CANNED OLIVES', 'SLICED BLACK OLIVES'],
    packages: [{ label: 'can_6oz', netG: 6 * OZ_G, drainedG: 3.8 * OZ_G }],
  }),
  simpleMass('olives-green', 'Green olives', 'canned', {
    aliases: ['GREEN OLIVES'],
    packages: [{ label: 'jar_5_75oz', netG: 5.75 * OZ_G }],
  }),
  simpleMass('roasted-red-peppers', 'Roasted red peppers (jarred)', 'canned', {
    aliases: ['ROASTED RED PEPPERS', 'JARRED RED PEPPERS'],
    packages: [{ label: 'jar_12oz', netG: 12 * OZ_G }],
  }),
  simpleMass('artichoke-hearts', 'Artichoke hearts', 'canned', {
    aliases: ['ARTICHOKE HEARTS', 'ARTICHOKES'],
    packages: [{ label: 'can_14oz', netG: 14 * OZ_G, drainedG: 8 * OZ_G }],
  }),
  simpleMass('salsa', 'Salsa', 'canned', {
    densityGPerMl: 1.05,
    uncertaintyPct: 12,
    isStaple: true,
    aliases: ['SALSA', 'PICANTE', 'CHUNKY SALSA'],
    packages: [
      { label: 'jar_16oz', netG: 16 * OZ_G },
      { label: 'jar_24oz', netG: 24 * OZ_G },
    ],
  }),
  simpleMass('pasta-sauce', 'Pasta sauce', 'canned', {
    densityGPerMl: 1.05,
    uncertaintyPct: 10,
    isStaple: true,
    aliases: ['PASTA SAUCE', 'MARINARA', 'SPAGHETTI SAUCE', 'JARRED SAUCE'],
    packages: [
      { label: 'jar_24oz', netG: 24 * OZ_G },
      { label: 'jar_45oz', netG: 45 * OZ_G },
    ],
  }),
  simpleMass('alfredo-sauce', 'Alfredo sauce', 'canned', {
    densityGPerMl: 1.05,
    uncertaintyPct: 12,
    allergens: ['milk'],
    aliases: ['ALFREDO', 'ALFREDO SAUCE'],
    packages: [{ label: 'jar_15oz', netG: 15 * OZ_G }],
  }),
);
