/**
 * Fresh produce — count for hand-sized items, mass for scoopables, bunch for
 * herbs/celery-class items. Form is a first-class axis (SPEC units section).
 *
 * Every count-default item keeps a mass (`bulk`) form so receipt lines in lb/oz
 * still resolve, and declares `gramsPerCount` so bag-weight ↔ piece count both
 * work. Bunch forms carry high uncertaintyPct (store/season variance 2–4×).
 *
 * Count weights prefer USDA FoodData Central / SR Legacy household measures.
 * When USDA lists edible-only or size is highly variable, kitchen_avg + honest
 * uncertainty is used instead of false precision. See reports/feat-produce-by-count.md.
 */

import {
  bundle,
  countForm,
  edge,
  ingredient,
  massForm,
  mergeBundles,
  pack,
  simpleMass,
  volumeForm,
} from '../helpers';
import { CUP_ML, KNOWN_DENSITIES, LB_G, OZ_G } from '../sources';
import type { SeedCategoryBundle } from '../types';

// ── Documented count weights (grams per piece / head / bunch) ───────────────
// Prefer USDA FDC / SR Legacy medium household measures. Do not invent values.

const G = {
  /** USDA SR: Apples, raw, with skin — 1 medium (3" dia) = 182 g */
  apple: 182,
  /** USDA SR: Bananas, raw — 1 medium (7"–7⅞") = 118 g */
  banana: 118,
  /** USDA SR: Oranges, raw, all commercial varieties — 1 medium (2⅝" dia) = 131 g */
  orange: 131,
  /**
   * Whole lemon retail; USDA edible (without peel) is 58 g for 2⅛" fruit.
   * Whole-with-peel kitchen/retail medium ≈ 84 g.
   */
  lemon: 84,
  /** USDA SR: Limes, raw — 1 fruit (2" dia) = 67 g */
  lime: 67,
  /** USDA SR: Tomatoes, red, ripe, raw — 1 medium (2⅗" dia) = 123 g */
  tomato: 123,
  /** USDA SR: Tomatoes, red, ripe, raw, plum — ~62 g each (Roma/plum class) */
  tomatoRoma: 62,
  /** USDA SR: Onions, raw — 1 medium (2½" dia) = 110 g */
  onion: 110,
  /** USDA SR: Onions, raw — shallot / small bulb kitchen ≈ 40 g (high variance) */
  shallot: 40,
  /** Green onion / scallion stalk kitchen avg (not a stable USDA medium) */
  greenOnionStalk: 15,
  /**
   * Russet / white baking potato medium ≈ 173 g (≈6 oz).
   * Aligns with common 5 lb bag → ~13 medium potatoes (5×453.59/173 ≈ 13.1).
   * USDA white potato "medium (2¼–3¼" dia)" is 213 g — we use 173 for
   * typical US baking-potato bag sizing; uncertainty reflects size spread.
   */
  potato: 173,
  /** Red / Yukon class similar medium piece weight; high size variance in bags */
  potatoOther: 150,
  /** USDA SR: Sweet potato, raw — 1 medium (5" long) ≈ 130 g */
  sweetPotato: 130,
  /**
   * Hass avocado whole fruit retail medium ≈ 170 g (skin+flesh+seed).
   * USDA edible California (without skin/seed) is often listed ~136 g;
   * purchase weight is whole fruit.
   */
  avocado: 170,
  /** USDA SR: Peppers, sweet, green, raw — 1 medium (≈2¾"×2½") = 119 g */
  bellPepper: 119,
  /** USDA SR / SNAP-Ed: Cucumber, raw — 1 cucumber 8¼" = 301 g */
  cucumber: 301,
  /** USDA SR: Squash, summer, zucchini, raw — 1 medium = 196 g */
  zucchini: 196,
  /** Summer yellow squash ≈ zucchini medium */
  yellowSquash: 196,
  /** USDA SR: Eggplant, raw — 1 eggplant ≈ 548 g (high size variance) */
  eggplant: 548,
  /** USDA SR: Peaches, raw — 1 medium (2⅔" dia) = 150 g */
  peach: 150,
  /** USDA SR: Pears, raw — 1 medium = 178 g */
  pear: 178,
  /** Mango whole fruit kitchen medium ≈ 200 g (cultivar varies widely) */
  mango: 200,
  /** Pineapple whole fruit kitchen avg ≈ 900 g */
  pineapple: 900,
  /** Whole watermelon kitchen avg (high variance) */
  watermelon: 9000,
  /** USDA SR: Peppers, jalapeño, raw — 1 pepper ≈ 14 g */
  jalapeno: 14,
  /**
   * USDA SR: Carrots, raw — 1 medium ≈ 61 g.
   * Bags are sold by weight; recipes often count — see judgement notes.
   */
  carrot: 61,
  /** USDA SR: Garlic, raw — ~3 g/clove; bulb highly variable */
  garlicClove: KNOWN_DENSITIES.garlic_clove_g,
  garlicBulb: 60,
  /** Corn on the cob: kernels+cob kitchen medium ear ≈ 150 g */
  cornEar: 150,
  /** Ginger knob kitchen piece (sold by weight, recipes say "1 knob") */
  gingerKnob: 30,
  // Heads / crowns (count) — USDA household or retail typicals
  /** Romaine head retail / hearts pack component; full head varies */
  lettuceRomaine: 300,
  /** USDA SR: Lettuce, iceberg, raw — 1 head ≈ 539 g */
  lettuceIceberg: 539,
  /** USDA SR: Cabbage, raw — 1 head medium ≈ 908 g */
  cabbage: 908,
  /**
   * Broccoli crown retail ≈ 250 g; full bunch USDA ~608 g.
   * Default unit is crown (how many US recipes say "1 head broccoli").
   */
  broccoliCrown: 250,
  /** USDA SR: Cauliflower, raw — 1 head medium (5–6" dia) ≈ 588 g */
  cauliflower: 588,
  // Bunches — highly variable; high uncertainty required
  cilantroBunch: 40,
  parsleyBunch: 50,
  mintBunch: 30,
  kaleBunch: 200,
  celeryBunch: 450,
  asparagusBunch: 450,
  basilBunch: 28,
  rosemaryBunch: 20,
  thymeBunch: 15,
} as const;

type PackDef = {
  readonly label: string;
  readonly netG: number;
  /** Attach package to count form (default) or mass form. */
  readonly on?: 'count' | 'mass';
};

/**
 * Count-default produce with a retained mass form for receipt lb/oz lines.
 * Preserves `${id}-bulk` mass form id so existing pantry rows stay valid when
 * upgrading from a simpleMass seed.
 */
function countWithMass(
  id: string,
  name: string,
  gramsPerCount: number,
  opts: {
    readonly countFormName?: string;
    readonly massFormName?: string;
    readonly uncertaintyPct?: number;
    readonly massUncertaintyPct?: number;
    readonly isStaple?: boolean;
    readonly aliases?: readonly string[];
    readonly packages?: readonly PackDef[];
    /** Conversion / form source tag (seed edge source field). */
    readonly source?: string;
    readonly densityGPerMl?: number;
  } = {},
): SeedCategoryBundle {
  const countName = opts.countFormName ?? 'whole';
  const massName = opts.massFormName ?? 'bulk';
  const unc = opts.uncertaintyPct ?? 25;
  const massUnc = opts.massUncertaintyPct ?? 8;
  const source = opts.source ?? 'usda';

  const whole = countForm(id, countName, gramsPerCount, unc);
  const bulk = massForm(id, massName, {
    densityGPerMl: opts.densityGPerMl,
    uncertaintyPct: massUnc,
  });

  const packages = (opts.packages ?? []).map((p) =>
    pack(p.on === 'mass' ? bulk.id : whole.id, p.label, p.netG),
  );

  return bundle(
    [
      ingredient({
        id,
        name,
        category: 'produce',
        isStaple: opts.isStaple,
        defaultFormId: whole.id,
        aliases: opts.aliases,
      }),
    ],
    [whole, bulk],
    [
      edge({
        fromFormId: whole.id,
        toFormId: bulk.id,
        factor: gramsPerCount, // 1 each → g mass form
        uncertaintyPct: unc,
        source,
      }),
    ],
    packages,
  );
}

/** Bunch-default herbs / celery-class items (high uncertainty). */
function bunchWithMass(
  id: string,
  name: string,
  gramsPerBunch: number,
  opts: {
    readonly uncertaintyPct?: number;
    readonly aliases?: readonly string[];
    readonly packages?: readonly PackDef[];
    readonly densityGPerMl?: number;
  } = {},
): SeedCategoryBundle {
  return countWithMass(id, name, gramsPerBunch, {
    countFormName: 'bunch',
    uncertaintyPct: opts.uncertaintyPct ?? 60,
    massUncertaintyPct: 40,
    aliases: opts.aliases,
    packages: opts.packages ?? [{ label: 'bunch', netG: gramsPerBunch }],
    source: 'kitchen_avg',
    densityGPerMl: opts.densityGPerMl,
  });
}

// ── Multi-form specials ─────────────────────────────────────────────────────

/** Garlic: whole bulb / clove / minced / powder. Default = clove (recipe unit). */
const garlic: SeedCategoryBundle = (() => {
  const id = 'garlic';
  const whole = countForm(id, 'whole', G.garlicBulb, 40);
  const clove = countForm(id, 'clove', G.garlicClove, 30);
  const minced = volumeForm(id, 'minced', 0.56, 25);
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
      edge({
        fromFormId: whole.id,
        toFormId: clove.id,
        factor: 10,
        uncertaintyPct: 35,
        source: 'kitchen_avg',
      }),
      edge({
        fromFormId: clove.id,
        toFormId: minced.id,
        factor: 5,
        uncertaintyPct: 30,
        source: 'kitchen_avg',
      }),
      edge({
        fromFormId: clove.id,
        toFormId: powder.id,
        factor: 0.6,
        uncertaintyPct: 50,
        source: 'culinary',
        oneWay: true,
      }),
    ],
    [
      pack(whole.id, 'bulb', G.garlicBulb),
      pack(whole.id, 'bag_3ct', 3 * G.garlicBulb),
      pack(minced.id, 'jar_4_5oz', 4.5 * OZ_G),
      pack(powder.id, 'jar_2_5oz', 2.5 * OZ_G),
    ],
  );
})();

/** Yellow onion: whole (count default) / chopped (volume-bridge mass) / bulk mass. */
const onion: SeedCategoryBundle = (() => {
  const id = 'onion';
  const whole = countForm(id, 'whole', G.onion, 25);
  const chopped = massForm(id, 'chopped', {
    densityGPerMl: 160 / CUP_ML,
    uncertaintyPct: 20,
  });
  const bulk = massForm(id, 'bulk', { uncertaintyPct: 8 });
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
    [whole, chopped, bulk],
    [
      edge({
        fromFormId: whole.id,
        toFormId: chopped.id,
        factor: G.onion,
        uncertaintyPct: 25,
        source: 'usda',
      }),
      edge({
        fromFormId: whole.id,
        toFormId: bulk.id,
        factor: G.onion,
        uncertaintyPct: 25,
        source: 'usda',
      }),
    ],
    [
      pack(whole.id, 'each', G.onion),
      pack(whole.id, 'bag_3lb', 3 * LB_G),
      pack(bulk.id, 'lb', LB_G),
    ],
  );
})();

/** Fresh cilantro bunch — high uncertainty (SPEC bunch variance). */
const cilantro: SeedCategoryBundle = (() => {
  const id = 'cilantro';
  const bunch = countForm(id, 'bunch', G.cilantroBunch, 60);
  const chopped = massForm(id, 'chopped', {
    densityGPerMl: 40 / CUP_ML,
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
        factor: G.cilantroBunch,
        uncertaintyPct: 60,
        source: 'kitchen_avg',
      }),
      edge({
        fromFormId: dried.id,
        toFormId: chopped.id,
        factor: 3,
        uncertaintyPct: 50,
        source: 'culinary',
        oneWay: true,
      }),
    ],
    [pack(bunch.id, 'bunch', G.cilantroBunch)],
  );
})();

// ── Catalog body ────────────────────────────────────────────────────────────

const rest = mergeBundles(
  // ── Count: alliums ──────────────────────────────────────────────────────
  countWithMass('onion-red', 'Red onion', G.onion, {
    // Preserve historical form id `onion-red-each` (simpleCount default).
    countFormName: 'each',
    uncertaintyPct: 25,
    aliases: ['RED ONION', 'RD ONION'],
    packages: [
      { label: 'each', netG: G.onion },
      { label: 'lb', netG: LB_G, on: 'mass' },
    ],
    source: 'usda',
  }),
  countWithMass('onion-green', 'Green onion / scallion', G.greenOnionStalk, {
    countFormName: 'stalk',
    uncertaintyPct: 40,
    aliases: ['GREEN ONION', 'SCALLION', 'GREEN ONIONS', 'SCALLIONS', 'SPRING ONION'],
    packages: [
      { label: 'stalk', netG: G.greenOnionStalk },
      { label: 'bunch', netG: 100 },
    ],
    source: 'kitchen_avg',
  }),
  countWithMass('shallot', 'Shallot', G.shallot, {
    countFormName: 'each',
    uncertaintyPct: 35,
    aliases: ['SHALLOT', 'SHALLOTS'],
    packages: [{ label: 'each', netG: G.shallot }],
    source: 'kitchen_avg',
  }),

  // ── Count: potatoes / roots ─────────────────────────────────────────────
  countWithMass('potato-russet', 'Russet potato', G.potato, {
    isStaple: true,
    uncertaintyPct: 30,
    aliases: ['POTATO', 'RUSSET', 'RUSSET POTATO', 'BAKING POTATO', 'POTATOES'],
    packages: [
      { label: 'each_medium', netG: G.potato },
      { label: 'bag_5lb', netG: 5 * LB_G, on: 'mass' },
      { label: 'bag_10lb', netG: 10 * LB_G, on: 'mass' },
    ],
    source: 'kitchen_avg',
  }),
  countWithMass('potato-red', 'Red potato', G.potatoOther, {
    uncertaintyPct: 35,
    aliases: ['RED POTATO', 'RED POTATOES', 'BABY RED POTATO'],
    packages: [
      { label: 'each_medium', netG: G.potatoOther },
      { label: 'bag_3lb', netG: 3 * LB_G, on: 'mass' },
    ],
    source: 'kitchen_avg',
  }),
  countWithMass('potato-yukon', 'Yukon gold potato', G.potatoOther, {
    uncertaintyPct: 35,
    aliases: ['YUKON GOLD', 'YUKON POTATO', 'GOLD POTATO'],
    packages: [
      { label: 'each_medium', netG: G.potatoOther },
      { label: 'bag_3lb', netG: 3 * LB_G, on: 'mass' },
    ],
    source: 'kitchen_avg',
  }),
  countWithMass('sweet-potato', 'Sweet potato', G.sweetPotato, {
    uncertaintyPct: 30,
    aliases: ['SWEET POTATO', 'SWEET POTATOES', 'YAM'],
    packages: [
      { label: 'each_medium', netG: G.sweetPotato },
      { label: 'bag_3lb', netG: 3 * LB_G, on: 'mass' },
    ],
    source: 'usda',
  }),
  // Carrots: ambiguous (bag vs each) — count default with mass for bags.
  countWithMass('carrot', 'Carrot', G.carrot, {
    isStaple: true,
    uncertaintyPct: 30,
    aliases: ['CARROT', 'CARROTS', 'BABY CARROTS'],
    packages: [
      { label: 'each_medium', netG: G.carrot },
      { label: 'lb', netG: LB_G, on: 'mass' },
      { label: 'bag_2lb', netG: 2 * LB_G, on: 'mass' },
      { label: 'baby_1lb', netG: LB_G, on: 'mass' },
    ],
    source: 'usda',
  }),
  countWithMass('ginger-root', 'Ginger root', G.gingerKnob, {
    countFormName: 'knob',
    uncertaintyPct: 40,
    aliases: ['GINGER', 'FRESH GINGER', 'GINGER ROOT'],
    packages: [{ label: 'knob', netG: G.gingerKnob }],
    source: 'kitchen_avg',
  }),

  // ── Count: tomatoes / peppers / avocado ─────────────────────────────────
  countWithMass('tomato', 'Tomato', G.tomato, {
    isStaple: true,
    uncertaintyPct: 25,
    countFormName: 'each',
    aliases: ['TOMATO', 'TOMATOES', 'FRESH TOMATO', 'VINE TOMATO'],
    packages: [
      { label: 'each', netG: G.tomato },
      { label: 'lb', netG: LB_G, on: 'mass' },
    ],
    source: 'usda',
  }),
  countWithMass('tomato-roma', 'Roma tomato', G.tomatoRoma, {
    uncertaintyPct: 25,
    countFormName: 'each',
    aliases: ['ROMA TOMATO', 'ROMA TOMATOES', 'PLUM TOMATO'],
    packages: [
      { label: 'each', netG: G.tomatoRoma },
      { label: 'lb', netG: LB_G, on: 'mass' },
    ],
    source: 'usda',
  }),
  // Cherry tomatoes: weight (pint / clamshell) — mass default
  simpleMass('tomato-cherry', 'Cherry tomato', 'produce', {
    aliases: ['CHERRY TOMATO', 'CHERRY TOMATOES', 'GRAPE TOMATO'],
    packages: [{ label: 'pint_container', netG: 280 }],
  }),
  countWithMass('bell-pepper-green', 'Green bell pepper', G.bellPepper, {
    isStaple: true,
    uncertaintyPct: 20,
    countFormName: 'each',
    aliases: ['GREEN PEPPER', 'GREEN BELL PEPPER', 'BELL PEPPER GREEN'],
    packages: [
      { label: 'each', netG: G.bellPepper },
      { label: 'lb', netG: LB_G, on: 'mass' },
    ],
    source: 'usda',
  }),
  countWithMass('bell-pepper-red', 'Red bell pepper', G.bellPepper, {
    uncertaintyPct: 20,
    countFormName: 'each',
    aliases: ['RED PEPPER', 'RED BELL PEPPER', 'BELL PEPPER RED'],
    packages: [
      { label: 'each', netG: G.bellPepper },
      { label: 'lb', netG: LB_G, on: 'mass' },
    ],
    source: 'usda',
  }),
  countWithMass('bell-pepper-yellow', 'Yellow bell pepper', G.bellPepper, {
    uncertaintyPct: 20,
    countFormName: 'each',
    aliases: ['YELLOW PEPPER', 'YELLOW BELL PEPPER'],
    packages: [
      { label: 'each', netG: G.bellPepper },
      { label: 'lb', netG: LB_G, on: 'mass' },
    ],
    source: 'usda',
  }),
  countWithMass('jalapeno', 'Jalapeño', G.jalapeno, {
    uncertaintyPct: 30,
    countFormName: 'each',
    aliases: ['JALAPENO', 'JALAPEÑO', 'JALAPENOS'],
    packages: [{ label: 'each', netG: G.jalapeno }],
    source: 'usda',
  }),
  countWithMass('avocado', 'Avocado', G.avocado, {
    isStaple: true,
    uncertaintyPct: 25,
    countFormName: 'each',
    aliases: ['AVOCADO', 'AVOCADOS', 'HASS AVOCADO'],
    packages: [
      { label: 'each', netG: G.avocado },
      { label: 'bag_4ct', netG: 4 * G.avocado },
    ],
    source: 'kitchen_avg',
  }),

  // ── Count: heads of brassicas / lettuce ─────────────────────────────────
  countWithMass('lettuce-romaine', 'Romaine lettuce', G.lettuceRomaine, {
    isStaple: true,
    uncertaintyPct: 35,
    countFormName: 'head',
    aliases: ['ROMAINE', 'ROMAINE LETTUCE', 'ROMAINE HEARTS'],
    packages: [
      { label: 'head', netG: G.lettuceRomaine },
      { label: 'hearts_3pk', netG: 500 },
    ],
    source: 'kitchen_avg',
  }),
  countWithMass('lettuce-iceberg', 'Iceberg lettuce', G.lettuceIceberg, {
    uncertaintyPct: 25,
    countFormName: 'head',
    aliases: ['ICEBERG', 'ICEBERG LETTUCE', 'HEAD LETTUCE'],
    packages: [{ label: 'head', netG: G.lettuceIceberg }],
    source: 'usda',
  }),
  countWithMass('cabbage', 'Cabbage', G.cabbage, {
    uncertaintyPct: 30,
    countFormName: 'head',
    aliases: ['CABBAGE', 'GREEN CABBAGE', 'HEAD CABBAGE'],
    packages: [{ label: 'head', netG: G.cabbage }],
    source: 'usda',
  }),
  countWithMass('broccoli', 'Broccoli', G.broccoliCrown, {
    isStaple: true,
    uncertaintyPct: 35,
    countFormName: 'head',
    aliases: ['BROCCOLI', 'BROCCOLI CROWN'],
    packages: [
      { label: 'crown', netG: G.broccoliCrown },
      { label: 'bunch', netG: 500 },
      { label: 'lb', netG: LB_G, on: 'mass' },
    ],
    source: 'kitchen_avg',
  }),
  countWithMass('cauliflower', 'Cauliflower', G.cauliflower, {
    uncertaintyPct: 30,
    countFormName: 'head',
    aliases: ['CAULIFLOWER', 'CAULI'],
    packages: [{ label: 'head', netG: G.cauliflower }],
    source: 'usda',
  }),

  // ── Count: cucumbers / squash / corn ────────────────────────────────────
  countWithMass('cucumber', 'Cucumber', G.cucumber, {
    uncertaintyPct: 25,
    countFormName: 'each',
    aliases: ['CUCUMBER', 'CUKE', 'ENGLISH CUCUMBER'],
    packages: [
      { label: 'each', netG: G.cucumber },
      { label: 'lb', netG: LB_G, on: 'mass' },
    ],
    source: 'usda',
  }),
  countWithMass('zucchini', 'Zucchini', G.zucchini, {
    uncertaintyPct: 25,
    countFormName: 'each',
    aliases: ['ZUCCHINI', 'COURGETTE'],
    packages: [
      { label: 'each', netG: G.zucchini },
      { label: 'lb', netG: LB_G, on: 'mass' },
    ],
    source: 'usda',
  }),
  countWithMass('yellow-squash', 'Yellow squash', G.yellowSquash, {
    uncertaintyPct: 25,
    countFormName: 'each',
    aliases: ['YELLOW SQUASH', 'SUMMER SQUASH'],
    packages: [
      { label: 'each', netG: G.yellowSquash },
      { label: 'lb', netG: LB_G, on: 'mass' },
    ],
    source: 'usda',
  }),
  countWithMass('eggplant', 'Eggplant', G.eggplant, {
    uncertaintyPct: 35,
    countFormName: 'each',
    aliases: ['EGGPLANT', 'AUBERGINE'],
    packages: [
      { label: 'each', netG: G.eggplant },
      { label: 'lb', netG: LB_G, on: 'mass' },
    ],
    source: 'usda',
  }),
  countWithMass('corn-ear', 'Corn on the cob', G.cornEar, {
    uncertaintyPct: 30,
    countFormName: 'ear',
    aliases: ['CORN', 'CORN ON THE COB', 'SWEET CORN', 'EAR OF CORN'],
    packages: [
      { label: 'ear', netG: G.cornEar },
      { label: 'pack_4ct', netG: 4 * G.cornEar },
    ],
    source: 'kitchen_avg',
  }),

  // ── Count: citrus / tree fruit ──────────────────────────────────────────
  countWithMass('lemon', 'Lemon', G.lemon, {
    isStaple: true,
    uncertaintyPct: 20,
    countFormName: 'each',
    aliases: ['LEMON', 'LEMONS', 'FRESH LEMON'],
    packages: [
      { label: 'each', netG: G.lemon },
      { label: 'bag_2lb', netG: 2 * LB_G, on: 'mass' },
    ],
    source: 'kitchen_avg',
  }),
  countWithMass('lime', 'Lime', G.lime, {
    uncertaintyPct: 20,
    countFormName: 'each',
    aliases: ['LIME', 'LIMES'],
    packages: [
      { label: 'each', netG: G.lime },
      { label: 'lb', netG: LB_G, on: 'mass' },
    ],
    source: 'usda',
  }),
  countWithMass('orange', 'Orange', G.orange, {
    uncertaintyPct: 20,
    countFormName: 'each',
    aliases: ['ORANGE', 'ORANGES', 'NAVEL ORANGE'],
    packages: [
      { label: 'each', netG: G.orange },
      { label: 'bag_4lb', netG: 4 * LB_G, on: 'mass' },
    ],
    source: 'usda',
  }),
  countWithMass('apple', 'Apple', G.apple, {
    isStaple: true,
    uncertaintyPct: 25,
    countFormName: 'each',
    aliases: ['APPLE', 'APPLES', 'GALA APPLE', 'HONEYCRISP', 'FUJI APPLE'],
    packages: [
      { label: 'each', netG: G.apple },
      { label: 'bag_3lb', netG: 3 * LB_G, on: 'mass' },
    ],
    source: 'usda',
  }),
  // Banana: default each (not bunch) — recipes say "2 bananas"
  countWithMass('banana', 'Banana', G.banana, {
    isStaple: true,
    uncertaintyPct: 20,
    countFormName: 'each',
    aliases: ['BANANA', 'BANANAS'],
    packages: [
      { label: 'each', netG: G.banana },
      { label: 'bunch', netG: 700 },
    ],
    source: 'usda',
  }),
  countWithMass('peach', 'Peach', G.peach, {
    uncertaintyPct: 25,
    countFormName: 'each',
    aliases: ['PEACH', 'PEACHES'],
    packages: [
      { label: 'each', netG: G.peach },
      { label: 'lb', netG: LB_G, on: 'mass' },
    ],
    source: 'usda',
  }),
  countWithMass('pear', 'Pear', G.pear, {
    uncertaintyPct: 25,
    countFormName: 'each',
    aliases: ['PEAR', 'PEARS'],
    packages: [
      { label: 'each', netG: G.pear },
      { label: 'lb', netG: LB_G, on: 'mass' },
    ],
    source: 'usda',
  }),
  countWithMass('mango', 'Mango', G.mango, {
    uncertaintyPct: 35,
    countFormName: 'each',
    aliases: ['MANGO', 'MANGOS', 'MANGOES'],
    packages: [
      { label: 'each', netG: G.mango },
      { label: 'lb', netG: LB_G, on: 'mass' },
    ],
    source: 'kitchen_avg',
  }),
  countWithMass('pineapple', 'Pineapple', G.pineapple, {
    uncertaintyPct: 35,
    countFormName: 'whole',
    aliases: ['PINEAPPLE'],
    packages: [{ label: 'whole', netG: G.pineapple }],
    source: 'kitchen_avg',
  }),
  countWithMass('watermelon', 'Watermelon', G.watermelon, {
    // Preserve historical form id `watermelon-each` (simpleCount default).
    uncertaintyPct: 40,
    countFormName: 'each',
    aliases: ['WATERMELON'],
    packages: [{ label: 'whole', netG: G.watermelon }],
    source: 'kitchen_avg',
  }),

  // ── Weight: berries, grapes, scoopable greens, pods ─────────────────────
  simpleMass('blueberry', 'Blueberries', 'produce', {
    aliases: ['BLUEBERRY', 'BLUEBERRIES'],
    packages: [{ label: 'pint', netG: 312 }],
  }),
  simpleMass('strawberry', 'Strawberries', 'produce', {
    aliases: ['STRAWBERRY', 'STRAWBERRIES'],
    packages: [{ label: 'lb', netG: LB_G }],
  }),
  simpleMass('raspberry', 'Raspberries', 'produce', {
    aliases: ['RASPBERRY', 'RASPBERRIES'],
    packages: [{ label: 'clamshell_6oz', netG: 6 * OZ_G }],
  }),
  simpleMass('blackberry', 'Blackberries', 'produce', {
    aliases: ['BLACKBERRY', 'BLACKBERRIES'],
    packages: [{ label: 'clamshell_6oz', netG: 6 * OZ_G }],
  }),
  simpleMass('grape', 'Grapes', 'produce', {
    aliases: ['GRAPE', 'GRAPES', 'RED GRAPES', 'GREEN GRAPES'],
    packages: [{ label: 'bag_2lb', netG: 2 * LB_G }],
  }),
  simpleMass('spinach', 'Spinach (fresh)', 'produce', {
    isStaple: true,
    aliases: ['SPINACH', 'FRESH SPINACH', 'BABY SPINACH'],
    packages: [
      { label: 'clamshell_5oz', netG: 5 * OZ_G },
      { label: 'bag_10oz', netG: 10 * OZ_G },
    ],
  }),
  simpleMass('arugula', 'Arugula', 'produce', {
    aliases: ['ARUGULA', 'ROCKET'],
    packages: [{ label: 'clamshell_5oz', netG: 5 * OZ_G }],
  }),
  simpleMass('green-beans', 'Green beans', 'produce', {
    aliases: ['GREEN BEANS', 'STRING BEANS', 'SNAP BEANS'],
    packages: [{ label: 'lb', netG: LB_G }],
  }),
  simpleMass('peas-fresh', 'Peas (fresh shelled)', 'produce', {
    aliases: ['PEAS', 'FRESH PEAS', 'GARDEN PEAS', 'ENGLISH PEAS'],
    packages: [{ label: 'lb', netG: LB_G }],
  }),
  simpleMass('brussels-sprouts', 'Brussels sprouts', 'produce', {
    aliases: ['BRUSSELS SPROUTS', 'BRUSSEL SPROUTS'],
    packages: [{ label: 'bag_1lb', netG: LB_G }],
  }),
  // Mushrooms: sold by weight (8 oz packs); stay mass
  simpleMass('mushroom-white', 'White mushrooms', 'produce', {
    aliases: ['MUSHROOM', 'MUSHROOMS', 'WHITE MUSHROOM', 'BUTTON MUSHROOM'],
    packages: [{ label: 'pack_8oz', netG: 8 * OZ_G }],
  }),
  simpleMass('mushroom-baby-bella', 'Baby bella mushrooms', 'produce', {
    aliases: ['BABY BELLA', 'CREMINI', 'CRIMINI', 'BABY PORTABELLA'],
    packages: [{ label: 'pack_8oz', netG: 8 * OZ_G }],
  }),

  // ── Bunch: herbs + celery + asparagus + kale ────────────────────────────
  bunchWithMass('kale', 'Kale', G.kaleBunch, {
    aliases: ['KALE', 'CURLY KALE', 'TUSCAN KALE', 'LACINATO KALE'],
  }),
  bunchWithMass('celery', 'Celery', G.celeryBunch, {
    aliases: ['CELERY', 'CELERY STALKS'],
  }),
  bunchWithMass('asparagus', 'Asparagus', G.asparagusBunch, {
    aliases: ['ASPARAGUS'],
  }),
  bunchWithMass('parsley-fresh', 'Fresh parsley', G.parsleyBunch, {
    aliases: ['PARSLEY', 'FRESH PARSLEY', 'ITALIAN PARSLEY', 'FLAT LEAF PARSLEY'],
  }),
  bunchWithMass('mint-fresh', 'Fresh mint', G.mintBunch, {
    aliases: ['MINT', 'FRESH MINT'],
  }),
  // Basil / rosemary / thyme often clamshells — still bunch form with high unc
  bunchWithMass('basil-fresh', 'Fresh basil', G.basilBunch, {
    aliases: ['BASIL', 'FRESH BASIL', 'BASIL BUNCH'],
    packages: [
      { label: 'bunch', netG: G.basilBunch },
      { label: 'clamshell', netG: G.basilBunch },
    ],
  }),
  bunchWithMass('rosemary-fresh', 'Fresh rosemary', G.rosemaryBunch, {
    aliases: ['ROSEMARY', 'FRESH ROSEMARY'],
    packages: [
      { label: 'bunch', netG: G.rosemaryBunch },
      { label: 'clamshell', netG: G.rosemaryBunch },
    ],
  }),
  bunchWithMass('thyme-fresh', 'Fresh thyme', G.thymeBunch, {
    aliases: ['THYME', 'FRESH THYME'],
    packages: [
      { label: 'bunch', netG: G.thymeBunch },
      { label: 'clamshell', netG: G.thymeBunch },
    ],
  }),

  // Pre-peeled garlic — retail jar by weight
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
