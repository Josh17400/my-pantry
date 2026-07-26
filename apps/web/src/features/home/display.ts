/**
 * Home-screen display helpers — quantity + provenance + status bands.
 * Consumes @larder/core; does not reimplement stock / provenance math.
 */

import {
  bandConfidence,
  evaluateStock,
  formatQuantity,
  type Confidence,
  type Dimension,
} from '@larder/core';

import type { StatusBand } from '../../ui';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Seed names often carry form notes: "Spinach (fresh)" → "Spinach". */
export function shortIngredientName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

export type ItemDisplayInput = {
  qtyBase: number;
  dim: Dimension;
  parLevelBase: number;
  lowThresholdPct: number;
  lastVerifiedAt: string | null;
  unverifiedCookCount: number;
  expiresAt: string | null;
  /** Prefer count-style labels for eggs-like items */
  formName?: string | null;
};

export type ItemDisplay = {
  quantity: string;
  status: StatusBand;
  statusLabel: string;
  /** 0–1 remaining fraction for freshness bars (expiry-driven when known). */
  freshness: number;
  confidence: Confidence;
  provenanceLabel: string;
};

function daysUntil(iso: string, nowMs: number): number | null {
  const exp = Date.parse(iso);
  if (!Number.isFinite(exp)) return null;
  return Math.ceil((exp - nowMs) / MS_PER_DAY);
}

function formatDaysLeft(days: number): string {
  if (days < 0) return 'Expired';
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  if (days < 7) return `${days} days`;
  if (days < 14) return '1 week';
  if (days < 30) return `${Math.round(days / 7)} weeks`;
  if (days < 60) return '1 month';
  return `${Math.round(days / 30)} months`;
}

/**
 * Human provenance line (SPEC trust layer).
 * verified  → "✓ receipt · 2 days ago"
 * drifting  → "⚠ 3 cooks since last verified"
 * stale     → "⚠ estimated · never verified"
 */
export function formatProvenanceLabel(
  lastVerifiedAt: string | null,
  unverifiedCookCount: number,
  confidence: Confidence,
  nowMs: number = Date.now(),
): string {
  if (confidence === 'stale' && lastVerifiedAt === null) {
    return '⚠ estimated · never verified';
  }
  if (confidence === 'stale') {
    return '⚠ estimated · long unverified';
  }
  if (confidence === 'drifting') {
    if (unverifiedCookCount > 0) {
      const n = unverifiedCookCount;
      return `⚠ ${n} cook${n === 1 ? '' : 's'} since last verified`;
    }
    return '⚠ needs re-check';
  }
  // verified
  if (!lastVerifiedAt) {
    return '✓ verified';
  }
  const verifiedMs = Date.parse(lastVerifiedAt);
  if (!Number.isFinite(verifiedMs)) {
    return '✓ verified';
  }
  const ageDays = Math.max(0, Math.floor((nowMs - verifiedMs) / MS_PER_DAY));
  if (ageDays === 0) return '✓ receipt · today';
  if (ageDays === 1) return '✓ receipt · 1 day ago';
  return `✓ receipt · ${ageDays} days ago`;
}

/**
 * Quantity string with visible confidence when not fully verified.
 * A drifted number must *look* drifted — never bare confident precision.
 */
export function formatQuantityWithProvenance(
  qtyBase: number,
  dim: Dimension,
  confidence: Confidence,
  opts?: { formName?: string | null },
): string {
  let base: string;
  if (dim === 'count' && Number.isFinite(qtyBase)) {
    const n = Math.round(qtyBase);
    // Prefer "6 left" style for countable items
    if (opts?.formName && /each|whole|clove|slice|bag/i.test(opts.formName)) {
      base = n === 1 ? '1 left' : `${n} left`;
    } else {
      base = formatQuantity(qtyBase, dim, { locale: 'metric', maxDecimals: 1 });
      // "6 each" → "6 left" when pure count
      if (base.endsWith(' each')) {
        const num = base.replace(/ each$/, '');
        base = num === '1' ? '1 left' : `${num} left`;
      }
    }
  } else {
    base = formatQuantity(qtyBase, dim, { locale: 'metric', maxDecimals: 1 });
    // Compact: "500 g" → "500g", "250 ml" → "250ml"
    base = base.replace(/(\d+(?:\.\d+)?)\s+(g|kg|mg|ml|l)\b/gi, '$1$2');
  }

  if (confidence === 'verified') {
    return base;
  }
  if (confidence === 'drifting') {
    return `${base} · ⚠`;
  }
  // stale — soft estimate marker
  return `~${base}`;
}

/**
 * Map stock + expiry + provenance into ItemTile props.
 */
export function toItemDisplay(
  item: ItemDisplayInput,
  nowMs: number = Date.now(),
): ItemDisplay {
  const confidence = bandConfidence(
    item.lastVerifiedAt,
    item.unverifiedCookCount,
    nowMs,
  );
  const provenanceLabel = formatProvenanceLabel(
    item.lastVerifiedAt,
    item.unverifiedCookCount,
    confidence,
    nowMs,
  );

  const stock = evaluateStock(item.qtyBase, item.parLevelBase, {
    lowThresholdPct: item.lowThresholdPct,
  });

  const quantity = formatQuantityWithProvenance(
    item.qtyBase,
    item.dim,
    confidence,
    { formName: item.formName },
  );

  let status: StatusBand = 'fresh';
  let statusLabel = 'Plenty';
  let freshness = 1;

  // Stock bands first
  if (stock.status === 'negative' || stock.status === 'out') {
    status = 'critical';
    statusLabel = stock.status === 'negative' ? 'Check stock' : 'Empty';
    freshness = 0;
  } else if (stock.status === 'low') {
    status = 'low';
    statusLabel =
      stock.ratio !== null && stock.ratio <= 0.15
        ? 'Almost empty'
        : 'Getting low';
    freshness = stock.ratio !== null ? Math.max(0.05, stock.ratio) : 0.25;
  } else if (stock.ratio !== null) {
    freshness = Math.min(1, Math.max(0.2, stock.ratio));
  }

  // Expiry overrides status text when more urgent (home-screen first-class)
  if (item.expiresAt) {
    const days = daysUntil(item.expiresAt, nowMs);
    if (days !== null) {
      const expFreshness = Math.max(0, Math.min(1, days / 14));
      freshness = Math.min(freshness, expFreshness);

      if (days < 0) {
        status = 'critical';
        statusLabel = 'Expired';
      } else if (days <= 2) {
        status = 'critical';
        statusLabel = formatDaysLeft(days);
      } else if (days <= 7) {
        // Keep stock critical if worse; else surface expiry as low/critical text
        if (status === 'fresh') {
          status = days <= 3 ? 'critical' : 'low';
        }
        statusLabel = formatDaysLeft(days);
      } else if (status === 'fresh') {
        statusLabel = 'Plenty';
      }
    }
  }

  return {
    quantity,
    status,
    statusLabel,
    freshness,
    confidence,
    provenanceLabel,
  };
}

/** Location card status word from item set. */
export function locationStatusWord(
  items: readonly {
    qtyBase: number;
    parLevelBase: number;
    lowThresholdPct: number;
    expiresAt: string | null;
  }[],
  nowMs: number = Date.now(),
): { word: string; status: StatusBand } {
  if (items.length === 0) {
    return { word: 'Empty', status: 'low' };
  }

  let expiringSoon = 0;
  let lowCount = 0;
  let outCount = 0;

  for (const item of items) {
    const stock = evaluateStock(item.qtyBase, item.parLevelBase, {
      lowThresholdPct: item.lowThresholdPct,
    });
    if (stock.status === 'out' || stock.status === 'negative') outCount += 1;
    else if (stock.status === 'low') lowCount += 1;

    if (item.expiresAt) {
      const days = daysUntil(item.expiresAt, nowMs);
      if (days !== null && days <= 3) expiringSoon += 1;
    }
  }

  if (outCount > 0 || expiringSoon >= 2) {
    return { word: 'Scattered', status: 'critical' };
  }
  if (lowCount > 0 || expiringSoon === 1) {
    return { word: 'Getting low', status: 'low' };
  }
  // Well stocked vs Fresh — fridge leans Fresh, pantry Well stocked
  return { word: 'Well stocked', status: 'fresh' };
}
