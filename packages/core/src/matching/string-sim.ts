/**
 * Trigram + Levenshtein string similarity — no runtime deps.
 * Deterministic; same inputs → same scores.
 */

/** Character trigrams of `s` (padded). Empty string → empty set. */
export function trigrams(s: string): Set<string> {
  if (s.length === 0) return new Set();
  const padded = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    out.add(padded.slice(i, i + 2 + 1));
  }
  return out;
}

/** Jaccard similarity of character trigram sets in [0, 1]. */
export function trigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const ta = trigrams(a);
  const tb = trigrams(b);
  let inter = 0;
  for (const t of ta) {
    if (tb.has(t)) inter++;
  }
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Classic Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Two-row DP for memory
  const m = b.length;
  let prev = new Array<number>(m + 1);
  let curr = new Array<number>(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j]! + 1, // deletion
        curr[j - 1]! + 1, // insertion
        prev[j - 1]! + cost, // substitution
      );
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[m]!;
}

/**
 * Normalized Levenshtein similarity in [0, 1]:
 * `1 - dist / max(len(a), len(b))`.
 */
export function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Combined fuzzy score in [0, 1].
 * Weight: 0.55 trigram + 0.45 Levenshtein (trigram handles OCR reorder;
 * Levenshtein handles short typos).
 */
export function fuzzyScore(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const t = trigramSimilarity(a, b);
  const l = levenshteinSimilarity(a, b);
  return 0.55 * t + 0.45 * l;
}
