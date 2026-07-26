/**
 * Fresh produce — weight coverage toward weekly US grocery staples.
 *
 * Count weights (onion, lemon, bunch herbs) are kitchen averages with high
 * uncertaintyPct — store/season variance is often 2–4× for "bunch".
 * Sources: USDA FDC raw produce weights + kitchen_avg for bunches/cloves.
 */

import type { SeedCategoryBundle } from '../types';
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
  volumeForm,
} from '../helpers';
import { KNOWN_DENSITIES, LB_G, OZ_G } from '../sources';

/** Garlic: whole bulb / clove / minced / powder. */
const garlic: SeedCategoryBundle = (() => {
  const id = 'garlic';
  const whole = countForm(id, 'whole', 60, 40); // bulb mass highly variable
  const clove = countForm(id, 'clove', KNOWN_DENSITIES.garlic_clove_g, 30);
  // Minced garlic density ~0.56 g/ml (jarred, culinary estimate)
  const minced = volumeForm(id, 'minced', 0.56, 25);
  // Garlic powder: KA ~10 g per tbsp → 10/14.79 ≈ 0.676 g/ml
  const powder = massForm(id, 'powder', {
    densityGPerMl: 0.68,
    uncertaintyPct: 20,
  });
  return bundle(
    [
      ingredient({
        id,
        name: 'Garlic',
        category: 'produce',
        isStaple: true,
        defaultFormId: clove.id,
        aliases: ['GARLIC', 'FRESH GARLIC', 'GARLIC BULB', 'GARLIC CLOVE'],
      }),
    ],
    [whole, clove, minced, powder],
    [
      // 1 bulb ≈ 10–12 cloves; use 10 with high uncertainty
      edge({
        fromFormId: whole.id,
        toFormId: clove.id,
        factor: 10, // each bulb → 10 each cloves
        uncertaintyPct: 35,
        source: 'kitchen_avg',
      }),
      // 1 clove ≈ 5 ml minced (kitchen avg)
      edge({
        fromFormId: clove.id,
        toFormId: minced.id,
        factor: 5, // each → ml
        uncertaintyPct: 30,
        source: 'kitchen_avg',
      }),
      // powder is not interchangeable 1:1 with fresh — one-way flavor approximation
      // 1 clove ≈ 1/8 tsp powder ≈ 0.625 ml; lossy substitution
      edge({
        fromFormId: clove.id,
        toFormId: powder.id,
        factor: 0.6, // each → grams (approx 1/8 tsp × density)
        uncertaintyPct: 50,
        source: 'culinary',
        oneWay: true,
      }),
    ],
    [
      pack(whole.id, 'bulb', 60),
      pack(whole.id, 'bag_3ct', 180),
      pack(minced.id, 'jar_4_5oz', 4.5 * OZ_G),
      pack(powder.id, 'jar_2_5oz', 2.5 * OZ_G),
    ],
  );
})();

/** Yellow onion: whole / chopped. */
const onion: SeedCategoryBundle = (() => {
  const id = 'onion';
  // Medium yellow onion ~110–150 g; use 140 g kitchen avg
  const whole = countForm(id, 'whole', 140, 30);
  const chopped = massForm(id, 'chopped', {
    // chopped onion ~160 g/cup
    densityGPerMl: 160 / 236.5882365,
    uncertaintyPct: 20,
  });
  return bundle(
    [
      ingredient({
        id,
        name: 'Onion (yellow)',
        category: 'produce',
        isStaple: true,
        defaultFormId: whole.id,
        aliases: ['ONION', 'YELLOW ONION', 'YLW ONION', 'ONIONS'],
      }),
    ],
    [whole, chopped],
    [
      edge({
        fromFormId: whole.id,
        toFormId: chopped.id,
        factor: 140, // each → g
        uncertaintyPct: 25,
        source: 'kitchen_avg',
      }),
    ],
    [pack(whole.id, 'each', 140), pack(whole.id, 'bag_3lb', 3 * LB_G)],
  );
})();

/** Fresh cilantro bunch — high uncertainty. */
const cilantro: SeedCategoryBundle = (() => {
  const id = 'cilantro';
  // Bunch wet weight 20–80 g at stores; use 40 g ± high
  const bunch = countForm(id, 'bunch', 40, 60);
  const chopped = massForm(id, 'chopped', {
    // Loosely packed fresh herbs ~40 g/cup culinary avg (still highly variable).
    // Below ~0.1 g/ml fails the physical density band validator.
    densityGPerMl: 40 / 236.5882365,
    uncertaintyPct: 50,
  });
  const dried = massForm(id, 'dried', {
    densityGPerMl: 0.3,
    uncertaintyPct: 30,
  });
  return bundle(
    [
      ingredient({
        id,
        name: 'Cilantro',
        category: 'produce',
        defaultFormId: bunch.id,
        aliases: ['CILANTRO', 'FRESH CILANTRO', 'CORIANDER LEAF', 'CORIANDER LEAVES'],
      }),
    ],
    [bunch, chopped, dried],
    [
      edge({
        fromFormId: bunch.id,
        toFormId: chopped.id,
        factor: 40,
        uncertaintyPct: 60,
        source: 'kitchen_avg',
      }),
      // dried is not invertible to fresh quality
      edge({
        fromFormId: dried.id,
        toFormId: chopped.id,
        factor: 3, // 1 g dried ≈ 3 g fresh leaves (rough culinary 1:3)
        uncertaintyPct: 50,
        source: 'culinary',
        oneWay: true,
      }),
    ],
    [pack(bunch.id, 'bunch', 40)],
  );
})();

const rest = mergeBundles(
  simpleCount('onion-red', 'Red onion', 'produce', 140, {
    uncertaintyPct: 30,
    aliases: ['RED ONION', 'RD ONION'],
    packages: [{ label: 'each', netG: 140 }],
  }),
  simpleCount('onion-green', 'Green onion / scallion', 'produce', 15, {
    uncertaintyPct: 40,
    formName: 'stalk',
    aliases: ['GREEN ONION', 'SCALLION', 'GREEN ONIONS', 'SCALLIONS', 'SPRING ONION'],
    packages: [{ label: 'bunch', netG: 100 }],
  }),
  simpleCount('shallot', 'Shallot', 'produce', 40, {
    uncertaintyPct: 35,
    aliases: ['SHALLOT', 'SHALLOTS'],
    packages: [{ label: 'each', netG: 40 }],
  }),
  simpleMass('potato-russet', 'Russet potato', 'produce', {
    isStaple: true,
    aliases: ['POTATO', 'RUSSET', 'RUSSET POTATO', 'BAKING POTATO', 'POTATOES'],
    packages: [
      { label: 'each_medium', netG: 173 },
      { label: 'bag_5lb', netG: 5 * LB_G },
      { label: 'bag_10lb', netG: 10 * LB_G },
    ],
  }),
  simpleMass('potato-red', 'Red potato', 'produce', {
    aliases: ['RED POTATO', 'RED POTATOES', 'BABY RED POTATO'],
    packages: [{ label: 'bag_3lb', netG: 3 * LB_G }],
  }),
  simpleMass('potato-yukon', 'Yukon gold potato', 'produce', {
    aliases: ['YUKON GOLD', 'YUKON POTATO', 'GOLD POTATO'],
    packages: [{ label: 'bag_3lb', netG: 3 * LB_G }],
  }),
  simpleMass('sweet-potato', 'Sweet potato', 'produce', {
    aliases: ['SWEET POTATO', 'SWEET POTATOES', 'YAM'],
    packages: [
      { label: 'each_medium', netG: 130 },
      { label: 'bag_3lb', netG: 3 * LB_G },
    ],
  }),
  simpleCount('tomato', 'Tomato', 'produce', 123, {
    // USDA medium tomato ~123 g
    uncertaintyPct: 25,
    isStaple: true,
    aliases: ['TOMATO', 'TOMATOES', 'FRESH TOMATO', 'VINE TOMATO'],
    packages: [{ label: 'each', netG: 123 }, { label: 'lb', netG: LB_G }],
  }),
  simpleMass('tomato-roma', 'Roma tomato', 'produce', {
    aliases: ['ROMA TOMATO', 'ROMA TOMATOES', 'PLUM TOMATO'],
    packages: [{ label: 'lb', netG: LB_G }],
  }),
  simpleMass('tomato-cherry', 'Cherry tomato', 'produce', {
    aliases: ['CHERRY TOMATO', 'CHERRY TOMATOES', 'GRAPE TOMATO'],
    packages: [{ label: 'pint_container', netG: 280 }],
  }),
  simpleMass('lettuce-romaine', 'Romaine lettuce', 'produce', {
    isStaple: true,
    aliases: ['ROMAINE', 'ROMAINE LETTUCE', 'ROMAINE HEARTS'],
    packages: [
      { label: 'head', netG: 300 },
      { label: 'hearts_3pk', netG: 500 },
    ],
  }),
  simpleMass('lettuce-iceberg', 'Iceberg lettuce', 'produce', {
    aliases: ['ICEBERG', 'ICEBERG LETTUCE', 'HEAD LETTUCE'],
    packages: [{ label: 'head', netG: 550 }],
  }),
  simpleMass('spinach', 'Spinach (fresh)', 'produce', {
    isStaple: true,
    aliases: ['SPINACH', 'FRESH SPINACH', 'BABY SPINACH'],
    packages: [
      { label: 'clamshell_5oz', netG: 5 * OZ_G },
      { label: 'bag_10oz', netG: 10 * OZ_G },
    ],
  }),
  simpleMass('kale', 'Kale', 'produce', {
    aliases: ['KALE', 'CURLY KALE', 'TUSCAN KALE', 'LACINATO KALE'],
    packages: [{ label: 'bunch', netG: 200 }],
  }),
  simpleMass('arugula', 'Arugula', 'produce', {
    aliases: ['ARUGULA', 'ROCKET'],
    packages: [{ label: 'clamshell_5oz', netG: 5 * OZ_G }],
  }),
  simpleMass('cabbage', 'Cabbage', 'produce', {
    aliases: ['CABBAGE', 'GREEN CABBAGE', 'HEAD CABBAGE'],
    packages: [{ label: 'head', netG: 900 }],
  }),
  simpleMass('broccoli', 'Broccoli', 'produce', {
    isStaple: true,
    aliases: ['BROCCOLI', 'BROCCOLI CROWN'],
    packages: [{ label: 'crown', netG: 250 }, { label: 'bunch', netG: 500 }],
  }),
  simpleMass('cauliflower', 'Cauliflower', 'produce', {
    aliases: ['CAULIFLOWER', 'CAULI'],
    packages: [{ label: 'head', netG: 600 }],
  }),
  simpleMass('carrot', 'Carrot', 'produce', {
    isStaple: true,
    aliases: ['CARROT', 'CARROTS', 'BABY CARROTS'],
    packages: [
      { label: 'lb', netG: LB_G },
      { label: 'bag_2lb', netG: 2 * LB_G },
      { label: 'baby_1lb', netG: LB_G },
    ],
  }),
  simpleMass('celery', 'Celery', 'produce', {
    isStaple: true,
    aliases: ['CELERY', 'CELERY STALKS'],
    packages: [{ label: 'bunch', netG: 450 }],
  }),
  simpleMass('cucumber', 'Cucumber', 'produce', {
    aliases: ['CUCUMBER', 'CUKE', 'ENGLISH CUCUMBER'],
    packages: [{ label: 'each', netG: 300 }],
  }),
  simpleMass('bell-pepper-green', 'Green bell pepper', 'produce', {
    isStaple: true,
    aliases: ['GREEN PEPPER', 'GREEN BELL PEPPER', 'BELL PEPPER GREEN'],
    packages: [{ label: 'each', netG: 120 }],
  }),
  simpleMass('bell-pepper-red', 'Red bell pepper', 'produce', {
    aliases: ['RED PEPPER', 'RED BELL PEPPER', 'BELL PEPPER RED'],
    packages: [{ label: 'each', netG: 120 }],
  }),
  simpleMass('bell-pepper-yellow', 'Yellow bell pepper', 'produce', {
    aliases: ['YELLOW PEPPER', 'YELLOW BELL PEPPER'],
    packages: [{ label: 'each', netG: 120 }],
  }),
  simpleMass('jalapeno', 'Jalapeño', 'produce', {
    aliases: ['JALAPENO', 'JALAPEÑO', 'JALAPENOS'],
    packages: [{ label: 'each', netG: 14 }],
  }),
  simpleMass('avocado', 'Avocado', 'produce', {
    isStaple: true,
    aliases: ['AVOCADO', 'AVOCADOS', 'HASS AVOCADO'],
    packages: [{ label: 'each', netG: 170 }, { label: 'bag_4ct', netG: 680 }],
  }),
  simpleMass('mushroom-white', 'White mushrooms', 'produce', {
    aliases: ['MUSHROOM', 'MUSHROOMS', 'WHITE MUSHROOM', 'BUTTON MUSHROOM'],
    packages: [{ label: 'pack_8oz', netG: 8 * OZ_G }],
  }),
  simpleMass('mushroom-baby-bella', 'Baby bella mushrooms', 'produce', {
    aliases: ['BABY BELLA', 'CREMINI', 'CRIMINI', 'BABY PORTABELLA'],
    packages: [{ label: 'pack_8oz', netG: 8 * OZ_G }],
  }),
  simpleMass('zucchini', 'Zucchini', 'produce', {
    aliases: ['ZUCCHINI', 'COURGETTE'],
    packages: [{ label: 'each', netG: 200 }],
  }),
  simpleMass('yellow-squash', 'Yellow squash', 'produce', {
    aliases: ['YELLOW SQUASH', 'SUMMER SQUASH'],
    packages: [{ label: 'each', netG: 200 }],
  }),
  simpleMass('corn-ear', 'Corn on the cob', 'produce', {
    aliases: ['CORN', 'CORN ON THE COB', 'SWEET CORN', 'EAR OF CORN'],
    packages: [{ label: 'ear', netG: 150 }, { label: 'pack_4ct', netG: 600 }],
  }),
  simpleMass('green-beans', 'Green beans', 'produce', {
    aliases: ['GREEN BEANS', 'STRING BEANS', 'SNAP BEANS'],
    packages: [{ label: 'lb', netG: LB_G }],
  }),
  simpleMass('asparagus', 'Asparagus', 'produce', {
    aliases: ['ASPARAGUS'],
    packages: [{ label: 'bunch', netG: 450 }],
  }),
  simpleMass('brussels-sprouts', 'Brussels sprouts', 'produce', {
    aliases: ['BRUSSELS SPROUTS', 'BRUSSEL SPROUTS'],
    packages: [{ label: 'bag_1lb', netG: LB_G }],
  }),
  simpleCount('lemon', 'Lemon', 'produce', 84, {
    // USDA lemon ~84 g
    uncertaintyPct: 20,
    isStaple: true,
    aliases: ['LEMON', 'LEMONS', 'FRESH LEMON'],
    packages: [{ label: 'each', netG: 84 }, { label: 'bag_2lb', netG: 2 * LB_G }],
  }),
  simpleCount('lime', 'Lime', 'produce', 67, {
    uncertaintyPct: 20,
    aliases: ['LIME', 'LIMES'],
    packages: [{ label: 'each', netG: 67 }],
  }),
  simpleCount('orange', 'Orange', 'produce', 131, {
    uncertaintyPct: 20,
    aliases: ['ORANGE', 'ORANGES', 'NAVEL ORANGE'],
    packages: [{ label: 'each', netG: 131 }, { label: 'bag_4lb', netG: 4 * LB_G }],
  }),
  simpleCount('apple', 'Apple', 'produce', 182, {
    uncertaintyPct: 25,
    isStaple: true,
    aliases: ['APPLE', 'APPLES', 'GALA APPLE', 'HONEYCRISP', 'FUJI APPLE'],
    packages: [{ label: 'each', netG: 182 }, { label: 'bag_3lb', netG: 3 * LB_G }],
  }),
  simpleCount('banana', 'Banana', 'produce', 118, {
    // USDA medium banana ~118 g
    uncertaintyPct: 20,
    isStaple: true,
    aliases: ['BANANA', 'BANANAS'],
    packages: [{ label: 'each', netG: 118 }, { label: 'bunch', netG: 700 }],
  }),
  simpleMass('blueberry', 'Blueberries', 'produce', {
    aliases: ['BLUEBERRY', 'BLUEBERRIES'],
    packages: [{ label: 'pint', netG: 312 }],
  }),
  simpleMass('strawberry', 'Strawberries', 'produce', {
    aliases: ['STRAWBERRY', 'STRAWBERRIES'],
    packages: [{ label: 'lb', netG: LB_G }],
  }),
  simpleMass('grape', 'Grapes', 'produce', {
    aliases: ['GRAPE', 'GRAPES', 'RED GRAPES', 'GREEN GRAPES'],
    packages: [{ label: 'bag_2lb', netG: 2 * LB_G }],
  }),
  simpleCount('watermelon', 'Watermelon', 'produce', 9000, {
    uncertaintyPct: 40,
    aliases: ['WATERMELON'],
    packages: [{ label: 'whole', netG: 9000 }],
  }),
  simpleMass('pineapple', 'Pineapple', 'produce', {
    aliases: ['PINEAPPLE'],
    packages: [{ label: 'whole', netG: 900 }],
  }),
  simpleMass('mango', 'Mango', 'produce', {
    aliases: ['MANGO', 'MANGOS', 'MANGOES'],
    packages: [{ label: 'each', netG: 200 }],
  }),
  simpleCount('ginger-root', 'Ginger root', 'produce', 30, {
    // often sold by piece
    uncertaintyPct: 40,
    formName: 'knob',
    aliases: ['GINGER', 'FRESH GINGER', 'GINGER ROOT'],
    packages: [{ label: 'knob', netG: 30 }],
  }),
  simpleMass('basil-fresh', 'Fresh basil', 'produce', {
    uncertaintyPct: 50,
    aliases: ['BASIL', 'FRESH BASIL', 'BASIL BUNCH'],
    packages: [{ label: 'clamshell', netG: 28 }],
  }),
  simpleMass('parsley-fresh', 'Fresh parsley', 'produce', {
    uncertaintyPct: 50,
    aliases: ['PARSLEY', 'FRESH PARSLEY', 'ITALIAN PARSLEY', 'FLAT LEAF PARSLEY'],
    packages: [{ label: 'bunch', netG: 50 }],
  }),
  simpleMass('mint-fresh', 'Fresh mint', 'produce', {
    uncertaintyPct: 50,
    aliases: ['MINT', 'FRESH MINT'],
    packages: [{ label: 'bunch', netG: 30 }],
  }),
  simpleMass('rosemary-fresh', 'Fresh rosemary', 'produce', {
    uncertaintyPct: 50,
    aliases: ['ROSEMARY', 'FRESH ROSEMARY'],
    packages: [{ label: 'clamshell', netG: 20 }],
  }),
  simpleMass('thyme-fresh', 'Fresh thyme', 'produce', {
    uncertaintyPct: 50,
    aliases: ['THYME', 'FRESH THYME'],
    packages: [{ label: 'clamshell', netG: 15 }],
  }),
  simpleMass('garlic-prepeeled', 'Peeled garlic cloves (retail)', 'produce', {
    aliases: ['PEELED GARLIC', 'GARLIC CLOVES PEELED'],
    packages: [{ label: 'jar_6oz', netG: 6 * OZ_G }],
  }),
);

export const produce: SeedCategoryBundle = mergeBundles(
  garlic,
  onion,
  cilantro,
  rest,
);
