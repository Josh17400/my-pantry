/**
 * Human-readable labels for grocery line provenance.
 * Status-adjacent copy uses `low` (text), never low-fill.
 */

import type { GrocerySourceKind } from './core-grocery';

export type SourceLabel = {
  kind: GrocerySourceKind;
  /** Short chip text */
  label: string;
  /** Tone for chip styling */
  tone: 'neutral' | 'low' | 'critical' | 'recipe' | 'reorder';
};

const LABELS: Record<GrocerySourceKind, SourceLabel> = {
  manual: { kind: 'manual', label: 'You added', tone: 'neutral' },
  'stock-low': { kind: 'stock-low', label: 'Getting low', tone: 'low' },
  'stock-out': { kind: 'stock-out', label: 'Out', tone: 'critical' },
  'recipe-shortfall': {
    kind: 'recipe-shortfall',
    label: 'Recipe',
    tone: 'recipe',
  },
  reorder: { kind: 'reorder', label: 'Usually buy', tone: 'reorder' },
};

export function sourceLabel(kind: string): SourceLabel {
  if (kind in LABELS) {
    return LABELS[kind as GrocerySourceKind];
  }
  return { kind: 'manual', label: kind, tone: 'neutral' };
}

export function sourceLabelsFor(
  sources: readonly string[],
): readonly SourceLabel[] {
  const seen = new Set<string>();
  const out: SourceLabel[] = [];
  for (const s of sources) {
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(sourceLabel(s));
  }
  return out;
}

/** Chip text color classes — low uses AA-safe `text-low`, never low-fill. */
export function sourceToneClass(tone: SourceLabel['tone']): string {
  switch (tone) {
    case 'low':
      return 'bg-low/10 text-low';
    case 'critical':
      return 'bg-critical/10 text-critical';
    case 'recipe':
      return 'bg-tint-sage/60 text-ink';
    case 'reorder':
      return 'bg-tint-sky/60 text-ink';
    default:
      return 'bg-black/[0.04] text-ink-muted';
  }
}
