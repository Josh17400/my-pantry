/**
 * Bulk-first receipt review state machine.
 *
 * Non-negotiables:
 * - Nothing enters the pantry unconfirmed (high-confidence is pre-confirmed as accepted).
 * - Allergen-vetoed lines can never be bulk-accepted.
 * - Non-food/tax/discount/total are filtered but never silently dropped.
 * - Every user action increments tapCount (dev metric).
 */

import type { Dimension } from '@larder/core';

import {
  matchIngredient,
  type MatchCatalog,
  type MatchResult,
  type MatchVeto,
} from './core-imports';
import {
  getDefaultFormId,
  getIngredientCategory,
  getIngredientName,
  packagesForIngredient,
} from './match-catalog';
import {
  matchPackageFromLine,
  needsSizeChoice,
  resolveLineQty,
} from './qty';
import type {
  CommitResult,
  LineDisposition,
  NormalizedLineItem,
  PackageChoice,
  ParseSuccessResponse,
  ReviewBucket,
} from './types';

export type ReviewLine = {
  readonly id: string;
  readonly source: NormalizedLineItem;
  readonly bucket: ReviewBucket;
  readonly disposition: LineDisposition;
  readonly ingredientId: string | null;
  readonly ingredientName: string | null;
  readonly formId: string | null;
  readonly category: string | null;
  readonly qtyBase: number | null;
  readonly dim: Dimension | null;
  readonly unitPrice: number | null;
  readonly vetoes: readonly MatchVeto[];
  readonly packageChoices: readonly PackageChoice[];
  readonly selectedPackage: PackageChoice | null;
  readonly matchConfidence: number | null;
  readonly matchStep: string | null;
  /** True when user confirmation should learn an alias. */
  readonly learnAliasOnAccept: boolean;
  readonly candidates: readonly {
    readonly ingredientId: string;
    readonly name: string;
    readonly confidence: number;
  }[];
};

export type ReviewState = {
  readonly attemptId: string;
  readonly storeName: string | null;
  readonly receiptDate: string | null;
  readonly currency: string | null;
  readonly total: number | null;
  readonly shoppingTripId: string;
  readonly lines: readonly ReviewLine[];
  /** Running user-tap counter (dev metric). */
  readonly tapCount: number;
  readonly highCollapsed: boolean;
  readonly filteredCollapsed: boolean;
  readonly warnings: readonly string[];
};

export type ReviewAction =
  | { readonly type: 'bulk-accept-high' }
  | { readonly type: 'bulk-dismiss-filtered' }
  | { readonly type: 'bulk-accept-review-matches' }
  | {
      readonly type: 'bulk-apply-category';
      readonly category: string;
    }
  | { readonly type: 'accept-line'; readonly lineId: string }
  | { readonly type: 'skip-line'; readonly lineId: string }
  | {
      readonly type: 'resolve-package';
      readonly lineId: string;
      readonly packageLabel: string;
    }
  | {
      readonly type: 'select-ingredient';
      readonly lineId: string;
      readonly ingredientId: string;
    }
  | { readonly type: 'toggle-high-collapsed' }
  | { readonly type: 'toggle-filtered-collapsed' }
  | { readonly type: 'expand-high' }
  | { readonly type: 'expand-filtered' };

const FILTERED_TYPES = new Set([
  'non-food',
  'tax',
  'discount',
  'total',
  'unknown',
]);

function newTripId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `trip_${crypto.randomUUID()}`;
  }
  return `trip_${Date.now().toString(36)}`;
}

function hasAllergenVeto(vetoes: readonly MatchVeto[]): boolean {
  return vetoes.includes('allergen');
}

function extractVetoes(result: MatchResult): MatchVeto[] {
  if (result.kind === 'match') return [...result.vetoes];
  return [];
}

function candidatesFrom(result: MatchResult): ReviewLine['candidates'] {
  if (result.kind === 'match') {
    return result.alternates.map((a) => ({
      ingredientId: a.ingredient.id,
      name: a.ingredient.name,
      confidence: a.confidence,
    }));
  }
  if (result.kind === 'needs-llm' || result.kind === 'needs-user') {
    return result.candidates.map((a) => ({
      ingredientId: a.ingredient.id,
      name: a.ingredient.name,
      confidence: a.confidence,
    }));
  }
  return [];
}

/**
 * Classify one food line into a review bucket after matching.
 */
export function classifyMatch(
  line: NormalizedLineItem,
  result: MatchResult,
): {
  bucket: ReviewBucket;
  ingredientId: string | null;
  formId: string | null;
  packageChoices: PackageChoice[];
  selectedPackage: PackageChoice | null;
  vetoes: MatchVeto[];
  matchConfidence: number | null;
  matchStep: string | null;
  learnAliasOnAccept: boolean;
  disposition: LineDisposition;
  qtyBase: number | null;
  dim: Dimension | null;
} {
  if (FILTERED_TYPES.has(line.lineType) && line.lineType !== 'unknown') {
    // unknown stays reviewable below; non-food/tax/discount/total → filtered
  }
  if (
    line.lineType === 'non-food' ||
    line.lineType === 'tax' ||
    line.lineType === 'discount' ||
    line.lineType === 'total'
  ) {
    return {
      bucket: 'filtered',
      ingredientId: null,
      formId: null,
      packageChoices: [],
      selectedPackage: null,
      vetoes: [],
      matchConfidence: null,
      matchStep: null,
      learnAliasOnAccept: false,
      disposition: 'pending',
      qtyBase: null,
      dim: null,
    };
  }

  const vetoes = extractVetoes(result);

  if (result.kind === 'no-match') {
    return {
      bucket: 'unmatched',
      ingredientId: null,
      formId: null,
      packageChoices: [],
      selectedPackage: null,
      vetoes,
      matchConfidence: null,
      matchStep: null,
      learnAliasOnAccept: true,
      disposition: 'pending',
      qtyBase: null,
      dim: null,
    };
  }

  if (result.kind === 'needs-llm' || result.kind === 'needs-user') {
    const top = result.candidates[0];
    return {
      bucket: 'unmatched',
      ingredientId: top?.ingredient.id ?? null,
      formId: top ? (getDefaultFormId(top.ingredient.id) ?? null) : null,
      packageChoices: top ? packagesForIngredient(top.ingredient.id) : [],
      selectedPackage: null,
      vetoes,
      matchConfidence: result.kind === 'needs-llm' ? result.confidence : null,
      matchStep: result.step,
      learnAliasOnAccept: true,
      disposition: 'pending',
      qtyBase: null,
      dim: null,
    };
  }

  // kind === 'match'
  const ingredientId = result.ingredient.id;
  const formId = getDefaultFormId(ingredientId) ?? result.ingredient.defaultFormId;
  const packageChoices = packagesForIngredient(ingredientId);
  const selectedPackage = matchPackageFromLine(line, packageChoices);
  const sizeAmbiguous = needsSizeChoice(line, packageChoices) && !selectedPackage;

  if (hasAllergenVeto(result.vetoes)) {
    const qty = resolveLineQty(line, formId, selectedPackage);
    return {
      bucket: 'allergen-veto',
      ingredientId,
      formId,
      packageChoices,
      selectedPackage,
      vetoes: [...result.vetoes],
      matchConfidence: result.confidence,
      matchStep: result.step,
      learnAliasOnAccept: true,
      disposition: 'pending',
      qtyBase: qty.qtyBase,
      dim: qty.dim,
    };
  }

  if (sizeAmbiguous) {
    return {
      bucket: 'size-ambiguity',
      ingredientId,
      formId,
      packageChoices,
      selectedPackage: null,
      vetoes: [...result.vetoes],
      matchConfidence: result.confidence,
      matchStep: result.step,
      learnAliasOnAccept: !result.autoAccept,
      disposition: 'pending',
      qtyBase: null,
      dim: null,
    };
  }

  const qty = resolveLineQty(line, formId, selectedPackage);

  if (result.autoAccept) {
    return {
      bucket: 'high-auto',
      ingredientId,
      formId: qty.formId,
      packageChoices,
      selectedPackage,
      vetoes: [...result.vetoes],
      matchConfidence: result.confidence,
      matchStep: result.step,
      learnAliasOnAccept: false,
      disposition: 'accepted',
      qtyBase: qty.qtyBase,
      dim: qty.dim,
    };
  }

  return {
    bucket: 'needs-review',
    ingredientId,
    formId: qty.formId,
    packageChoices,
    selectedPackage,
    vetoes: [...result.vetoes],
    matchConfidence: result.confidence,
    matchStep: result.step,
    learnAliasOnAccept: true,
    disposition: 'pending',
    qtyBase: qty.qtyBase,
    dim: qty.dim,
  };
}

export function buildReviewLine(
  line: NormalizedLineItem,
  catalog: MatchCatalog,
  householdId?: string,
): ReviewLine {
  const raw = line.guessedName || line.rawText;
  const queryAllergens =
    line.allergensUnknown
      ? ({ unknownAllergens: true as const, allergens: line.allergens })
      : line.allergens.length > 0
        ? ({ unknownAllergens: false as const, allergens: line.allergens })
        : undefined;

  const result = matchIngredient({
    raw,
    catalog,
    path: 'receipt',
    householdId,
    queryAllergens,
  });

  const classified = classifyMatch(line, result);
  const name =
    classified.ingredientId != null
      ? (getIngredientName(classified.ingredientId) ?? null)
      : null;
  const category =
    classified.ingredientId != null
      ? (getIngredientCategory(classified.ingredientId) ?? null)
      : null;

  return {
    id: line.id,
    source: line,
    bucket: classified.bucket,
    disposition: classified.disposition,
    ingredientId: classified.ingredientId,
    ingredientName: name,
    formId: classified.formId,
    category,
    qtyBase: classified.qtyBase,
    dim: classified.dim,
    unitPrice: line.unitPrice,
    vetoes: classified.vetoes,
    packageChoices: classified.packageChoices,
    selectedPackage: classified.selectedPackage,
    matchConfidence: classified.matchConfidence,
    matchStep: classified.matchStep,
    learnAliasOnAccept: classified.learnAliasOnAccept,
    candidates: candidatesFrom(result),
  };
}

export function buildReviewState(
  parse: ParseSuccessResponse,
  catalog: MatchCatalog,
  options: {
    householdId?: string;
    shoppingTripId?: string;
  } = {},
): ReviewState {
  const lines = parse.items.map((item) =>
    buildReviewLine(item, catalog, options.householdId),
  );
  return {
    attemptId: parse.attemptId,
    storeName: parse.storeName,
    receiptDate: parse.receiptDate,
    currency: parse.currency,
    total: parse.total,
    shoppingTripId: options.shoppingTripId ?? newTripId(),
    lines,
    tapCount: 0,
    highCollapsed: true,
    filteredCollapsed: true,
    warnings: [...parse.warnings],
  };
}

function bump(state: ReviewState, n = 1): ReviewState {
  return { ...state, tapCount: state.tapCount + n };
}

function mapLine(
  state: ReviewState,
  lineId: string,
  fn: (line: ReviewLine) => ReviewLine,
): ReviewState {
  return {
    ...state,
    lines: state.lines.map((l) => (l.id === lineId ? fn(l) : l)),
  };
}

function acceptLineInternal(line: ReviewLine): ReviewLine {
  if (line.bucket === 'filtered') {
    return { ...line, disposition: 'skipped' };
  }
  if (!line.ingredientId || !line.formId || line.qtyBase == null || !line.dim) {
    // cannot accept without resolution
    return line;
  }
  return { ...line, disposition: 'accepted' };
}

/**
 * Reduce a user action. Pure. Increments tapCount for interactive actions.
 */
export function reduceReview(
  state: ReviewState,
  action: ReviewAction,
): ReviewState {
  switch (action.type) {
    case 'toggle-high-collapsed':
      return bump({ ...state, highCollapsed: !state.highCollapsed });
    case 'toggle-filtered-collapsed':
      return bump({ ...state, filteredCollapsed: !state.filteredCollapsed });
    case 'expand-high':
      return bump({ ...state, highCollapsed: false });
    case 'expand-filtered':
      return bump({ ...state, filteredCollapsed: false });

    case 'bulk-accept-high': {
      // High-auto should already be accepted; re-affirm any that slipped.
      // Never touches allergen-veto.
      const next = state.lines.map((l) => {
        if (l.bucket !== 'high-auto') return l;
        if (hasAllergenVeto(l.vetoes)) return l;
        return { ...l, disposition: 'accepted' as const };
      });
      return bump({ ...state, lines: next });
    }

    case 'bulk-dismiss-filtered': {
      const next = state.lines.map((l) =>
        l.bucket === 'filtered'
          ? { ...l, disposition: 'skipped' as const }
          : l,
      );
      return bump({ ...state, lines: next, filteredCollapsed: true });
    }

    case 'bulk-accept-review-matches': {
      // Accept medium/low matches that are ready — never allergen or unresolved size.
      const next = state.lines.map((l) => {
        if (l.disposition !== 'pending') return l;
        if (l.bucket === 'allergen-veto') return l;
        if (l.bucket === 'size-ambiguity') return l;
        if (l.bucket === 'filtered') return l;
        if (l.bucket === 'unmatched' && !l.ingredientId) return l;
        if (l.bucket === 'needs-review' || l.bucket === 'unmatched') {
          if (hasAllergenVeto(l.vetoes)) return l;
          if (
            l.ingredientId &&
            l.formId &&
            l.qtyBase != null &&
            l.dim != null
          ) {
            return { ...l, disposition: 'accepted' as const };
          }
        }
        return l;
      });
      return bump({ ...state, lines: next });
    }

    case 'bulk-apply-category': {
      const next = state.lines.map((l) => {
        if (l.disposition !== 'pending') return l;
        if (l.bucket === 'allergen-veto') return l;
        if (hasAllergenVeto(l.vetoes)) return l;
        if (l.category !== action.category) return l;
        if (
          l.ingredientId &&
          l.formId &&
          l.qtyBase != null &&
          l.dim != null &&
          l.bucket !== 'size-ambiguity'
        ) {
          return { ...l, disposition: 'accepted' as const };
        }
        return l;
      });
      return bump({ ...state, lines: next });
    }

    case 'accept-line': {
      return bump(
        mapLine(state, action.lineId, (l) => {
          if (l.bucket === 'filtered') {
            return { ...l, disposition: 'skipped' };
          }
          return acceptLineInternal(l);
        }),
      );
    }

    case 'skip-line': {
      return bump(
        mapLine(state, action.lineId, (l) => ({
          ...l,
          disposition: 'skipped',
        })),
      );
    }

    case 'resolve-package': {
      return bump(
        mapLine(state, action.lineId, (l) => {
          const pkg =
            l.packageChoices.find((p) => p.label === action.packageLabel) ??
            null;
          if (!pkg || !l.ingredientId) return l;
          const formId = pkg.formId;
          const qty = resolveLineQty(l.source, formId, pkg);
          const stillAllergen =
            l.bucket === 'allergen-veto' || hasAllergenVeto(l.vetoes);
          return {
            ...l,
            selectedPackage: pkg,
            formId: qty.formId,
            qtyBase: qty.qtyBase,
            dim: qty.dim,
            // Size resolved — drop into needs-review (or stay allergen)
            bucket: stillAllergen ? 'allergen-veto' : 'needs-review',
            disposition: 'pending',
          };
        }),
      );
    }

    case 'select-ingredient': {
      return bump(
        mapLine(state, action.lineId, (l) => {
          const formId = getDefaultFormId(action.ingredientId) ?? null;
          if (!formId) {
            return {
              ...l,
              ingredientId: action.ingredientId,
              ingredientName:
                getIngredientName(action.ingredientId) ?? null,
              category: getIngredientCategory(action.ingredientId) ?? null,
              formId: null,
              packageChoices: packagesForIngredient(action.ingredientId),
              selectedPackage: null,
              qtyBase: null,
              dim: null,
              bucket: 'unmatched',
              learnAliasOnAccept: true,
            };
          }
          const packageChoices = packagesForIngredient(action.ingredientId);
          const selectedPackage = matchPackageFromLine(
            l.source,
            packageChoices,
          );
          const sizeAmbiguous =
            needsSizeChoice(l.source, packageChoices) && !selectedPackage;
          if (sizeAmbiguous) {
            return {
              ...l,
              ingredientId: action.ingredientId,
              ingredientName:
                getIngredientName(action.ingredientId) ?? null,
              category: getIngredientCategory(action.ingredientId) ?? null,
              formId,
              packageChoices,
              selectedPackage: null,
              qtyBase: null,
              dim: null,
              bucket: 'size-ambiguity',
              vetoes: [],
              learnAliasOnAccept: true,
              disposition: 'pending',
            };
          }
          const qty = resolveLineQty(l.source, formId, selectedPackage);
          return {
            ...l,
            ingredientId: action.ingredientId,
            ingredientName: getIngredientName(action.ingredientId) ?? null,
            category: getIngredientCategory(action.ingredientId) ?? null,
            formId: qty.formId,
            packageChoices,
            selectedPackage,
            qtyBase: qty.qtyBase,
            dim: qty.dim,
            bucket: 'needs-review',
            vetoes: [],
            learnAliasOnAccept: true,
            disposition: 'pending',
          };
        }),
      );
    }

    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

// ── Queries ────────────────────────────────────────────────────────────────

export function highAutoLines(state: ReviewState): readonly ReviewLine[] {
  return state.lines.filter((l) => l.bucket === 'high-auto');
}

export function filteredLines(state: ReviewState): readonly ReviewLine[] {
  return state.lines.filter((l) => l.bucket === 'filtered');
}

export function attentionLines(state: ReviewState): readonly ReviewLine[] {
  return state.lines.filter(
    (l) =>
      l.bucket !== 'high-auto' &&
      l.bucket !== 'filtered' &&
      l.disposition === 'pending',
  );
}

export function pendingCount(state: ReviewState): number {
  return state.lines.filter((l) => l.disposition === 'pending').length;
}

export function acceptedFoodCount(state: ReviewState): number {
  return state.lines.filter(
    (l) => l.disposition === 'accepted' && l.bucket !== 'filtered',
  ).length;
}

/**
 * Ready to commit when every line is accepted or skipped
 * (no pending dispositions left).
 */
export function canCommit(state: ReviewState): boolean {
  return state.lines.every((l) => l.disposition !== 'pending');
}

export function commitPreview(state: ReviewState): CommitResult {
  const added = acceptedFoodCount(state);
  const skipped = state.lines.length - added;
  return {
    added,
    skipped,
    shoppingTripId: state.shoppingTripId,
    tapCount: state.tapCount,
    message: `Added ${added} item${added === 1 ? '' : 's'} · ${skipped} skipped.`,
  };
}

/** Lines that should write purchase txns. */
export function linesToCommit(state: ReviewState): readonly ReviewLine[] {
  return state.lines.filter(
    (l) =>
      l.disposition === 'accepted' &&
      l.bucket !== 'filtered' &&
      l.ingredientId != null &&
      l.formId != null &&
      l.qtyBase != null &&
      l.dim != null,
  );
}

/** Aliases to learn after successful commit. */
export function aliasesToLearn(
  state: ReviewState,
): readonly { alias: string; ingredientId: string }[] {
  const out: { alias: string; ingredientId: string }[] = [];
  for (const l of linesToCommit(state)) {
    if (!l.learnAliasOnAccept || !l.ingredientId) continue;
    const alias = (l.source.guessedName || l.source.rawText).trim();
    if (alias.length > 0) {
      out.push({ alias, ingredientId: l.ingredientId });
    }
  }
  return out;
}

/**
 * Categories present among pending needs-review lines (for bulk apply).
 */
export function pendingCategories(state: ReviewState): readonly string[] {
  const set = new Set<string>();
  for (const l of attentionLines(state)) {
    if (l.category && l.bucket !== 'allergen-veto') {
      set.add(l.category);
    }
  }
  return [...set].sort();
}
