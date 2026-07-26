/**
 * Map core stock evaluation + expiry → design-system StatusBand labels.
 * Status text uses `low` token via StatusText/StatusBadge (never low-fill).
 */

import {
  type Dimension,
  evaluateStock,
  formatQuantity,
  type StockStatus,
} from '@larder/core';

import type { StatusBand } from '../../../ui/tokens';

/** Items expiring within this window appear under the "expiring" filter. */
export const EXPIRING_WITHIN_DAYS = 7;

export type StockUi = {
  band: StatusBand;
  label: string;
  stockStatus: StockStatus;
  /** 0–1 for bars; null when par is unset / non-positive. */
  ratio: number | null;
  isExpiringSoon: boolean;
  daysUntilExpiry: number | null;
};

export type StockDisplayInput = {
  qtyBase: number;
  parLevelBase: number;
  lowThresholdPct: number;
  expiresAt?: string | null;
  isNegative?: boolean;
};

export function daysUntil(
  expiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (!expiresAt) return null;
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return null;
  const ms = t - nowMs;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function isExpiringSoon(
  expiresAt: string | null | undefined,
  nowMs: number = Date.now(),
  withinDays: number = EXPIRING_WITHIN_DAYS,
): boolean {
  const d = daysUntil(expiresAt, nowMs);
  if (d === null) return false;
  return d <= withinDays;
}

function stockLabel(status: StockStatus): string {
  switch (status) {
    case 'ok':
      return 'Plenty';
    case 'low':
      return 'Getting low';
    case 'out':
      return 'Out';
    case 'negative':
      return 'Still have some?';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function stockToBand(status: StockStatus): StatusBand {
  switch (status) {
    case 'ok':
      return 'fresh';
    case 'low':
      return 'low';
    case 'out':
    case 'negative':
      return 'critical';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/**
 * Prefer expiry signal when it is more urgent than stock band
 * (mockups surface "2 days" / "Expires in 5 days" on the row).
 */
export function resolveStockUi(
  input: StockDisplayInput,
  nowMs: number = Date.now(),
): StockUi {
  const evaluation = evaluateStock(input.qtyBase, input.parLevelBase, {
    lowThresholdPct: input.lowThresholdPct,
  });
  const stockStatus = evaluation.status;
  const days = daysUntil(input.expiresAt, nowMs);
  const expiring = isExpiringSoon(input.expiresAt, nowMs);

  let band = stockToBand(stockStatus);
  let label = stockLabel(stockStatus);

  if (stockStatus === 'ok' || stockStatus === 'low') {
    if (days !== null && days < 0) {
      band = 'critical';
      label = 'Expired';
    } else if (days !== null && days <= 2) {
      band = 'critical';
      label = days === 0 ? 'Expires today' : days === 1 ? '1 day left' : `${days} days left`;
    } else if (days !== null && days <= EXPIRING_WITHIN_DAYS) {
      // Keep stock band but surface days when still ok/low
      if (stockStatus === 'ok') {
        band = 'low';
        label = `${days} days left`;
      } else {
        label = `${days} days left`;
      }
    }
  }

  return {
    band,
    label,
    stockStatus,
    ratio: evaluation.ratio,
    isExpiringSoon: expiring,
    daysUntilExpiry: days,
  };
}

/** Par / threshold helpers for detail form display. */
export function formatParQuantity(
  parLevelBase: number,
  dim: Dimension,
): string {
  // Par is a target — show with full available precision (core formatQuantity).
  return formatQuantity(parLevelBase, dim, { locale: 'us', uncertaintyPct: 0 });
}
