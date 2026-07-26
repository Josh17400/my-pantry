/**
 * Provenance display helpers — consume core confidence bands; never invent
 * stock math. A drifted number must look drifted (SPEC trust layer).
 */

import {
  buildProvenance,
  type Confidence,
  type Dimension,
  formatQuantity,
} from '@larder/core';

export type ProvenanceFields = {
  lastVerifiedAt: string | null;
  unverifiedCookCount: number;
};

/** Uncertainty % fed to formatQuantity so stale/drifting amounts lose false precision. */
export function uncertaintyForConfidence(confidence: Confidence): number {
  switch (confidence) {
    case 'verified':
      return 0;
    case 'drifting':
      return 8;
    case 'stale':
      return 20;
    default: {
      const _exhaustive: never = confidence;
      return _exhaustive;
    }
  }
}

/**
 * Human relative age for provenance chips.
 * Examples: "just now", "2 days ago", "3 weeks ago", "never"
 */
export function formatRelativeAge(
  iso: string | null,
  nowMs: number = Date.now(),
): string {
  if (iso === null) return 'never';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'never';

  const deltaMs = Math.max(0, nowMs - t);
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  if (days < 14) return days === 1 ? '1 day ago' : `${days} days ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 8) return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;

  const months = Math.floor(days / 30);
  if (months < 18) return months === 1 ? '1 month ago' : `${months} months ago`;

  const years = Math.floor(days / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

/**
 * SPEC-shaped provenance line:
 *   verified  → "✓ receipt · 2 days ago"
 *   drifting  → "⚠ 3 cooks since verified" | "⚠ verified 5 weeks ago"
 *   stale     → "⚠ estimated · never verified" | "⚠ estimated · last verified …"
 */
export function formatProvenanceLine(
  fields: ProvenanceFields,
  nowMs: number = Date.now(),
): string {
  const prov = buildProvenance(
    fields.lastVerifiedAt,
    fields.unverifiedCookCount,
    new Date(nowMs).toISOString(),
  );

  switch (prov.confidence) {
    case 'verified': {
      const age = formatRelativeAge(fields.lastVerifiedAt, nowMs);
      return `✓ receipt · ${age}`;
    }
    case 'drifting': {
      if (fields.unverifiedCookCount > 0) {
        const n = fields.unverifiedCookCount;
        const cooks = n === 1 ? '1 cook' : `${n} cooks`;
        return `⚠ ${cooks} since verified`;
      }
      const age = formatRelativeAge(fields.lastVerifiedAt, nowMs);
      return `⚠ verified ${age}`;
    }
    case 'stale': {
      if (fields.lastVerifiedAt === null) {
        return '⚠ estimated · never verified';
      }
      if (fields.unverifiedCookCount > 0) {
        const n = fields.unverifiedCookCount;
        const cooks = n === 1 ? '1 cook' : `${n} cooks`;
        return `⚠ estimated · ${cooks} since verified`;
      }
      const age = formatRelativeAge(fields.lastVerifiedAt, nowMs);
      return `⚠ estimated · last verified ${age}`;
    }
    default: {
      const _exhaustive: never = prov.confidence;
      return _exhaustive;
    }
  }
}

/**
 * Quantity in human units with precision capped by confidence.
 * "2.5 lb", not raw "1134 g".
 */
export function formatItemQuantity(
  qtyBase: number,
  dim: Dimension,
  fields: ProvenanceFields,
  nowMs: number = Date.now(),
): string {
  const prov = buildProvenance(
    fields.lastVerifiedAt,
    fields.unverifiedCookCount,
    new Date(nowMs).toISOString(),
  );
  return formatQuantity(qtyBase, dim, {
    uncertaintyPct: uncertaintyForConfidence(prov.confidence),
    locale: 'us',
  });
}

export function confidenceOf(
  fields: ProvenanceFields,
  nowMs: number = Date.now(),
): Confidence {
  return buildProvenance(
    fields.lastVerifiedAt,
    fields.unverifiedCookCount,
    new Date(nowMs).toISOString(),
  ).confidence;
}
