import { DEFAULT_LOW_THRESHOLD_PCT } from './par';
import type {
  StockBrief,
  StockEvaluation,
  StockItemInput,
  StockStatus,
} from './types';

/**
 * Low / out / negative stock evaluation.
 *
 * - OUT  at qty <= epsilon (default 1e-9 in base units)
 * - LOW  at qty/par <= threshold AND not OUT (and qty >= 0)
 * - NEGATIVE at qty < 0 — distinct signal, never clamped
 * - OK   otherwise
 *
 * Negative stock must not be silently clamped to zero and must not hide
 * the negative. UI prompts "still have some?" to recover reality.
 *
 * Batched evaluation only — no per-item push API.
 */

/** Default zero-tolerance for floating base units. */
export const DEFAULT_STOCK_EPSILON = 1e-9;
export const OUT_EPSILON = DEFAULT_STOCK_EPSILON;

export type EvaluateStockOptions = {
  epsilon?: number;
  lowThresholdPct?: number;
};

/**
 * Evaluate a single item's stock status against par.
 */
export function evaluateStock(
  qtyBase: number,
  parLevelBase: number,
  options: EvaluateStockOptions = {},
): StockEvaluation {
  const epsilon = options.epsilon ?? DEFAULT_STOCK_EPSILON;
  const lowThresholdPct =
    options.lowThresholdPct ?? DEFAULT_LOW_THRESHOLD_PCT;

  const needsNegativePrompt = qtyBase < 0;

  let status: StockStatus;
  let ratio: number | null;

  if (parLevelBase > 0) {
    ratio = qtyBase / parLevelBase;
  } else {
    ratio = null;
  }

  if (qtyBase < 0) {
    status = 'negative';
  } else if (qtyBase <= epsilon) {
    status = 'out';
  } else if (
    parLevelBase > 0 &&
    ratio !== null &&
    ratio <= lowThresholdPct
  ) {
    status = 'low';
  } else {
    status = 'ok';
  }

  return {
    status,
    qtyBase,
    parLevelBase,
    ratio,
    lowThresholdPct,
    needsNegativePrompt,
    isNegative: qtyBase < 0,
  };
}

/**
 * Batched evaluation for the daily shopping brief.
 * Returns everything out / low / negative in one pass — one brief, not N pushes.
 */
export function evaluateStockBatch(
  items: readonly StockItemInput[],
): StockBrief {
  const out: StockBrief['out'] = [];
  const low: StockBrief['low'] = [];
  const negative: StockBrief['negative'] = [];

  for (const item of items) {
    const evaluation = evaluateStock(item.qtyBase, item.parLevelBase, {
      epsilon: item.epsilon,
      lowThresholdPct: item.lowThresholdPct,
    });
    const row = { ...evaluation, key: item.key };

    if (evaluation.status === 'negative') {
      negative.push(row);
    } else if (evaluation.status === 'out') {
      out.push(row);
    } else if (evaluation.status === 'low') {
      low.push(row);
    }
  }

  // Brief order: negative (needs prompt) → out → low
  const brief = [...negative, ...out, ...low];

  return { out, low, negative, brief };
}

/** Alias matching brief naming. */
export const evaluateLowOutBatch = evaluateStockBatch;

/**
 * True when cooking/consuming would leave stock strictly below zero.
 * Accepts signed delta (negative = consume) or positive need amount.
 */
export function wouldGoNegative(
  haveBase: number,
  needOrDelta: number,
): boolean {
  if (needOrDelta < 0) {
    return haveBase + needOrDelta < 0;
  }
  return haveBase - needOrDelta < 0;
}

export type NegativeStockSignal = {
  kind: 'negative_stock';
  haveBase: number;
  needBase: number;
  projectedBase: number;
  prompt: 'still_have_some';
};

export function negativeStockSignal(
  haveBase: number,
  needBase: number,
): NegativeStockSignal | null {
  const projectedBase = haveBase - needBase;
  if (projectedBase >= 0) return null;
  return {
    kind: 'negative_stock',
    haveBase,
    needBase,
    projectedBase,
    prompt: 'still_have_some',
  };
}
