/**
 * Cook-flow state machine — pure UI logic over planCook.
 *
 * Non-negotiables:
 * - Preview is always required and always editable before commit.
 * - not-convertible never treated as zero.
 * - optional lines never block.
 * - Going negative prompts "still have some?" — no silent clamp.
 * - All deductions share one cookEventId for unit undo.
 * - Substitutions deduct the substitute (or nothing for free-text Other).
 */

import { type Dimension, formatQuantity, wouldGoNegative } from '@larder/core';

import { newId } from '../../db/id';
import type { AppendTxnInput } from '../../db/types';
import {
  type ConversionContext,
  type CookLineStatus,
  type CookPlan,
  type CookPlanLine,
  type PantryStockRow,
  planCook,
  type Recipe,
} from './core-imports';

/** Txn shape accepted by usePantry().appendTxn */
export type CookTxnInput = AppendTxnInput;

export type CookPhase =
  | 'idle'
  | 'preview'
  | 'negative_prompt'
  | 'committing'
  | 'done'
  | 'error'
  | 'undone';

/** Pantry item used instead of the recipe line — deducted on commit. */
export type PantrySubstitution = {
  readonly kind: 'pantry';
  readonly ingredientId: string;
  readonly formId: string;
  readonly name: string;
  readonly formName: string | null;
  readonly locationName: string | null;
  readonly category: string;
  readonly dim: Dimension;
  readonly haveBase: number;
  /** Amount to deduct in the substitute's base units. null = needs user input. */
  actualUsedBase: number | null;
  readonly amountFromConversion: boolean;
  readonly needsAmount: boolean;
};

/**
 * Free-text substitute not in the pantry — provenance only, nothing deducted.
 */
export type OtherSubstitution = {
  readonly kind: 'other';
  readonly note: string;
};

export type LineSubstitution = PantrySubstitution | OtherSubstitution;

export type CookLineEdit = {
  readonly index: number;
  readonly rawText: string;
  readonly ingredientId?: string;
  readonly formId?: string;
  readonly status: CookLineStatus;
  readonly needBase: number | null;
  readonly haveBase: number | null;
  readonly shortfallBase: number | null;
  readonly uncertaintyPct: number | null;
  readonly convertible: boolean;
  readonly optional: boolean;
  readonly nonQuantified: boolean;
  readonly unknownAllergens: boolean;
  readonly needDim?: Dimension;
  readonly pantryFormId?: string;
  readonly groupSatisfied?: boolean;
  readonly satisfiedByIngredientId?: string;
  /** Amount to deduct in pantry base units (original line). null = no deduction. */
  actualUsedBase: number | null;
  /** User skips deduction (always for non-quantified / not-convertible by default). */
  skipped: boolean;
  /**
   * @deprecated Prefer `substitution`. Kept as a derived display string for
   * grocery notes and older call sites.
   */
  substitutionNote: string;
  /** Real substitution: pantry item (deducts) or free-text Other (no deduct). */
  substitution: LineSubstitution | null;
  sendShortfallToGrocery: boolean;
};

export type CommittedDeduction = {
  readonly ingredientId: string;
  readonly formId: string;
  readonly deltaBase: number;
  readonly clientTxnId: string;
};

export type CookMachineState = {
  phase: CookPhase;
  recipeId: string;
  recipeTitle: string;
  servings: number;
  originalServings: number;
  plan: CookPlan | null;
  lines: CookLineEdit[];
  cookEventId: string | null;
  committed: CommittedDeduction[];
  negativeCandidates: readonly number[];
  error: string | null;
  canUndo: boolean;
};

export type CookCommitMeta = {
  householdId: string;
  deviceId: string;
  userId: string;
  occurredAt?: string;
};

export type StatusPresentation = {
  label: string;
  tone: 'ok' | 'warn' | 'danger' | 'muted' | 'info';
  description: string;
};

/** How each planCook status is presented in the UI. */
export function presentCookStatus(status: CookLineStatus): StatusPresentation {
  switch (status) {
    case 'enough':
      return {
        label: 'Enough',
        tone: 'ok',
        description: 'Pantry covers the planned amount.',
      };
    case 'short':
      return {
        label: 'Short',
        tone: 'warn',
        description: 'Have some, but not enough for the planned amount.',
      };
    case 'not-convertible':
      return {
        label: 'Not convertible',
        tone: 'danger',
        description:
          'No conversion path between recipe unit and pantry form — enter what you used, or skip. Never treated as zero.',
      };
    case 'not-in-pantry':
      return {
        label: 'Missing',
        tone: 'danger',
        description: 'Not found in the pantry.',
      };
    case 'optional-missing':
      return {
        label: 'Optional',
        tone: 'muted',
        description: 'Optional — never blocks a cook.',
      };
    case 'non-quantified':
      return {
        label: 'To taste',
        tone: 'info',
        description: 'Non-quantified — no automatic deduction.',
      };
    default: {
      const _exhaustive: never = status;
      return {
        label: String(_exhaustive),
        tone: 'muted',
        description: '',
      };
    }
  }
}

function noteFromSubstitution(sub: LineSubstitution | null): string {
  if (!sub) return '';
  if (sub.kind === 'other') return sub.note;
  return `used ${sub.name}`;
}

function lineFromPlan(pl: CookPlanLine, index: number): CookLineEdit {
  const nonQuantified = pl.status === 'non-quantified';
  const notConvertible = pl.status === 'not-convertible';
  // Default: deduct planned need when we have a convertible need.
  // not-convertible / non-quantified / unknown free text → no silent zero deduct.
  const canDefaultDeduct =
    pl.convertible &&
    pl.needBase !== null &&
    Number.isFinite(pl.needBase) &&
    Boolean(pl.satisfiedByIngredientId ?? pl.line.ingredientId) &&
    Boolean(pl.pantryFormId ?? pl.line.formId);

  return {
    index,
    rawText: pl.line.rawText,
    ingredientId: pl.satisfiedByIngredientId ?? pl.line.ingredientId,
    formId: pl.pantryFormId ?? pl.line.formId,
    status: pl.status,
    needBase: pl.needBase,
    haveBase: pl.haveBase,
    shortfallBase: pl.shortfallBase,
    uncertaintyPct: pl.uncertaintyPct,
    convertible: pl.convertible,
    optional: Boolean(pl.line.optional),
    nonQuantified,
    unknownAllergens: Boolean(pl.line.unknownAllergens),
    needDim: pl.needDim,
    pantryFormId: pl.pantryFormId,
    groupSatisfied: pl.groupSatisfied,
    satisfiedByIngredientId: pl.satisfiedByIngredientId,
    actualUsedBase: canDefaultDeduct ? pl.needBase : null,
    skipped: nonQuantified || notConvertible || !canDefaultDeduct,
    substitutionNote: '',
    substitution: null,
    sendShortfallToGrocery:
      pl.status === 'short' ||
      pl.status === 'not-in-pantry' ||
      pl.status === 'not-convertible',
  };
}

export function createIdleState(): CookMachineState {
  return {
    phase: 'idle',
    recipeId: '',
    recipeTitle: '',
    servings: 1,
    originalServings: 1,
    plan: null,
    lines: [],
    cookEventId: null,
    committed: [],
    negativeCandidates: [],
    error: null,
    canUndo: false,
  };
}

export function startCook(input: {
  recipe: Recipe;
  servings: number;
  pantry: readonly PantryStockRow[];
  ctx: ConversionContext;
}): CookMachineState {
  const servings =
    Number.isFinite(input.servings) && input.servings > 0
      ? input.servings
      : input.recipe.servings;
  const plan = planCook(input.recipe, servings, input.pantry, input.ctx);
  return {
    phase: 'preview',
    recipeId: input.recipe.id,
    recipeTitle: input.recipe.title,
    servings: plan.servings,
    originalServings: input.recipe.servings,
    plan,
    lines: plan.lines.map(lineFromPlan),
    cookEventId: null,
    committed: [],
    negativeCandidates: [],
    error: null,
    canUndo: false,
  };
}

export function replanCook(
  state: CookMachineState,
  input: {
    recipe: Recipe;
    servings: number;
    pantry: readonly PantryStockRow[];
    ctx: ConversionContext;
  },
): CookMachineState {
  if (state.phase === 'committing' || state.phase === 'done') {
    return state;
  }
  const next = startCook(input);
  // Preserve user edits by rawText+index when possible
  const prevByIndex = new Map(state.lines.map((l) => [l.index, l]));
  const lines = next.lines.map((line) => {
    const prev = prevByIndex.get(line.index);
    if (!prev) return line;
    if (prev.rawText !== line.rawText) return line;
    const substitution = prev.substitution;
    // If a pantry substitute is active, keep original line skipped
    const hasPantrySub = substitution?.kind === 'pantry';
    const hasOtherSub = substitution?.kind === 'other';
    return {
      ...line,
      actualUsedBase:
        hasPantrySub || hasOtherSub
          ? null
          : prev.skipped
            ? line.actualUsedBase
            : prev.actualUsedBase,
      skipped:
        hasPantrySub || hasOtherSub
          ? true
          : prev.skipped && line.status !== 'enough'
            ? prev.skipped
            : line.skipped,
      substitution,
      substitutionNote: prev.substitutionNote || noteFromSubstitution(substitution),
      sendShortfallToGrocery: prev.sendShortfallToGrocery,
    };
  });
  return { ...next, lines };
}

export function setLineActualUsed(
  state: CookMachineState,
  index: number,
  actualUsedBase: number | null,
): CookMachineState {
  if (state.phase !== 'preview' && state.phase !== 'negative_prompt') {
    return state;
  }
  const lines = state.lines.map((line) => {
    if (line.index !== index) return line;
    const sub = line.substitution;
    if (sub?.kind === 'pantry') {
      if (actualUsedBase === null || !Number.isFinite(actualUsedBase)) {
        return {
          ...line,
          substitution: {
            ...sub,
            actualUsedBase: null,
            needsAmount: true,
          },
          skipped: true,
          actualUsedBase: null,
        };
      }
      const clamped = Math.max(0, actualUsedBase);
      return {
        ...line,
        substitution: {
          ...sub,
          actualUsedBase: clamped,
          needsAmount: false,
        },
        skipped: true,
        actualUsedBase: null,
      };
    }
    if (actualUsedBase === null || !Number.isFinite(actualUsedBase)) {
      return { ...line, actualUsedBase: null, skipped: true };
    }
    const clamped = Math.max(0, actualUsedBase);
    return { ...line, actualUsedBase: clamped, skipped: false };
  });
  return {
    ...state,
    phase: 'preview',
    lines,
    negativeCandidates: [],
  };
}

export function setLineSkipped(
  state: CookMachineState,
  index: number,
  skipped: boolean,
): CookMachineState {
  if (state.phase !== 'preview' && state.phase !== 'negative_prompt') {
    return state;
  }
  const lines = state.lines.map((line) => {
    if (line.index !== index) return line;
    // Clearing skip while a substitution is active would double-deduct — clear sub.
    if (skipped) {
      return {
        ...line,
        skipped: true,
        actualUsedBase: null,
      };
    }
    if (line.substitution) {
      // Un-skip means use the original ingredient again
      return {
        ...line,
        skipped: false,
        actualUsedBase: line.needBase ?? line.actualUsedBase ?? 0,
        substitution: null,
        substitutionNote: '',
      };
    }
    return {
      ...line,
      skipped: false,
      actualUsedBase: line.needBase ?? line.actualUsedBase ?? 0,
    };
  });
  return { ...state, phase: 'preview', lines, negativeCandidates: [] };
}

/**
 * Free-text substitution note (legacy). Prefer setLineOtherSubstitution /
 * setLinePantrySubstitution for real deduction behaviour.
 */
export function setLineSubstitution(
  state: CookMachineState,
  index: number,
  note: string,
): CookMachineState {
  if (state.phase !== 'preview' && state.phase !== 'negative_prompt') {
    return state;
  }
  const trimmed = note.trim();
  if (!trimmed) {
    return clearLineSubstitution(state, index);
  }
  return setLineOtherSubstitution(state, index, trimmed);
}

/** Free-text "Other" — provenance only; nothing is deducted. */
export function setLineOtherSubstitution(
  state: CookMachineState,
  index: number,
  note: string,
): CookMachineState {
  if (state.phase !== 'preview' && state.phase !== 'negative_prompt') {
    return state;
  }
  const trimmed = note.trim();
  if (!trimmed) {
    return clearLineSubstitution(state, index);
  }
  const sub: OtherSubstitution = { kind: 'other', note: trimmed };
  const lines = state.lines.map((line) =>
    line.index === index
      ? {
          ...line,
          substitution: sub,
          substitutionNote: trimmed,
          // Other never deducts original or anything else
          skipped: true,
          actualUsedBase: null,
        }
      : line,
  );
  return { ...state, phase: 'preview', lines, negativeCandidates: [] };
}

/** Pantry substitute — deduct the substitute, not the original. */
export function setLinePantrySubstitution(
  state: CookMachineState,
  index: number,
  sub: PantrySubstitution,
): CookMachineState {
  if (state.phase !== 'preview' && state.phase !== 'negative_prompt') {
    return state;
  }
  const lines = state.lines.map((line) =>
    line.index === index
      ? {
          ...line,
          substitution: sub,
          substitutionNote: `used ${sub.name}`,
          // Original is not deducted
          skipped: true,
          actualUsedBase: null,
        }
      : line,
  );
  return { ...state, phase: 'preview', lines, negativeCandidates: [] };
}

export function clearLineSubstitution(
  state: CookMachineState,
  index: number,
): CookMachineState {
  if (state.phase !== 'preview' && state.phase !== 'negative_prompt') {
    return state;
  }
  const lines = state.lines.map((line) => {
    if (line.index !== index) return line;
    const canDefaultDeduct =
      line.convertible &&
      line.needBase !== null &&
      Number.isFinite(line.needBase) &&
      Boolean(line.ingredientId) &&
      Boolean(line.formId ?? line.pantryFormId) &&
      !line.nonQuantified;
    return {
      ...line,
      substitution: null,
      substitutionNote: '',
      skipped: !canDefaultDeduct,
      actualUsedBase: canDefaultDeduct ? line.needBase : null,
    };
  });
  return { ...state, phase: 'preview', lines, negativeCandidates: [] };
}

export function setLineSendToGrocery(
  state: CookMachineState,
  index: number,
  send: boolean,
): CookMachineState {
  if (state.phase !== 'preview' && state.phase !== 'negative_prompt') {
    return state;
  }
  const lines = state.lines.map((line) =>
    line.index === index ? { ...line, sendShortfallToGrocery: send } : line,
  );
  return { ...state, lines };
}

/**
 * Indices where a deduction would go strictly negative.
 * Uses substitute stock when a pantry substitution is active.
 */
export function findNegativeCandidateIndices(
  lines: readonly CookLineEdit[],
): number[] {
  const out: number[] = [];
  for (const line of lines) {
    const sub = line.substitution;
    if (sub?.kind === 'pantry') {
      if (sub.actualUsedBase === null) continue;
      if (wouldGoNegative(sub.haveBase, sub.actualUsedBase)) {
        out.push(line.index);
      }
      continue;
    }
    if (sub?.kind === 'other') continue;
    if (line.skipped || line.actualUsedBase === null) continue;
    if (line.haveBase === null) continue;
    if (wouldGoNegative(line.haveBase, line.actualUsedBase)) {
      out.push(line.index);
    }
  }
  return out;
}

/**
 * Attempt confirm. If any line would go negative → negative_prompt.
 * Otherwise phase stays preview and caller should call beginCommit.
 */
export function requestConfirm(state: CookMachineState): CookMachineState {
  if (state.phase !== 'preview') return state;
  const negativeCandidates = findNegativeCandidateIndices(state.lines);
  if (negativeCandidates.length > 0) {
    return {
      ...state,
      phase: 'negative_prompt',
      negativeCandidates,
      error: null,
    };
  }
  return { ...state, negativeCandidates: [], error: null };
}

export function cancelNegativePrompt(state: CookMachineState): CookMachineState {
  if (state.phase !== 'negative_prompt') return state;
  return {
    ...state,
    phase: 'preview',
    negativeCandidates: [],
  };
}

/** User acknowledges "still have some?" and proceeds despite negatives. */
export function acceptNegativeAndContinue(
  state: CookMachineState,
): CookMachineState {
  if (state.phase !== 'negative_prompt') return state;
  return {
    ...state,
    phase: 'preview',
    // Clear candidates so next requestConfirm won't re-block if still negative —
    // caller uses forceConfirm after this.
    negativeCandidates: [],
    error: null,
  };
}

export function beginCommit(state: CookMachineState): CookMachineState {
  if (state.phase !== 'preview') return state;
  return {
    ...state,
    phase: 'committing',
    error: null,
  };
}

export function buildCookTxns(
  state: CookMachineState,
  meta: CookCommitMeta,
  cookEventId: string,
): CookTxnInput[] {
  const occurredAt = meta.occurredAt ?? new Date().toISOString();
  const txns: CookTxnInput[] = [];

  for (const line of state.lines) {
    const sub = line.substitution;

    // Free-text Other: provenance only — never deduct
    if (sub?.kind === 'other') {
      continue;
    }

    // Pantry substitute: deduct substitute, not original
    if (sub?.kind === 'pantry') {
      if (sub.actualUsedBase === null || sub.actualUsedBase <= 0) continue;
      txns.push({
        clientTxnId: `${cookEventId}:${line.index}:sub:${sub.ingredientId}:${sub.formId}`,
        householdId: meta.householdId,
        ingredientId: sub.ingredientId,
        formId: sub.formId,
        kind: 'relative',
        reason: 'cook',
        deltaBase: -sub.actualUsedBase,
        refId: cookEventId,
        occurredAt,
        deviceId: meta.deviceId,
        userId: meta.userId,
      });
      continue;
    }

    if (line.skipped || line.actualUsedBase === null) continue;
    if (line.actualUsedBase <= 0) continue;
    // not-convertible without user amount stays skipped — never invent 0 deduct
    const ingredientId = line.ingredientId;
    const formId = line.formId ?? line.pantryFormId;
    if (!ingredientId || !formId) continue;

    txns.push({
      clientTxnId: `${cookEventId}:${line.index}:${ingredientId}:${formId}`,
      householdId: meta.householdId,
      ingredientId,
      formId,
      kind: 'relative',
      reason: 'cook',
      deltaBase: -line.actualUsedBase,
      refId: cookEventId,
      occurredAt,
      deviceId: meta.deviceId,
      userId: meta.userId,
    });
  }

  return txns;
}

export function buildUndoTxns(
  state: CookMachineState,
  meta: CookCommitMeta,
): CookTxnInput[] {
  if (!state.cookEventId || state.committed.length === 0) return [];
  const occurredAt = meta.occurredAt ?? new Date().toISOString();
  const undoId = `undo-${state.cookEventId}`;
  return state.committed.map((d, i) => ({
    clientTxnId: `${undoId}:${i}:${d.ingredientId}:${d.formId}`,
    householdId: meta.householdId,
    ingredientId: d.ingredientId,
    formId: d.formId,
    kind: 'relative' as const,
    reason: 'adjust_delta' as const,
    // Compensate the cook delta (which was negative)
    deltaBase: -d.deltaBase,
    refId: undoId,
    occurredAt,
    deviceId: meta.deviceId,
    userId: meta.userId,
  }));
}

export function markCommitSuccess(
  state: CookMachineState,
  cookEventId: string,
  committed: CommittedDeduction[],
): CookMachineState {
  return {
    ...state,
    phase: 'done',
    cookEventId,
    committed,
    canUndo: committed.length > 0,
    error: null,
  };
}

export function markCommitError(
  state: CookMachineState,
  error: string,
): CookMachineState {
  return {
    ...state,
    phase: 'error',
    error,
    canUndo: false,
  };
}

export function markUndone(state: CookMachineState): CookMachineState {
  return {
    ...state,
    phase: 'undone',
    canUndo: false,
    error: null,
  };
}

export function newCookEventId(): string {
  return newId('cook');
}

export function formatBaseQty(
  qty: number | null | undefined,
  dim: Dimension | undefined,
): string {
  if (qty === null || qty === undefined || !Number.isFinite(qty)) return '—';
  if (!dim) {
    return String(Math.round(qty * 1000) / 1000);
  }
  return formatQuantity(qty, dim);
}

export function linesForGrocery(state: CookMachineState): CookLineEdit[] {
  return state.lines.filter((l) => l.sendShortfallToGrocery);
}

/** Lines with an active substitution (for confirm summary). */
export function linesWithSubstitution(
  state: CookMachineState,
): CookLineEdit[] {
  return state.lines.filter((l) => l.substitution != null);
}
