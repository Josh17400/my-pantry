/**
 * Synthetic 40-line Costco-class receipt for tap-count measurement.
 * 28 high-confidence (auto-accept), 8 medium (needs review), 4 non-food.
 */

import type { IngredientAlias, MatchCatalog } from './core-imports';
import { seedIngredients } from './core-imports';
import { buildMatchCatalog, getDefaultFormId } from './match-catalog';
import {
  buildReviewState,
  canCommit,
  reduceReview,
  type ReviewState,
} from './review-model';
import type {
  NormalizedLineItem,
  ParseSuccessResponse,
} from './types';

function seedName(id: string): string {
  return seedIngredients.find((i) => i.id === id)?.name ?? id;
}

function foodLine(
  id: string,
  name: string,
  opts: {
    confidence?: number;
    unitPrice?: number;
    massG?: number;
  } = {},
): NormalizedLineItem {
  return {
    id,
    rawText: name.toUpperCase(),
    guessedName: name,
    quantity: 1,
    unit: 'each',
    massG: opts.massG ?? 453.6,
    volumeMl: null,
    packageSize: null,
    unitPrice: opts.unitPrice ?? 3.99,
    totalPrice: opts.unitPrice ?? 3.99,
    confidence: opts.confidence ?? 0.95,
    lineType: 'food',
    upc: null,
    parentLineId: null,
    multiBuy: false,
    weighed: false,
    allergens: [],
    allergensUnknown: false,
  };
}

function nonFoodLine(id: string, name: string): NormalizedLineItem {
  return {
    id,
    rawText: name.toUpperCase(),
    guessedName: name,
    quantity: 1,
    unit: 'each',
    massG: null,
    volumeMl: null,
    packageSize: null,
    unitPrice: 12.99,
    totalPrice: 12.99,
    confidence: 0.9,
    lineType: 'non-food',
    upc: null,
    parentLineId: null,
    multiBuy: false,
    weighed: false,
    allergens: [],
    allergensUnknown: false,
  };
}

/**
 * Seed ingredient ids used for high-confidence auto-accept lines.
 * Names come from seed so real matching also works when not force-bucketed.
 */
const HIGH_IDS = [
  'milk',
  'egg',
  'butter',
  'flour-ap',
  'rice-white',
  'pasta-spaghetti',
  'oil-olive',
  'chicken-breast',
  'ground-beef',
  'cheddar',
  'yogurt-plain',
  'banana',
  'apple',
  'onion',
  'garlic',
  'tomato',
  'potato-russet',
  'carrot',
  'spinach',
  'broccoli',
  'bacon',
  'ham',
  'salmon',
  'parmesan',
  'heavy-cream',
  'sour-cream',
  'mozzarella',
  'celery',
] as const;

/**
 * Medium lines: store-style abbreviations → seed ingredient ids.
 * Deterministic force-bucket uses these; real path learns aliases on accept.
 */
const MEDIUM_RAW: readonly { id: string; raw: string; targetId: string }[] = [
  { id: 'm1', raw: 'HVY CRM', targetId: 'heavy-cream' },
  { id: 'm2', raw: 'SOUR CRM', targetId: 'sour-cream' },
  { id: 'm3', raw: 'CHK BREAST', targetId: 'chicken-breast' },
  { id: 'm4', raw: 'GRND BF', targetId: 'ground-beef' },
  { id: 'm5', raw: 'ROMAINE HD', targetId: 'lettuce-romaine' },
  { id: 'm6', raw: 'XL EGGS', targetId: 'egg' },
  { id: 'm7', raw: 'AP FLOUR 5LB', targetId: 'flour-ap' },
  { id: 'm8', raw: 'XTRA VRG OLV OIL', targetId: 'oil-olive' },
];

function mediumLine(
  id: string,
  raw: string,
  confidence = 0.72,
): NormalizedLineItem {
  return {
    id,
    rawText: raw,
    guessedName: raw,
    quantity: 1,
    unit: 'each',
    massG: 400,
    volumeMl: null,
    packageSize: null,
    unitPrice: 5.49,
    totalPrice: 5.49,
    confidence,
    lineType: 'food',
    upc: null,
    parentLineId: null,
    multiBuy: false,
    weighed: false,
    allergens: [],
    allergensUnknown: false,
  };
}

/**
 * Build a parse response that, after matching with seed catalog + optional
 * user aliases for medium lines, yields 28 high / 8 medium / 4 non-food.
 *
 * Medium lines get **user aliases** pointing at known ingredients with
 * `autoAccept` false path... actually user aliases auto-accept.
 *
 * To get medium (needs-review), we need fuzzy match without auto-accept.
 * Strategy: include medium raw strings that fuzzy to seed names, OR inject
 * lines pre-classified via a custom catalog where global alias is absent
 * and fuzzy scores medium.
 *
 * For a **deterministic** tap metric independent of fuzzy luck, we also export
 * `buildSynthetic40ReviewState` that constructs ReviewState buckets directly.
 */
export function buildSynthetic40Parse(
  attemptId = 'attempt-synthetic-40',
): ParseSuccessResponse {
  const high = HIGH_IDS.slice(0, 28).map((id, i) =>
    foodLine(`h${i + 1}`, seedName(id), { confidence: 0.96, massG: 500 }),
  );
  const medium = MEDIUM_RAW.map((m) => mediumLine(m.id, m.raw));
  const nonFood = [
    nonFoodLine('nf1', 'paper towels'),
    nonFoodLine('nf2', 'laundry detergent'),
    nonFoodLine('nf3', 'trash bags'),
    nonFoodLine('nf4', 'batteries aa'),
  ];

  return {
    ok: true,
    attemptId,
    status: 'parsed',
    quotaCharged: false,
    storeName: 'Costco Wholesale',
    receiptDate: '2026-07-26',
    currency: 'USD',
    total: 187.42,
    items: [...high, ...medium, ...nonFood],
    summary: {
      model: 'synthetic',
      gateModel: 'synthetic',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      confidence: { high: 28, medium: 8, low: 0 },
      locale: 'en-US',
      imageCount: 1,
      groceryConfidence: 0.99,
      schemaRetryUsed: false,
    },
    warnings: [],
  };
}

/**
 * Deterministic review state with exact bucket counts for tap measurement.
 * Bypasses fuzzy variance so the headline metric is reproducible.
 */
export function buildSynthetic40ReviewState(
  catalog?: MatchCatalog,
): ReviewState {
  const parse = buildSynthetic40Parse();
  // Prefill user aliases so medium lines resolve to ingredients without auto-accept.
  // Wait — user aliases auto-accept. So we build from parse then force buckets.
  const cat = catalog ?? buildMatchCatalog();
  let state = buildReviewState(parse, cat, {
    householdId: 'local-household',
    shoppingTripId: 'trip_synthetic_40',
  });

  // Force bucket shape: first 28 food high-auto accepted, next 8 needs-review,
  // last 4 filtered — regardless of matcher variance.
  const foodIds = state.lines
    .filter((l) => l.source.lineType === 'food')
    .map((l) => l.id);
  const highIds = new Set(foodIds.slice(0, 28));
  const medIds = new Set(foodIds.slice(28, 36));

  state = {
    ...state,
    lines: state.lines.map((l) => {
      if (
        l.source.lineType === 'non-food' ||
        l.source.lineType === 'tax' ||
        l.source.lineType === 'discount' ||
        l.source.lineType === 'total'
      ) {
        return {
          ...l,
          bucket: 'filtered' as const,
          disposition: 'pending' as const,
          ingredientId: null,
          formId: null,
          qtyBase: null,
          dim: null,
        };
      }
      if (highIds.has(l.id)) {
        const idx = foodIds.indexOf(l.id);
        const ingredientId =
          l.ingredientId ?? HIGH_IDS[idx] ?? 'milk';
        const formId =
          l.formId ?? getDefaultFormId(ingredientId) ?? `${ingredientId}-bulk`;
        return {
          ...l,
          bucket: 'high-auto' as const,
          disposition: 'accepted' as const,
          ingredientId,
          formId,
          ingredientName: l.ingredientName ?? seedName(ingredientId),
          qtyBase: l.qtyBase ?? 500,
          dim: l.dim ?? ('mass' as const),
          learnAliasOnAccept: false,
          vetoes: [],
        };
      }
      if (medIds.has(l.id)) {
        const medIndex = foodIds.indexOf(l.id) - 28;
        const target = MEDIUM_RAW[medIndex];
        const ingredientId =
          l.ingredientId ?? target?.targetId ?? 'egg';
        const formId =
          l.formId ?? getDefaultFormId(ingredientId) ?? `${ingredientId}-bulk`;
        return {
          ...l,
          bucket: 'needs-review' as const,
          disposition: 'pending' as const,
          ingredientId,
          formId,
          ingredientName: l.ingredientName ?? seedName(ingredientId),
          qtyBase: l.qtyBase ?? 400,
          dim: l.dim ?? ('mass' as const),
          learnAliasOnAccept: true,
          vetoes: [],
        };
      }
      return l;
    }),
  };

  return state;
}

export type TapPathStep = {
  readonly action: string;
  readonly tapsAfter: number;
  readonly pendingAfter: number;
};

/**
 * Optimal bulk-first path for the synthetic 40-line receipt.
 *
 * Expected:
 * 1. Dismiss all non-food (1 tap)
 * 2. Accept all review matches — 8 medium (1 tap)
 * 3. Commit is separate UI action counted by caller
 *
 * High-auto (28) need 0 taps.
 * Headline review taps before commit: **2**.
 * With commit button: **3**.
 */
export function measureSynthetic40TapPath(): {
  readonly reviewTaps: number;
  readonly tapsWithCommit: number;
  readonly path: readonly TapPathStep[];
  readonly finalState: ReviewState;
  readonly high: number;
  readonly medium: number;
  readonly nonFood: number;
} {
  let state = buildSynthetic40ReviewState();
  const high = state.lines.filter((l) => l.bucket === 'high-auto').length;
  const medium = state.lines.filter((l) => l.bucket === 'needs-review').length;
  const nonFood = state.lines.filter((l) => l.bucket === 'filtered').length;

  const path: TapPathStep[] = [];

  state = reduceReview(state, { type: 'bulk-dismiss-filtered' });
  path.push({
    action: 'bulk-dismiss-filtered',
    tapsAfter: state.tapCount,
    pendingAfter: state.lines.filter((l) => l.disposition === 'pending').length,
  });

  state = reduceReview(state, { type: 'bulk-accept-review-matches' });
  path.push({
    action: 'bulk-accept-review-matches',
    tapsAfter: state.tapCount,
    pendingAfter: state.lines.filter((l) => l.disposition === 'pending').length,
  });

  // Commit button (UI)
  const commitTap = state.tapCount + 1;
  path.push({
    action: 'commit',
    tapsAfter: commitTap,
    pendingAfter: 0,
  });

  if (!canCommit(state)) {
    throw new Error('Synthetic 40-line path left pending lines');
  }

  return {
    reviewTaps: state.tapCount,
    tapsWithCommit: commitTap,
    path,
    finalState: state,
    high,
    medium,
    nonFood,
  };
}

/** User aliases that would auto-accept medium store strings on a future scan. */
export function syntheticMediumAliases(
  householdId: string,
): IngredientAlias[] {
  return MEDIUM_RAW.map((m) => ({
    alias: m.raw,
    ingredientId: m.targetId,
    scope: 'user' as const,
    householdId,
  }));
}
