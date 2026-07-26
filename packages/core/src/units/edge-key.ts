/**
 * Stable identity for a conversion edge.
 * Used in ConversionResult.path and for lexicographic path tie-breaking.
 *
 * Rule: `${fromFormId}->${toFormId}` when unique for that pair;
 * if multiple edges share the same endpoints, append `|${source}` then
 * `|${factor}` so keys remain distinct and order is deterministic.
 */

import type { ConversionEdge } from '../domain/types';

export function edgeKey(edge: ConversionEdge, disambiguate?: string): string {
  const base = `${edge.fromFormId}->${edge.toFormId}`;
  if (disambiguate) return `${base}|${disambiguate}`;
  return base;
}

/**
 * Path key for an auto-inverted edge (declared a→b, walked as b→a).
 * Makes inversion visible in ConversionResult.path for debugging and
 * deterministic tie-breaking (e.g. `B->A~inv`).
 *
 * Forward keys look like `from->to` or `from->to|disambig`. The inverse
 * swaps endpoints and inserts `~inv` after the pair so lex order stays stable.
 */
export function inverseEdgeKey(forwardKey: string): string {
  const pipe = forwardKey.indexOf('|');
  const pair = pipe >= 0 ? forwardKey.slice(0, pipe) : forwardKey;
  const disambig = pipe >= 0 ? forwardKey.slice(pipe) : '';
  const arrow = pair.indexOf('->');
  if (arrow < 0) return `${forwardKey}~inv`;
  const from = pair.slice(0, arrow);
  const to = pair.slice(arrow + 2);
  return `${to}->${from}~inv${disambig}`;
}

/**
 * Build a map of unique keys for a set of edges.
 * Duplicate endpoint pairs get `|source` (and `|factor` if still colliding).
 */
export function uniqueEdgeKeys(edges: readonly ConversionEdge[]): Map<ConversionEdge, string> {
  const byPair = new Map<string, ConversionEdge[]>();
  for (const e of edges) {
    const pair = `${e.fromFormId}->${e.toFormId}`;
    const list = byPair.get(pair) ?? [];
    list.push(e);
    byPair.set(pair, list);
  }

  const result = new Map<ConversionEdge, string>();
  for (const [, group] of byPair) {
    if (group.length === 1) {
      result.set(group[0]!, edgeKey(group[0]!));
      continue;
    }
    // Disambiguate by source, then factor
    const sourceCounts = new Map<string, number>();
    for (const e of group) {
      sourceCounts.set(e.source, (sourceCounts.get(e.source) ?? 0) + 1);
    }
    for (const e of group) {
      if ((sourceCounts.get(e.source) ?? 0) === 1) {
        result.set(e, edgeKey(e, e.source));
      } else {
        result.set(e, edgeKey(e, `${e.source}|${e.factor}`));
      }
    }
  }
  return result;
}
