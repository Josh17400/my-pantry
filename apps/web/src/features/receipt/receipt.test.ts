/**
 * Receipt UI logic tests — bulk accept, fingerprint block, allergen veto,
 * non-food collapse, synthetic 40-line tap count.
 */

import { describe, expect, it } from 'vitest';

import { createMemoryAliasStore } from './alias-store';
import { buildPurchaseTxns, commitReceipt } from './commit';
import {
  checkDuplicateReceipt,
  createMemoryFingerprintStore,
  rememberCommittedReceipt,
  receiptFingerprint,
} from './fingerprint-store';
import { buildMatchCatalog } from './match-catalog';
import {
  attentionLines,
  buildReviewState,
  canCommit,
  commitPreview,
  filteredLines,
  highAutoLines,
  linesToCommit,
  reduceReview,
  type ReviewLine,
  type ReviewState,
} from './review-model';
import {
  buildSynthetic40Parse,
  buildSynthetic40ReviewState,
  measureSynthetic40TapPath,
} from './synthetic-40';
import type {
  NormalizedLineItem,
  ParseSuccessResponse,
} from './types';

function food(
  id: string,
  name: string,
  extras: Partial<NormalizedLineItem> = {},
): NormalizedLineItem {
  return {
    id,
    rawText: name,
    guessedName: name,
    quantity: 1,
    unit: 'each',
    massG: 500,
    volumeMl: null,
    packageSize: null,
    unitPrice: 2.5,
    totalPrice: 2.5,
    confidence: 0.9,
    lineType: 'food',
    upc: null,
    parentLineId: null,
    multiBuy: false,
    weighed: false,
    allergens: [],
    allergensUnknown: false,
    ...extras,
  };
}

function parseFrom(
  items: readonly NormalizedLineItem[],
  attemptId = 'a1',
): ParseSuccessResponse {
  return {
    ok: true,
    attemptId,
    status: 'parsed',
    quotaCharged: false,
    storeName: 'Test Market',
    receiptDate: '2026-07-26',
    currency: 'USD',
    total: 42.0,
    items,
    summary: {
      model: 'test',
      gateModel: 'test',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      confidence: { high: 0, medium: 0, low: 0 },
      locale: 'en-US',
      imageCount: 1,
      groceryConfidence: 1,
      schemaRetryUsed: false,
    },
    warnings: [],
  };
}

describe('bulk accept high-confidence', () => {
  it('auto-accepts exact seed matches into high-auto without a tap', () => {
    const catalog = buildMatchCatalog();
    const parse = parseFrom([
      food('1', 'Milk (whole)'),
      food('2', 'Butter'),
      food('3', 'Garlic'),
    ]);
    const state = buildReviewState(parse, catalog, {
      householdId: 'hh',
    });
    const high = highAutoLines(state);
    expect(high.length).toBeGreaterThanOrEqual(1);
    for (const l of high) {
      expect(l.disposition).toBe('accepted');
      expect(l.bucket).toBe('high-auto');
    }
    // No taps yet — auto path
    expect(state.tapCount).toBe(0);
  });

  it('bulk-accept-high reaffirms high lines and increments tap count once', () => {
    const state = buildSynthetic40ReviewState();
    const next = reduceReview(state, { type: 'bulk-accept-high' });
    expect(next.tapCount).toBe(1);
    expect(highAutoLines(next).every((l) => l.disposition === 'accepted')).toBe(
      true,
    );
  });
});

describe('duplicate fingerprint blocking', () => {
  it('blocks exact fingerprint match', () => {
    const store = createMemoryFingerprintStore();
    const candidate = {
      store: 'Costco',
      date: '2026-07-26',
      total: 100.5,
      lineCount: 40,
    };
    rememberCommittedReceipt(candidate, store);
    const decision = checkDuplicateReceipt(candidate, store);
    expect(decision.kind).toBe('block');
    if (decision.kind === 'block') {
      expect(decision.reason).toBe('exact-match');
      expect(decision.fingerprint).toBe(receiptFingerprint(candidate));
    }
  });

  it('warns on near match within 7 days', () => {
    const store = createMemoryFingerprintStore();
    rememberCommittedReceipt(
      {
        store: 'Costco',
        date: '2026-07-20',
        total: 100.5,
        lineCount: 40,
      },
      store,
    );
    const decision = checkDuplicateReceipt(
      {
        store: 'Costco',
        date: '2026-07-22',
        total: 100.5,
        lineCount: 41, // line slop 1
      },
      store,
    );
    expect(decision.kind).toBe('warn');
  });

  it('allows distinct receipts', () => {
    const store = createMemoryFingerprintStore();
    rememberCommittedReceipt(
      {
        store: 'Costco',
        date: '2026-07-20',
        total: 100.5,
        lineCount: 40,
      },
      store,
    );
    const decision = checkDuplicateReceipt(
      {
        store: 'Trader Joe\'s',
        date: '2026-07-26',
        total: 55,
        lineCount: 12,
      },
      store,
    );
    expect(decision.kind).toBe('ok');
  });
});

describe('allergen veto survives bulk actions', () => {
  function withAllergenVeto(state: ReviewState): ReviewState {
    const lines: ReviewLine[] = state.lines.map((l, i) => {
      if (i !== 0) return l;
      return {
        ...l,
        bucket: 'allergen-veto',
        disposition: 'pending',
        ingredientId: l.ingredientId ?? 'milk',
        formId: l.formId ?? 'milk-liquid',
        qtyBase: l.qtyBase ?? 500,
        dim: l.dim ?? 'mass',
        vetoes: ['allergen'],
        learnAliasOnAccept: true,
      };
    });
    return { ...state, lines };
  }

  it('bulk-accept-review-matches never accepts allergen-veto lines', () => {
    let state = buildSynthetic40ReviewState();
    state = withAllergenVeto(state);
    const vetoId = state.lines[0]!.id;
    state = reduceReview(state, { type: 'bulk-accept-review-matches' });
    state = reduceReview(state, { type: 'bulk-accept-high' });
    state = reduceReview(state, {
      type: 'bulk-apply-category',
      category: state.lines[0]!.category ?? 'dairy',
    });
    const line = state.lines.find((l) => l.id === vetoId)!;
    expect(line.bucket).toBe('allergen-veto');
    expect(line.disposition).toBe('pending');
  });

  it('allergen line can only be accepted or skipped per-line', () => {
    let state = buildSynthetic40ReviewState();
    state = withAllergenVeto(state);
    const vetoId = state.lines[0]!.id;
    state = reduceReview(state, { type: 'accept-line', lineId: vetoId });
    expect(state.lines.find((l) => l.id === vetoId)!.disposition).toBe(
      'accepted',
    );
  });
});

describe('non-food collapse', () => {
  it('classifies non-food/tax/discount/total as filtered and never silently drops them', () => {
    const catalog = buildMatchCatalog();
    const parse = parseFrom([
      food('f1', 'Milk (whole)'),
      {
        ...food('nf1', 'PAPER TOWELS'),
        lineType: 'non-food',
        massG: null,
      },
      {
        ...food('t1', 'TAX'),
        lineType: 'tax',
        massG: null,
        unitPrice: null,
        totalPrice: 3.2,
      },
      {
        ...food('d1', 'COUPON'),
        lineType: 'discount',
        massG: null,
        totalPrice: -1,
      },
      {
        ...food('tot', 'TOTAL'),
        lineType: 'total',
        massG: null,
        totalPrice: 40,
      },
    ]);
    const state = buildReviewState(parse, catalog);
    expect(state.lines).toHaveLength(5);
    const filtered = filteredLines(state);
    expect(filtered).toHaveLength(4);
    expect(filtered.every((l) => l.bucket === 'filtered')).toBe(true);
    // Still pending until bulk dismiss — not auto-dropped
    expect(filtered.every((l) => l.disposition === 'pending')).toBe(true);
    expect(state.filteredCollapsed).toBe(true);
  });

  it('bulk-dismiss-filtered skips all filtered in one tap', () => {
    const state = buildSynthetic40ReviewState();
    const next = reduceReview(state, { type: 'bulk-dismiss-filtered' });
    expect(next.tapCount).toBe(1);
    expect(
      filteredLines(next).every((l) => l.disposition === 'skipped'),
    ).toBe(true);
  });
});

describe('synthetic 40-line tap count (headline metric)', () => {
  it('has 28 high / 8 medium / 4 non-food', () => {
    const state = buildSynthetic40ReviewState();
    expect(highAutoLines(state)).toHaveLength(28);
    expect(
      state.lines.filter((l) => l.bucket === 'needs-review'),
    ).toHaveLength(8);
    expect(filteredLines(state)).toHaveLength(4);
    expect(state.lines).toHaveLength(40);
  });

  it('commits in 3 taps: dismiss non-food + accept matches + commit', () => {
    const measured = measureSynthetic40TapPath();
    expect(measured.high).toBe(28);
    expect(measured.medium).toBe(8);
    expect(measured.nonFood).toBe(4);
    expect(measured.reviewTaps).toBe(2);
    expect(measured.tapsWithCommit).toBe(3);
    expect(canCommit(measured.finalState)).toBe(true);
    const preview = commitPreview(measured.finalState);
    expect(preview.added).toBe(36); // 28 high + 8 medium
    expect(preview.skipped).toBe(4);
  });

  it('naive per-line path would be much worse (documented bound)', () => {
    // 8 medium accepts + 4 non-food skips + commit = 13 if no bulk
    // High already auto — so lower bound without bulk for medium/nonfood = 13
    // Red-team worst case was 80–120; we measure bulk path at 3.
    const naiveLowerBound = 8 + 4 + 1;
    const measured = measureSynthetic40TapPath();
    expect(measured.tapsWithCommit).toBeLessThan(naiveLowerBound);
    expect(measured.tapsWithCommit).toBeLessThanOrEqual(3);
  });
});

describe('commit purchase txns', () => {
  it('builds purchase txns with shoppingTripId (refId) and unitPrice', () => {
    const measured = measureSynthetic40TapPath();
    const txns = buildPurchaseTxns(measured.finalState, {
      householdId: 'hh-test',
    });
    expect(txns.length).toBe(36);
    for (const t of txns) {
      expect(t.kind).toBe('relative');
      if (t.kind !== 'relative') continue;
      expect(t.reason).toBe('purchase');
      expect(t.refId).toBe(measured.finalState.shoppingTripId);
      expect(t.deltaBase).toBeGreaterThan(0);
    }
  });

  it('commitReceipt appends txns, learns aliases, records fingerprint', async () => {
    const measured = measureSynthetic40TapPath();
    const appended: unknown[] = [];
    const aliases = createMemoryAliasStore();
    const fps = createMemoryFingerprintStore();

    const res = await commitReceipt({
      state: measured.finalState,
      appendTxn: async (txn) => {
        appended.push(txn);
      },
      householdId: 'hh-learn',
      aliasStore: aliases,
      fingerprintStore: fps,
      localOnly: true,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.result.added).toBe(36);
      expect(res.result.message).toMatch(/Added 36/);
    }
    expect(appended).toHaveLength(36);
    // Medium lines learn aliases
    const learned = aliases.list('hh-learn');
    expect(learned.length).toBeGreaterThan(0);
    // Fingerprint stored
    expect(fps.list().length).toBe(1);
  });

  it('linesToCommit never includes filtered lines', () => {
    const measured = measureSynthetic40TapPath();
    const commit = linesToCommit(measured.finalState);
    expect(commit.every((l) => l.bucket !== 'filtered')).toBe(true);
  });
});

describe('buildSynthetic40Parse shape', () => {
  it('returns 40 items with quotaCharged false', () => {
    const p = buildSynthetic40Parse();
    expect(p.ok).toBe(true);
    expect(p.quotaCharged).toBe(false);
    expect(p.items).toHaveLength(40);
    expect(p.items.filter((i) => i.lineType === 'food')).toHaveLength(36);
    expect(p.items.filter((i) => i.lineType === 'non-food')).toHaveLength(4);
  });
});

describe('attention lines exclude collapsed high and filtered', () => {
  it('attention is only pending non-high non-filtered', () => {
    const state = buildSynthetic40ReviewState();
    const att = attentionLines(state);
    expect(att).toHaveLength(8);
    expect(att.every((l) => l.bucket === 'needs-review')).toBe(true);
  });
});
