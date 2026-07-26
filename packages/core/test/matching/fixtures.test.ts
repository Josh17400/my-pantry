import { describe, expect, it } from 'vitest';

import { matchIngredient } from '../../src/matching';
import {
  ALL_FIXTURES,
  FALSE_POSITIVE_RATE_THRESHOLD,
  type FixtureCase,
  fixtureCatalog,
  NEGATIVE_FIXTURES,
  POSITIVE_FIXTURES,
} from './fixtures';

type CaseResult = {
  id: string;
  kind: FixtureCase['kind'];
  falsePositive: boolean;
  correctPositive: boolean;
  detail: string;
};

function evaluateCase(c: FixtureCase): CaseResult {
  const catalog = fixtureCatalog();
  const result = matchIngredient({
    raw: c.raw,
    catalog,
    path: c.path ?? 'receipt',
    householdId: c.householdId,
  });

  if (c.kind === 'negative') {
    const forbidden = new Set(c.mustNotMatchIds ?? []);
    let falsePositive = false;
    // string, not MatchKind — detail later becomes richer templates for diagnostics
    let detail: string = result.kind;

    if (result.kind === 'match') {
      detail = `match:${result.ingredient.id} auto=${result.autoAccept} step=${result.step}`;
      // FP: auto-accepted onto a forbidden near-miss id
      if (result.autoAccept && forbidden.has(result.ingredient.id)) {
        falsePositive = true;
      }
      // FP: any match (even non-auto) onto forbidden when we only care about
      // silent corruption — still count auto only for the rate gate.
      // Non-auto match onto forbidden is safe (UI tap required).
      if (
        c.forbidAutoAccept &&
        result.autoAccept &&
        (forbidden.has(result.ingredient.id) ||
          (c.expectIngredientId !== undefined &&
            result.ingredient.id !== c.expectIngredientId))
      ) {
        falsePositive = true;
      }
    }

    return {
      id: c.id,
      kind: 'negative',
      falsePositive,
      correctPositive: false,
      detail,
    };
  }

  // positive
  let correctPositive = false;
  let falsePositive = false;
  let detail: string = result.kind;

  if (result.kind === 'match') {
    detail = `match:${result.ingredient.id} auto=${result.autoAccept} step=${result.step}`;
    if (
      c.expectIngredientId !== undefined &&
      result.ingredient.id === c.expectIngredientId
    ) {
      correctPositive = true;
    } else if (
      result.autoAccept &&
      c.expectIngredientId !== undefined &&
      result.ingredient.id !== c.expectIngredientId
    ) {
      falsePositive = true;
    }
  } else if (result.kind === 'needs-llm' || result.kind === 'needs-user') {
    // Not a false positive — user/LLM path is safe
    const top = result.candidates[0];
    detail = `${result.kind} top=${top?.ingredient.id ?? 'none'}`;
    if (
      top &&
      c.expectIngredientId !== undefined &&
      top.ingredient.id === c.expectIngredientId
    ) {
      // ranked correctly but not auto — counts as correct for ranking, not FP
      correctPositive = true;
    }
  }

  return {
    id: c.id,
    kind: 'positive',
    falsePositive,
    correctPositive,
    detail,
  };
}

describe('adversarial fixture suite', () => {
  it('negative near-misses never auto-accept forbidden siblings', () => {
    for (const c of NEGATIVE_FIXTURES) {
      const r = evaluateCase(c);
      expect(r.falsePositive, `${c.id}: ${r.detail}`).toBe(false);
    }
  });

  it('positive fixtures rank or match expected ingredients', () => {
    const misses: string[] = [];
    for (const c of POSITIVE_FIXTURES) {
      const r = evaluateCase(c);
      expect(r.falsePositive, `${c.id} FP: ${r.detail}`).toBe(false);
      if (!r.correctPositive) {
        misses.push(`${c.id} → ${r.detail}`);
      }
    }
    // Soft accuracy signal — print misses but require zero FPs above.
    // Allow a few ranking misses; FP gate is the hard release criterion.
    if (misses.length > 0) {
      console.log(
        `[matching fixtures] positive ranking misses (${misses.length}):\n` +
          misses.map((m) => `  - ${m}`).join('\n'),
      );
    }
    // At least half of positives should resolve correctly as a sanity floor
    const correct = POSITIVE_FIXTURES.length - misses.length;
    expect(correct / POSITIVE_FIXTURES.length).toBeGreaterThanOrEqual(0.5);
  });

  it('aggregate false-positive rate ≤ threshold (release gate)', () => {
    const results = ALL_FIXTURES.map(evaluateCase);
    const fpCount = results.filter((r) => r.falsePositive).length;
    const total = results.length;
    const rate = fpCount / total;

    console.log(
      `\n[matching fixtures] false-positive rate = ${fpCount}/${total} = ${(rate * 100).toFixed(2)}% ` +
        `(threshold ${(FALSE_POSITIVE_RATE_THRESHOLD * 100).toFixed(1)}%)`,
    );
    for (const r of results.filter((x) => x.falsePositive)) {
      console.log(`  FP: ${r.id} — ${r.detail}`);
    }

    expect(rate).toBeLessThanOrEqual(FALSE_POSITIVE_RATE_THRESHOLD);
  });
});
