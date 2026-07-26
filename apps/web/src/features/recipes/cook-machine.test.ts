/**
 * Cook-flow state machine tests — highest-value UI logic.
 * Uses planCook against synthetic pantry / recipe shapes (fixture-style ids).
 */

import type { IngredientForm } from '@larder/core';
import { describe, expect, it } from 'vitest';

import {
  acceptNegativeAndContinue,
  beginCommit,
  buildCookTxns,
  buildUndoTxns,
  cancelNegativePrompt,
  type CookMachineState,
  findNegativeCandidateIndices,
  markCommitSuccess,
  markUndone,
  presentCookStatus,
  requestConfirm,
  setLineActualUsed,
  setLineSkipped,
  startCook,
} from './cook-machine';
import type {
  ConversionContext,
  PantryStockRow,
  Recipe,
} from './core-imports';

const flourForm: IngredientForm = {
  id: 'flour-ap-bulk',
  ingredientId: 'flour-ap',
  form: 'bulk',
  dim: 'mass',
  uncertaintyPct: 0,
};

const milkForm: IngredientForm = {
  id: 'milk-liquid',
  ingredientId: 'milk',
  form: 'liquid',
  dim: 'volume',
  densityGPerMl: 1.03,
  uncertaintyPct: 2,
};

const eggForm: IngredientForm = {
  id: 'egg-whole',
  ingredientId: 'egg',
  form: 'whole',
  dim: 'count',
  gramsPerCount: 50,
  uncertaintyPct: 5,
};

const garlicClove: IngredientForm = {
  id: 'garlic-clove',
  ingredientId: 'garlic',
  form: 'clove',
  dim: 'count',
  gramsPerCount: 3,
  uncertaintyPct: 10,
};

const garlicPowder: IngredientForm = {
  id: 'garlic-powder',
  ingredientId: 'garlic',
  form: 'powder',
  dim: 'mass',
  uncertaintyPct: 5,
};

const forms: IngredientForm[] = [
  flourForm,
  milkForm,
  eggForm,
  garlicClove,
  garlicPowder,
];

const ctx: ConversionContext = { forms, edges: [] };

function recipe(
  id: string,
  title: string,
  servings: number,
  ingredients: Recipe['ingredients'],
): Recipe {
  return {
    id,
    title,
    servings,
    ingredients,
    steps: [{ text: 'Mix and cook.' }],
  };
}

function stock(
  ingredientId: string,
  formId: string,
  qtyBase: number,
  dim: PantryStockRow['dim'],
): PantryStockRow {
  return { ingredientId, formId, qtyBase, dim };
}

const META = {
  householdId: 'local-household',
  deviceId: 'local-device',
  userId: 'local-user',
  occurredAt: '2026-07-26T12:00:00.000Z',
};

describe('presentCookStatus', () => {
  it('covers every planCook status with a label', () => {
    const statuses = [
      'enough',
      'short',
      'not-convertible',
      'not-in-pantry',
      'optional-missing',
      'non-quantified',
    ] as const;
    for (const s of statuses) {
      const p = presentCookStatus(s);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
    }
  });

  it('flags not-convertible as danger and never implies zero', () => {
    const p = presentCookStatus('not-convertible');
    expect(p.tone).toBe('danger');
    expect(p.description.toLowerCase()).toMatch(/never|zero|enter/);
  });
});

describe('startCook + planCook statuses', () => {
  it('maps enough / short / non-quantified / optional-missing / not-in-pantry', () => {
    const r = recipe('r1', 'Pancakes', 2, [
      {
        ingredientId: 'flour-ap',
        formId: flourForm.id,
        rawText: '200 g flour',
        qty: 200,
        unit: 'g',
      },
      {
        ingredientId: 'milk',
        formId: milkForm.id,
        rawText: '500 ml milk',
        qty: 500,
        unit: 'ml',
      },
      {
        ingredientId: 'salt-kosher',
        formId: 'salt-kosher-bulk',
        rawText: 'salt to taste',
        qty: null,
        unit: null,
        nonQuantified: true,
      },
      {
        ingredientId: 'egg',
        formId: eggForm.id,
        rawText: '2 eggs optional',
        qty: 2,
        unit: 'each',
        optional: true,
      },
      {
        ingredientId: 'yogurt-plain',
        formId: 'yogurt-plain-bulk',
        rawText: '100 g yogurt',
        qty: 100,
        unit: 'g',
      },
    ]);

    const pantry = [
      stock('flour-ap', flourForm.id, 500, 'mass'),
      stock('milk', milkForm.id, 200, 'volume'),
      // no eggs, no yogurt
    ];

    const state = startCook({ recipe: r, servings: 2, pantry, ctx });
    expect(state.phase).toBe('preview');
    expect(state.plan?.canCook).toBe(false);

    const byText = (t: string) =>
      state.lines.find((l) => l.rawText.includes(t));

    expect(byText('flour')?.status).toBe('enough');
    expect(byText('flour')?.skipped).toBe(false);
    expect(byText('flour')?.actualUsedBase).toBe(200);

    expect(byText('milk')?.status).toBe('short');
    expect(byText('milk')?.shortfallBase).toBe(300);

    expect(byText('salt')?.status).toBe('non-quantified');
    expect(byText('salt')?.skipped).toBe(true);
    expect(byText('salt')?.actualUsedBase).toBeNull();

    expect(byText('eggs')?.status).toBe('optional-missing');
    expect(byText('yogurt')?.status).toBe('not-in-pantry');
  });

  it('never defaults not-convertible to a zero deduction', () => {
    // Garlic powder in pantry, recipe wants cloves — no edge → not-convertible
    const r = recipe('r2', 'Garlic bread', 1, [
      {
        ingredientId: 'garlic',
        formId: garlicClove.id,
        rawText: '4 cloves garlic',
        qty: 4,
        unit: 'each',
      },
    ]);
    const pantry = [stock('garlic', garlicPowder.id, 20, 'mass')];
    const state = startCook({ recipe: r, servings: 1, pantry, ctx });
    const line = state.lines[0]!;
    expect(line.status).toBe('not-convertible');
    expect(line.needBase).toBeNull();
    expect(line.shortfallBase).toBeNull();
    expect(line.skipped).toBe(true);
    expect(line.actualUsedBase).toBeNull();

    const txns = buildCookTxns(state, META, 'cook_test');
    expect(txns).toHaveLength(0);
  });

  it('substitution group: satisfied member does not require others', () => {
    const r = recipe('r3', 'Oil dish', 1, [
      {
        ingredientId: 'oil-olive',
        formId: 'oil-olive-liquid',
        rawText: '2 tbsp olive oil',
        qty: 30,
        unit: 'ml',
        group: 'fat',
      },
      {
        ingredientId: 'butter',
        formId: 'butter-stick',
        rawText: '2 tbsp butter',
        qty: 28,
        unit: 'g',
        group: 'fat',
      },
    ]);
    const oilForm: IngredientForm = {
      id: 'oil-olive-liquid',
      ingredientId: 'oil-olive',
      form: 'liquid',
      dim: 'volume',
      uncertaintyPct: 0,
    };
    const butterForm: IngredientForm = {
      id: 'butter-stick',
      ingredientId: 'butter',
      form: 'stick',
      dim: 'mass',
      uncertaintyPct: 0,
    };
    const localCtx: ConversionContext = {
      forms: [...forms, oilForm, butterForm],
      edges: [],
    };
    const pantry = [stock('oil-olive', oilForm.id, 100, 'volume')];
    const state = startCook({
      recipe: r,
      servings: 1,
      pantry,
      ctx: localCtx,
    });
    expect(state.plan?.canCook).toBe(true);
    const olive = state.lines.find((l) => l.rawText.includes('olive'))!;
    const butter = state.lines.find((l) => l.rawText.includes('butter'))!;
    expect(olive.status).toBe('enough');
    expect(olive.groupSatisfied).toBe(true);
    expect(butter.groupSatisfied).toBe(true);
  });
});

describe('edit + negative prompt', () => {
  function flourState(have: number, need = 200): CookMachineState {
    const r = recipe('r4', 'Bread', 1, [
      {
        ingredientId: 'flour-ap',
        formId: flourForm.id,
        rawText: `${need} g flour`,
        qty: need,
        unit: 'g',
      },
    ]);
    return startCook({
      recipe: r,
      servings: 1,
      pantry: [stock('flour-ap', flourForm.id, have, 'mass')],
      ctx,
    });
  }

  it('requestConfirm stays preview when stock covers used amount', () => {
    let state = flourState(500, 200);
    state = requestConfirm(state);
    expect(state.phase).toBe('preview');
    expect(state.negativeCandidates).toHaveLength(0);
  });

  it('requestConfirm → negative_prompt when used > have', () => {
    let state = flourState(100, 200);
    // default actualUsed = need 200 > have 100
    expect(findNegativeCandidateIndices(state.lines)).toEqual([0]);
    state = requestConfirm(state);
    expect(state.phase).toBe('negative_prompt');
    expect(state.negativeCandidates).toEqual([0]);
  });

  it('editing actual used down clears negative path', () => {
    let state = flourState(100, 200);
    state = setLineActualUsed(state, 0, 80);
    state = requestConfirm(state);
    expect(state.phase).toBe('preview');
    expect(state.negativeCandidates).toHaveLength(0);
  });

  it('cancelNegativePrompt returns to editable preview', () => {
    let state = flourState(50, 200);
    state = requestConfirm(state);
    expect(state.phase).toBe('negative_prompt');
    state = cancelNegativePrompt(state);
    expect(state.phase).toBe('preview');
  });

  it('acceptNegativeAndContinue allows commit despite negative (no silent clamp)', () => {
    let state = flourState(50, 200);
    state = requestConfirm(state);
    state = acceptNegativeAndContinue(state);
    expect(state.phase).toBe('preview');
    state = beginCommit(state);
    const txns = buildCookTxns(state, META, 'cook_neg');
    expect(txns).toHaveLength(1);
    expect(txns[0]!.kind).toBe('relative');
    if (txns[0]!.kind === 'relative') {
      expect(txns[0]!.deltaBase).toBe(-200);
      // Negative stock is intentional — still full need, not clamped to 50
      expect(txns[0]!.deltaBase).not.toBe(-50);
    }
  });

  it('skip line excludes it from txns', () => {
    let state = flourState(500, 200);
    state = setLineSkipped(state, 0, true);
    const txns = buildCookTxns(state, META, 'cook_skip');
    expect(txns).toHaveLength(0);
  });
});

describe('cookEventId + undo', () => {
  it('all cook txns share the same refId (cookEventId)', () => {
    const r = recipe('r5', 'Duo', 1, [
      {
        ingredientId: 'flour-ap',
        formId: flourForm.id,
        rawText: '100 g flour',
        qty: 100,
        unit: 'g',
      },
      {
        ingredientId: 'milk',
        formId: milkForm.id,
        rawText: '100 ml milk',
        qty: 100,
        unit: 'ml',
      },
    ]);
    const state = startCook({
      recipe: r,
      servings: 1,
      pantry: [
        stock('flour-ap', flourForm.id, 500, 'mass'),
        stock('milk', milkForm.id, 500, 'volume'),
      ],
      ctx,
    });
    const cookEventId = 'cook_shared_1';
    const txns = buildCookTxns(state, META, cookEventId);
    expect(txns.length).toBe(2);
    expect(txns.every((t) => t.refId === cookEventId)).toBe(true);
    expect(txns.every((t) => t.kind === 'relative' && t.reason === 'cook')).toBe(
      true,
    );
  });

  it('undo builds compensating adjust_delta keyed off cook event', () => {
    const r = recipe('r6', 'Simple', 1, [
      {
        ingredientId: 'flour-ap',
        formId: flourForm.id,
        rawText: '100 g flour',
        qty: 100,
        unit: 'g',
      },
    ]);
    let state = startCook({
      recipe: r,
      servings: 1,
      pantry: [stock('flour-ap', flourForm.id, 500, 'mass')],
      ctx,
    });
    const cookEventId = 'cook_undo_1';
    const cookTxns = buildCookTxns(state, META, cookEventId);
    const committed = cookTxns
      .filter((t) => t.kind === 'relative')
      .map((t) => ({
        ingredientId: t.ingredientId,
        formId: t.formId,
        deltaBase: t.kind === 'relative' ? t.deltaBase : 0,
        clientTxnId: t.clientTxnId,
      }));
    state = markCommitSuccess(beginCommit(state), cookEventId, committed);
    expect(state.canUndo).toBe(true);
    expect(state.phase).toBe('done');

    const undoTxns = buildUndoTxns(state, META);
    expect(undoTxns).toHaveLength(1);
    expect(undoTxns[0]!.kind).toBe('relative');
    if (undoTxns[0]!.kind === 'relative') {
      expect(undoTxns[0]!.reason).toBe('adjust_delta');
      expect(undoTxns[0]!.deltaBase).toBe(100); // opposite of -100
      expect(undoTxns[0]!.refId).toBe(`undo-${cookEventId}`);
    }

    state = markUndone(state);
    expect(state.phase).toBe('undone');
    expect(state.canUndo).toBe(false);
  });
});

describe('unknown allergen free-text line', () => {
  it('does not auto-deduct unmatched free text', () => {
    const r = recipe('r7', 'Mystery', 1, [
      {
        rawText: 'a splash of grandma sauce',
        qty: 1,
        unit: 'tbsp',
        unknownAllergens: true,
      },
    ]);
    const state = startCook({ recipe: r, servings: 1, pantry: [], ctx });
    const line = state.lines[0]!;
    expect(line.unknownAllergens).toBe(true);
    expect(line.status).toBe('not-in-pantry');
    expect(line.skipped).toBe(true);
    expect(buildCookTxns(state, META, 'cook_free')).toHaveLength(0);
  });
});
