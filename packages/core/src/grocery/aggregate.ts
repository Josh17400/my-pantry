/**
 * Aggregate grocery sources: same ingredient in mixed units → one line
 * with a correct total when convertible; otherwise keep separate and flag why.
 *
 * Ranges use the **high** end for purchase quantity.
 */

import type { Dimension, IngredientForm } from '../domain/types';
import type { ConversionEdge } from '../domain/types';
import { convert } from '../units/convert';
import { formatQuantity } from '../units/format';
import { dimensionOf } from '../units/factors';
import { BASE_UNIT } from '../units/types';
import type { GroceryListLine, GrocerySource, GrocerySourceKind } from './types';

export type AggregateContext = {
  readonly forms: readonly IngredientForm[];
  readonly edges: readonly ConversionEdge[];
  readonly nameById: ReadonlyMap<string, string>;
  readonly categoryById: ReadonlyMap<string, string>;
  readonly locale?: 'us' | 'metric';
};

type NormalizedContribution = {
  readonly source: GrocerySource;
  readonly ingredientId?: string;
  readonly formId?: string;
  readonly qtyBase: number | null;
  readonly dim: Dimension | null;
  readonly convertible: boolean;
  readonly convertFailReason?: string;
  readonly name: string;
  readonly category: string;
};

/**
 * Purchase quantity from a source: prefer qtyBase; else qty/unit;
 * for ranges use **high**.
 */
export function purchaseQtyFromSource(source: GrocerySource): {
  qty: number | null;
  unit: string | null;
  qtyBase: number | null;
  dim: Dimension | null;
} {
  if (source.qtyBase !== undefined && source.dim !== undefined) {
    return {
      qty: null,
      unit: null,
      qtyBase: source.qtyBase,
      dim: source.dim,
    };
  }

  const unit = source.unit ?? null;
  let qty: number | null = source.qty ?? null;
  if (
    source.isRange ||
    (source.qtyHigh !== undefined && source.qtyHigh !== null)
  ) {
    qty = source.qtyHigh ?? source.qty ?? null;
  }

  return { qty, unit, qtyBase: null, dim: null };
}

function resolveName(source: GrocerySource, ctx: AggregateContext): string {
  if (source.name) return source.name;
  if (source.ingredientId) {
    const n = ctx.nameById.get(source.ingredientId);
    if (n) return n;
  }
  if (source.rawText) return source.rawText;
  return source.ingredientId ?? 'Item';
}

function resolveCategory(source: GrocerySource, ctx: AggregateContext): string {
  if (source.category) return source.category;
  if (source.ingredientId) {
    const c = ctx.categoryById.get(source.ingredientId);
    if (c) return c;
  }
  return 'Other';
}

function normalizeSource(
  source: GrocerySource,
  ctx: AggregateContext,
): NormalizedContribution {
  const name = resolveName(source, ctx);
  const category = resolveCategory(source, ctx);
  const purchased = purchaseQtyFromSource(source);

  if (purchased.qtyBase !== null && purchased.dim !== null) {
    return {
      source,
      ingredientId: source.ingredientId,
      formId: source.formId,
      qtyBase: purchased.qtyBase,
      dim: purchased.dim,
      convertible: true,
      name,
      category,
    };
  }

  if (purchased.qty === null || purchased.unit === null) {
    return {
      source,
      ingredientId: source.ingredientId,
      formId: source.formId,
      qtyBase: null,
      dim: null,
      convertible: false,
      convertFailReason: 'non-quantified',
      name,
      category,
    };
  }

  const unitDim = dimensionOf(purchased.unit);
  const form =
    (source.formId && ctx.forms.find((f) => f.id === source.formId)) ||
    undefined;

  // Convert display unit → base of unit dim (or form dim)
  const targetDim: Dimension | null = form?.dim ?? unitDim ?? null;
  if (!targetDim) {
    return {
      source,
      ingredientId: source.ingredientId,
      formId: source.formId,
      qtyBase: null,
      dim: null,
      convertible: false,
      convertFailReason: `unknown unit: ${purchased.unit}`,
      name,
      category,
    };
  }

  const toUnit = BASE_UNIT[targetDim];
  const result = convert({
    value: purchased.qty,
    fromUnit: purchased.unit,
    toUnit,
    form,
    fromFormId: source.formId,
    toFormId: source.formId,
    forms: ctx.forms,
    edges: ctx.edges,
  });

  if (!result.ok) {
    return {
      source,
      ingredientId: source.ingredientId,
      formId: source.formId,
      qtyBase: null,
      dim: null,
      convertible: false,
      convertFailReason: result.detail,
      name,
      category,
    };
  }

  return {
    source,
    ingredientId: source.ingredientId,
    formId: source.formId,
    qtyBase: result.value,
    dim: result.dim,
    convertible: true,
    name,
    category,
  };
}

/**
 * Try to convert qtyBase from fromForm/fromDim into toForm/toDim.
 */
function convertBaseBetweenForms(
  qtyBase: number,
  fromFormId: string | undefined,
  fromDim: Dimension,
  toFormId: string | undefined,
  toDim: Dimension,
  ctx: AggregateContext,
): { ok: true; value: number; uncertaintyPct: number } | { ok: false; detail: string } {
  if (fromDim === toDim && (!fromFormId || !toFormId || fromFormId === toFormId)) {
    return { ok: true, value: qtyBase, uncertaintyPct: 0 };
  }

  const fromUnit = BASE_UNIT[fromDim];
  const toUnit = BASE_UNIT[toDim];
  const result = convert({
    value: qtyBase,
    fromUnit,
    toUnit,
    fromFormId,
    toFormId,
    forms: ctx.forms,
    edges: ctx.edges,
  });

  if (!result.ok) {
    return { ok: false, detail: result.detail };
  }
  return {
    ok: true,
    value: result.value,
    uncertaintyPct: result.uncertaintyPct,
  };
}

function lineId(
  ingredientId: string | undefined,
  formId: string | undefined,
  dim: Dimension | null,
  splitIndex: number,
  name: string,
): string {
  if (ingredientId) {
    return `ing:${ingredientId}|form:${formId ?? '_'}|dim:${dim ?? '_'}|s:${splitIndex}`;
  }
  return `free:${name}|s:${splitIndex}`;
}

type MergeBucket = {
  ingredientId?: string;
  formId?: string;
  dim: Dimension;
  qtyBase: number;
  name: string;
  category: string;
  kinds: Set<GrocerySourceKind>;
  recipeIds: Set<string>;
  notes: string[];
  members: NormalizedContribution[];
};

/**
 * Aggregate sources into grocery lines.
 *
 * Policy:
 * - Group by ingredientId when present.
 * - Within a group, merge contributions that convert into a common form/dim.
 * - If a contribution cannot convert into the group's target, emit a separate
 *   line with `unmerged: true` and reason — never silently sum.
 * - Free-text / no ingredientId: one line each (no forced merge).
 */
export function aggregateSources(
  sources: readonly GrocerySource[],
  ctx: AggregateContext,
): GroceryListLine[] {
  const normalized = sources.map((s) => normalizeSource(s, ctx));

  // Free-text / no ingredientId — each stays its own line
  const free: NormalizedContribution[] = [];
  const byIng = new Map<string, NormalizedContribution[]>();

  for (const n of normalized) {
    if (!n.ingredientId) {
      free.push(n);
      continue;
    }
    const list = byIng.get(n.ingredientId) ?? [];
    list.push(n);
    byIng.set(n.ingredientId, list);
  }

  const lines: GroceryListLine[] = [];

  // Stable ingredient order
  const ingIds = [...byIng.keys()].sort((a, b) => a.localeCompare(b));

  for (const ingId of ingIds) {
    const contribs = byIng.get(ingId)!;
    const buckets: MergeBucket[] = [];
    const unmergedExtras: { n: NormalizedContribution; reason: string }[] = [];

    for (const n of contribs) {
      if (!n.convertible || n.qtyBase === null || n.dim === null) {
        unmergedExtras.push({
          n,
          reason: n.convertFailReason ?? 'not convertible to base',
        });
        continue;
      }

      let placed = false;
      for (const bucket of buckets) {
        const conv = convertBaseBetweenForms(
          n.qtyBase,
          n.formId,
          n.dim,
          bucket.formId,
          bucket.dim,
          ctx,
        );
        if (!conv.ok) continue;

        bucket.qtyBase += conv.value;
        bucket.kinds.add(n.source.kind);
        if (n.source.recipeId) bucket.recipeIds.add(n.source.recipeId);
        if (n.source.note) bucket.notes.push(n.source.note);
        bucket.members.push(n);
        // Prefer a more specific formId if bucket lacked one
        if (!bucket.formId && n.formId) {
          bucket.formId = n.formId;
        }
        placed = true;
        break;
      }

      if (!placed) {
        // Try converting existing buckets into this contribution's form
        let mergedIntoNew = false;
        for (let bi = 0; bi < buckets.length; bi++) {
          const bucket = buckets[bi]!;
          const conv = convertBaseBetweenForms(
            bucket.qtyBase,
            bucket.formId,
            bucket.dim,
            n.formId,
            n.dim,
            ctx,
          );
          if (!conv.ok) continue;

          // Replace bucket with converted sum in n's frame
          bucket.qtyBase = conv.value + n.qtyBase;
          bucket.formId = n.formId ?? bucket.formId;
          bucket.dim = n.dim;
          bucket.kinds.add(n.source.kind);
          if (n.source.recipeId) bucket.recipeIds.add(n.source.recipeId);
          if (n.source.note) bucket.notes.push(n.source.note);
          bucket.members.push(n);
          mergedIntoNew = true;
          break;
        }

        if (!mergedIntoNew) {
          // If there are already buckets that couldn't convert, this is a split
          const kinds = new Set<GrocerySourceKind>([n.source.kind]);
          const recipeIds = new Set<string>();
          if (n.source.recipeId) recipeIds.add(n.source.recipeId);
          const notes: string[] = [];
          if (n.source.note) notes.push(n.source.note);
          buckets.push({
            ingredientId: ingId,
            formId: n.formId,
            dim: n.dim,
            qtyBase: n.qtyBase,
            name: n.name,
            category: n.category,
            kinds,
            recipeIds,
            notes,
            members: [n],
          });
        }
      }
    }

    const split = buckets.length + unmergedExtras.length > 1;

    buckets.forEach((bucket, idx) => {
      const unmerged =
        split &&
        (buckets.length > 1 || unmergedExtras.length > 0);
      const displayQty = formatQuantity(bucket.qtyBase, bucket.dim, {
        locale: ctx.locale ?? 'us',
      });
      lines.push({
        id: lineId(ingId, bucket.formId, bucket.dim, idx, bucket.name),
        ingredientId: ingId,
        formId: bucket.formId,
        name: bucket.name,
        category: bucket.category,
        qtyBase: bucket.qtyBase,
        dim: bucket.dim,
        displayQty,
        sources: [...bucket.kinds].sort(),
        recipeIds: [...bucket.recipeIds].sort(),
        unmerged,
        unmergedReason: unmerged
          ? 'Multiple non-convertible forms for the same ingredient'
          : undefined,
        notes: bucket.notes,
      });
    });

    unmergedExtras.forEach(({ n, reason }, idx) => {
      const splitIndex = buckets.length + idx;
      const displayQty =
        n.qtyBase !== null && n.dim !== null
          ? formatQuantity(n.qtyBase, n.dim, { locale: ctx.locale ?? 'us' })
          : n.source.rawText ||
            (n.source.qty != null && n.source.unit
              ? `${n.source.qtyHigh ?? n.source.qty} ${n.source.unit}`
              : '—');

      lines.push({
        id: lineId(ingId, n.formId, n.dim, splitIndex, n.name),
        ingredientId: ingId,
        formId: n.formId,
        name: n.name,
        category: n.category,
        qtyBase: n.qtyBase,
        dim: n.dim,
        displayQty,
        sources: [n.source.kind],
        recipeIds: n.source.recipeId ? [n.source.recipeId] : [],
        unmerged: true,
        unmergedReason: reason,
        notes: n.source.note ? [n.source.note] : [],
      });
    });
  }

  // Free-text lines
  free.forEach((n, idx) => {
    const displayQty =
      n.qtyBase !== null && n.dim !== null
        ? formatQuantity(n.qtyBase, n.dim, { locale: ctx.locale ?? 'us' })
        : n.source.rawText ||
          (n.source.qty != null && n.source.unit
            ? `${n.source.qtyHigh ?? n.source.qty} ${n.source.unit}`
            : n.name);

    lines.push({
      id: lineId(undefined, n.formId, n.dim, idx, n.name),
      ingredientId: undefined,
      formId: n.formId,
      name: n.name,
      category: n.category,
      qtyBase: n.qtyBase,
      dim: n.dim,
      displayQty,
      sources: [n.source.kind],
      recipeIds: n.source.recipeId ? [n.source.recipeId] : [],
      unmerged: false,
      notes: n.source.note ? [n.source.note] : [],
    });
  });

  // Stable sort: category then name then id
  lines.sort((a, b) => {
    const c = a.category.localeCompare(b.category);
    if (c !== 0) return c;
    const n = a.name.localeCompare(b.name);
    if (n !== 0) return n;
    return a.id.localeCompare(b.id);
  });

  return lines;
}

/** Group lines by aisle (category). */
export function groupByAisle(
  lines: readonly GroceryListLine[],
): { aisle: string; lines: GroceryListLine[] }[] {
  const map = new Map<string, GroceryListLine[]>();
  for (const line of lines) {
    const list = map.get(line.category) ?? [];
    list.push(line);
    map.set(line.category, list);
  }
  const aisles = [...map.keys()].sort((a, b) => {
    // "Other" last
    if (a === 'Other' && b !== 'Other') return 1;
    if (b === 'Other' && a !== 'Other') return -1;
    return a.localeCompare(b);
  });
  return aisles.map((aisle) => ({ aisle, lines: map.get(aisle)! }));
}
