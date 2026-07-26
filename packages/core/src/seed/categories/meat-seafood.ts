/**
 * Meat & seafood — retail package sizes typical of US grocery.
 * Ground meats and cuts stocked by mass. Whole chicken → boneless is oneWay.
 */

import type { SeedCategoryBundle } from '../types';
import {
  bundle,
  edge,
  ingredient,
  massForm,
  mergeBundles,
  pack,
  simpleMass,
} from '../helpers';
import { LB_G, OZ_G } from '../sources';

/** Whole chicken → boneless yield (lossy, oneWay). */
const chickenWhole: SeedCategoryBundle = (() => {
  const id = 'chicken-whole';
  const whole = massForm(id, 'whole', { uncertaintyPct: 5 });
  const boneless = massForm(id, 'boneless-yield', { uncertaintyPct: 15 });
  return bundle(
    [
      ingredient({
        id,
        name: 'Whole chicken',
        category: 'meat-seafood',
        defaultFormId: whole.id,
        aliases: ['WHOLE CHICKEN', 'ROASTING CHICKEN', 'FRYER CHICKEN'],
      }),
    ],
    [whole, boneless],
    [
      // USDA yield ~65–70% edible meat from whole bird; use 0.67 one-way
      edge({
        fromFormId: whole.id,
        toFormId: boneless.id,
        factor: 0.67,
        uncertaintyPct: 15,
        source: 'usda',
        oneWay: true,
      }),
    ],
    [pack(whole.id, 'whole_4lb', 4 * LB_G), pack(whole.id, 'whole_5lb', 5 * LB_G)],
  );
})();

export const meatSeafood: SeedCategoryBundle = mergeBundles(
  chickenWhole,
  simpleMass('chicken-breast', 'Chicken breast', 'meat-seafood', {
    isStaple: true,
    aliases: ['CHICKEN BREAST', 'CHKN BRST', 'BONELESS CHICKEN BREAST', 'CHIX BREAST'],
    packages: [
      { label: 'pack_1lb', netG: LB_G },
      { label: 'pack_2_5lb', netG: 2.5 * LB_G },
      { label: 'family_pack_5lb', netG: 5 * LB_G },
    ],
  }),
  simpleMass('chicken-thigh', 'Chicken thigh', 'meat-seafood', {
    aliases: ['CHICKEN THIGH', 'CHKN THIGH', 'BONELESS THIGH', 'CHICKEN THIGHS'],
    packages: [{ label: 'pack_1_5lb', netG: 1.5 * LB_G }],
  }),
  simpleMass('chicken-wing', 'Chicken wings', 'meat-seafood', {
    aliases: ['CHICKEN WINGS', 'WINGS', 'PARTY WINGS'],
    packages: [{ label: 'pack_2lb', netG: 2 * LB_G }],
  }),
  simpleMass('chicken-drumstick', 'Chicken drumsticks', 'meat-seafood', {
    aliases: ['DRUMSTICKS', 'CHICKEN DRUMSTICKS', 'CHICKEN LEGS'],
    packages: [{ label: 'pack_2lb', netG: 2 * LB_G }],
  }),
  simpleMass('ground-chicken', 'Ground chicken', 'meat-seafood', {
    aliases: ['GROUND CHICKEN', 'GRND CHICKEN'],
    packages: [{ label: 'pack_1lb', netG: LB_G }],
  }),
  simpleMass('ground-beef', 'Ground beef', 'meat-seafood', {
    isStaple: true,
    aliases: [
      'GROUND BEEF',
      'GRND BF',
      'GRND BEEF',
      'HAMBURGER MEAT',
      '80/20 GROUND BEEF',
      '93/7 GROUND BEEF',
      'GROUND CHUCK',
    ],
    packages: [
      { label: 'pack_1lb', netG: LB_G },
      { label: 'pack_2lb', netG: 2 * LB_G },
      { label: 'family_pack_5lb', netG: 5 * LB_G },
    ],
  }),
  simpleMass('beef-steak', 'Beef steak', 'meat-seafood', {
    aliases: ['STEAK', 'BEEF STEAK', 'RIBEYE', 'SIRLOIN STEAK', 'NY STRIP'],
    packages: [{ label: 'pack_1lb', netG: LB_G }],
  }),
  simpleMass('beef-roast', 'Beef roast', 'meat-seafood', {
    aliases: ['BEEF ROAST', 'CHUCK ROAST', 'POT ROAST', 'RUMP ROAST'],
    packages: [{ label: 'roast_3lb', netG: 3 * LB_G }],
  }),
  simpleMass('beef-stew-meat', 'Beef stew meat', 'meat-seafood', {
    aliases: ['STEW MEAT', 'BEEF STEW MEAT', 'BEEF CUBES'],
    packages: [{ label: 'pack_1lb', netG: LB_G }],
  }),
  simpleMass('ground-turkey', 'Ground turkey', 'meat-seafood', {
    aliases: ['GROUND TURKEY', 'GRND TURKEY', 'TURKEY GROUND'],
    packages: [{ label: 'pack_1lb', netG: LB_G }],
  }),
  simpleMass('turkey-breast', 'Turkey breast', 'meat-seafood', {
    aliases: ['TURKEY BREAST', 'TURKEY BRST'],
    packages: [{ label: 'pack_1_5lb', netG: 1.5 * LB_G }],
  }),
  simpleMass('pork-chop', 'Pork chop', 'meat-seafood', {
    aliases: ['PORK CHOP', 'PORK CHOPS', 'BONELESS PORK CHOP'],
    packages: [{ label: 'pack_1_5lb', netG: 1.5 * LB_G }],
  }),
  simpleMass('pork-loin', 'Pork loin', 'meat-seafood', {
    aliases: ['PORK LOIN', 'PORK TENDERLOIN', 'PORK LOIN ROAST'],
    packages: [{ label: 'pack_1_5lb', netG: 1.5 * LB_G }],
  }),
  simpleMass('ground-pork', 'Ground pork', 'meat-seafood', {
    aliases: ['GROUND PORK', 'GRND PORK'],
    packages: [{ label: 'pack_1lb', netG: LB_G }],
  }),
  simpleMass('bacon', 'Bacon', 'meat-seafood', {
    isStaple: true,
    aliases: ['BACON', 'SMOKED BACON', 'THICK CUT BACON'],
    packages: [
      { label: 'pack_12oz', netG: 12 * OZ_G },
      { label: 'pack_16oz', netG: 16 * OZ_G },
    ],
  }),
  simpleMass('sausage-breakfast', 'Breakfast sausage', 'meat-seafood', {
    aliases: ['BREAKFAST SAUSAGE', 'SAUSAGE LINKS', 'SAUSAGE PATTIES'],
    packages: [{ label: 'pack_12oz', netG: 12 * OZ_G }],
  }),
  simpleMass('sausage-italian', 'Italian sausage', 'meat-seafood', {
    aliases: ['ITALIAN SAUSAGE', 'ITAL SAUSAGE', 'MILD ITALIAN SAUSAGE'],
    packages: [{ label: 'pack_1lb', netG: LB_G }],
  }),
  simpleMass('ham', 'Ham', 'meat-seafood', {
    aliases: ['HAM', 'SPIRAL HAM', 'HAM STEAK'],
    packages: [{ label: 'slice_8oz', netG: 8 * OZ_G }, { label: 'half_ham_5lb', netG: 5 * LB_G }],
  }),
  simpleMass('deli-turkey', 'Deli turkey', 'meat-seafood', {
    aliases: ['DELI TURKEY', 'TURKEY DELI', 'SLICED TURKEY'],
    packages: [{ label: 'pack_8oz', netG: 8 * OZ_G }],
  }),
  simpleMass('deli-ham', 'Deli ham', 'meat-seafood', {
    aliases: ['DELI HAM', 'SLICED HAM'],
    packages: [{ label: 'pack_8oz', netG: 8 * OZ_G }],
  }),
  simpleMass('hot-dog', 'Hot dogs', 'meat-seafood', {
    aliases: ['HOT DOGS', 'HOTDOGS', 'FRANKS', 'BEEF FRANKS'],
    packages: [{ label: 'pack_12oz', netG: 12 * OZ_G }],
  }),
  simpleMass('salmon', 'Salmon fillet', 'meat-seafood', {
    allergens: ['fish'],
    aliases: ['SALMON', 'SALMON FILLET', 'ATLANTIC SALMON', 'SALMON FILET'],
    packages: [{ label: 'fillet_1lb', netG: LB_G }],
  }),
  simpleMass('tuna-steak', 'Tuna steak', 'meat-seafood', {
    allergens: ['fish'],
    aliases: ['TUNA STEAK', 'AHI TUNA', 'TUNA FILLET'],
    packages: [{ label: 'steak_8oz', netG: 8 * OZ_G }],
  }),
  simpleMass('cod', 'Cod fillet', 'meat-seafood', {
    allergens: ['fish'],
    aliases: ['COD', 'COD FILLET', 'COD FILET'],
    packages: [{ label: 'pack_1lb', netG: LB_G }],
  }),
  simpleMass('tilapia', 'Tilapia fillet', 'meat-seafood', {
    allergens: ['fish'],
    aliases: ['TILAPIA', 'TILAPIA FILLET'],
    packages: [{ label: 'pack_1lb', netG: LB_G }],
  }),
  simpleMass('shrimp', 'Shrimp', 'meat-seafood', {
    allergens: ['shellfish'],
    isStaple: true,
    aliases: ['SHRIMP', 'PRAWNS', 'RAW SHRIMP', 'COOKED SHRIMP'],
    packages: [
      { label: 'bag_1lb', netG: LB_G },
      { label: 'bag_2lb', netG: 2 * LB_G },
    ],
  }),
  simpleMass('crab', 'Crab meat', 'meat-seafood', {
    allergens: ['shellfish'],
    aliases: ['CRAB', 'CRAB MEAT', 'LUMP CRAB'],
    packages: [{ label: 'tub_8oz', netG: 8 * OZ_G }],
  }),
  simpleMass('scallops', 'Scallops', 'meat-seafood', {
    allergens: ['shellfish'],
    aliases: ['SCALLOPS', 'SEA SCALLOPS', 'BAY SCALLOPS'],
    packages: [{ label: 'bag_1lb', netG: LB_G }],
  }),
  simpleMass('canned-tuna', 'Canned tuna', 'meat-seafood', {
    allergens: ['fish'],
    isStaple: true,
    aliases: ['TUNA', 'CANNED TUNA', 'TUNA CAN', 'CHUNK LIGHT TUNA', 'ALBACORE TUNA'],
    packages: [
      { label: 'can_5oz', netG: 5 * OZ_G, drainedG: 4 * OZ_G },
      { label: 'can_12oz', netG: 12 * OZ_G, drainedG: 9 * OZ_G },
    ],
  }),
  simpleMass('canned-salmon', 'Canned salmon', 'meat-seafood', {
    allergens: ['fish'],
    aliases: ['CANNED SALMON', 'SALMON CAN'],
    packages: [{ label: 'can_14_75oz', netG: 14.75 * OZ_G }],
  }),
  simpleMass('anchovy', 'Anchovies', 'meat-seafood', {
    allergens: ['fish'],
    aliases: ['ANCHOVY', 'ANCHOVIES', 'ANCHOVY FILLETS'],
    packages: [{ label: 'tin_2oz', netG: 2 * OZ_G }],
  }),
);
