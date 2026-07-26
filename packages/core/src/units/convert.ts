/**
 * convert() — graph traversal, never a global scalar.
 *
 * Design
 * -------
 * 1. Same-dimension unit conversion is universal (g ↔ lb needs no form).
 * 2. Cross-dimension needs a form's densityGPerMl / gramsPerCount, or edges.
 * 3. Form-to-form conversion only along declared ConversionEdges.
 * 4. Never throws for an unconvertible pair; never guesses. Returns a result object.
 *
 * Path selection (deterministic tie-break — document and test):
 *   1. Fewest hops (shortest path in edge count).
 *   2. Lowest total accumulated uncertaintyPct.
 *   3. Lexicographically smallest path signature (edge keys joined by " | ").
 *
 * Uncertainty accumulation:
 *   Percentages are added along the path (conservative, strictly increases
 *   on multi-hop when each hop has uncertaintyPct > 0). Using density or
 *   gramsPerCount on a form adds that form's uncertaintyPct once.
 *
 * Cycles: best-cost table per form id; a node is only re-expanded when a
 * strictly better (hops, uncertainty, pathKey) arrival is found — no hang.
 */

import { inverseEdgeKey, uniqueEdgeKeys } from './edge-key';
import { BASE_UNIT, type BaseUnit } from './types';
import {
  dimensionOf,
  resolveUnitId,
  toBaseFactor,
  UNIT_BY_ID,
} from './factors';
import type {
  ConversionEdge,
  ConversionErr,
  ConversionFailReason,
  ConversionResult,
  Dimension,
  IngredientForm,
  UnitId,
} from './types';

export type ConvertInput = {
  readonly value: number;
  readonly fromUnit: string;
  readonly toUnit: string;
  /**
   * Single form context: enables density / gramsPerCount cross-dimension
   * when from and to dimensions differ and no form graph is needed.
   */
  readonly form?: IngredientForm;
  /** Start form for multi-form graph conversion. */
  readonly fromFormId?: string;
  /** End form for multi-form graph conversion. */
  readonly toFormId?: string;
  readonly forms?: readonly IngredientForm[];
  readonly edges?: readonly ConversionEdge[];
};

type PathArrival = {
  readonly formId: string;
  readonly hops: number;
  readonly uncertaintyPct: number;
  /** Running multiplier: resultBase = startBase * factor */
  readonly factor: number;
  readonly path: readonly string[];
  readonly pathKey: string;
};

function fail(reason: ConversionFailReason, detail: string): ConversionErr {
  return { ok: false, reason, detail };
}

function isFiniteNumber(n: number): boolean {
  return typeof n === 'number' && Number.isFinite(n);
}

/** Compare two arrivals: lower hops, then lower uncertainty, then pathKey. */
function isBetter(a: PathArrival, b: PathArrival): boolean {
  if (a.hops !== b.hops) return a.hops < b.hops;
  if (a.uncertaintyPct !== b.uncertaintyPct) {
    return a.uncertaintyPct < b.uncertaintyPct;
  }
  return a.pathKey < b.pathKey;
}

/**
 * Convert `value` from `fromUnit` to `toUnit`, optionally via forms/edges.
 * Never throws for conversion failure; never approximates missing edges.
 */
export function convert(input: ConvertInput): ConversionResult {
  const { value, fromUnit: fromUnitRaw, toUnit: toUnitRaw } = input;

  if (!isFiniteNumber(value)) {
    return fail('non-finite', `value is not finite: ${String(value)}`);
  }

  const fromUnit = resolveUnitId(fromUnitRaw);
  if (!fromUnit) {
    return fail('unknown-unit', `unknown fromUnit: ${JSON.stringify(fromUnitRaw)}`);
  }
  const toUnit = resolveUnitId(toUnitRaw);
  if (!toUnit) {
    return fail('unknown-unit', `unknown toUnit: ${JSON.stringify(toUnitRaw)}`);
  }

  const fromDef = UNIT_BY_ID.get(fromUnit)!;
  const toDef = UNIT_BY_ID.get(toUnit)!;
  const fromDim = fromDef.dim;
  const toDim = toDef.dim;

  const forms = input.forms ?? (input.form ? [input.form] : []);
  const edges = input.edges ?? [];
  const formById = new Map(forms.map((f) => [f.id, f]));

  const fromFormId = input.fromFormId ?? input.form?.id;
  const toFormId = input.toFormId ?? input.form?.id;

  // ── Case A: pure same-dimension unit conversion (no form hop needed) ──
  if (fromDim === toDim) {
    const sameForm =
      fromFormId === undefined ||
      toFormId === undefined ||
      fromFormId === toFormId;
    if (sameForm || edges.length === 0) {
      // If caller asked for different forms but same dim without edges that
      // touch them, only pure unit conversion is valid when forms share dim
      // and we treat them as dimensionally compatible storage units.
      if (
        fromFormId !== undefined &&
        toFormId !== undefined &&
        fromFormId !== toFormId
      ) {
        // Need graph path even within same dim (e.g. different pack sizes)
        const graphResult = convertViaGraph({
          value,
          fromUnit,
          toUnit,
          fromDim,
          toDim,
          fromFormId,
          toFormId,
          formById,
          edges,
        });
        return graphResult;
      }

      const base = value * toBaseFactor(fromUnit);
      const out = base / toBaseFactor(toUnit);
      if (!isFiniteNumber(out)) {
        return fail('non-finite', `conversion produced non-finite result`);
      }
      return {
        ok: true,
        value: out,
        dim: toDim,
        uncertaintyPct: 0,
        path: [],
      };
    }
  }

  // ── Case B: multi-form graph ──────────────────────────────────────────
  if (
    fromFormId !== undefined &&
    toFormId !== undefined &&
    fromFormId !== toFormId
  ) {
    return convertViaGraph({
      value,
      fromUnit,
      toUnit,
      fromDim,
      toDim,
      fromFormId,
      toFormId,
      formById,
      edges,
    });
  }

  // ── Case C: single-form cross-dimension via density / gramsPerCount ───
  if (fromDim !== toDim) {
    const form =
      input.form ??
      (fromFormId !== undefined ? formById.get(fromFormId) : undefined);
    if (!form) {
      return fail(
        'no-path',
        `cross-dimension ${fromDim}→${toDim} requires a form with density or gramsPerCount, or conversion edges`,
      );
    }
    return convertCrossDimWithForm({
      value,
      fromUnit,
      toUnit,
      fromDim,
      toDim,
      form,
    });
  }

  // Same dim already handled; should be unreachable
  return fail('no-path', 'no conversion path');
}

function convertCrossDimWithForm(args: {
  value: number;
  fromUnit: UnitId;
  toUnit: UnitId;
  fromDim: Dimension;
  toDim: Dimension;
  form: IngredientForm;
}): ConversionResult {
  const { value, fromUnit, toUnit, fromDim, toDim, form } = args;

  // Work in base units
  let qty = value * toBaseFactor(fromUnit);
  let currentDim = fromDim;
  let uncertainty = 0;
  const path: string[] = [];

  const step = applyFormBridge(qty, currentDim, toDim, form);
  if (!step.ok) return step;
  qty = step.qty;
  currentDim = step.dim;
  uncertainty += step.uncertaintyPct;
  path.push(...step.path);

  if (currentDim !== toDim) {
    return fail(
      'no-path',
      `form ${form.id} cannot bridge ${fromDim}→${toDim} (need densityGPerMl and/or gramsPerCount)`,
    );
  }

  const out = qty / toBaseFactor(toUnit);
  if (!isFiniteNumber(out)) {
    return fail('non-finite', 'conversion produced non-finite result');
  }
  return {
    ok: true,
    value: out,
    dim: toDim,
    uncertaintyPct: uncertainty,
    path,
  };
}

type BridgeOk = {
  ok: true;
  qty: number;
  dim: Dimension;
  uncertaintyPct: number;
  path: string[];
};

function applyFormBridge(
  qtyInBase: number,
  fromDim: Dimension,
  toDim: Dimension,
  form: IngredientForm,
): BridgeOk | ConversionErr {
  if (fromDim === toDim) {
    return { ok: true, qty: qtyInBase, dim: fromDim, uncertaintyPct: 0, path: [] };
  }

  // volume → mass via density
  if (fromDim === 'volume' && toDim === 'mass') {
    if (form.densityGPerMl === undefined || form.densityGPerMl <= 0) {
      return fail(
        'no-path',
        `form ${form.id} has no densityGPerMl for volume→mass`,
      );
    }
    if (!isFiniteNumber(form.densityGPerMl)) {
      return fail('non-finite', `form ${form.id} densityGPerMl is not finite`);
    }
    return {
      ok: true,
      qty: qtyInBase * form.densityGPerMl,
      dim: 'mass',
      uncertaintyPct: form.uncertaintyPct,
      path: [`density:${form.id}`],
    };
  }

  // mass → volume via density
  if (fromDim === 'mass' && toDim === 'volume') {
    if (form.densityGPerMl === undefined || form.densityGPerMl <= 0) {
      return fail(
        'no-path',
        `form ${form.id} has no densityGPerMl for mass→volume`,
      );
    }
    if (!isFiniteNumber(form.densityGPerMl)) {
      return fail('non-finite', `form ${form.id} densityGPerMl is not finite`);
    }
    return {
      ok: true,
      qty: qtyInBase / form.densityGPerMl,
      dim: 'volume',
      uncertaintyPct: form.uncertaintyPct,
      path: [`density:${form.id}`],
    };
  }

  // count → mass via gramsPerCount
  if (fromDim === 'count' && toDim === 'mass') {
    if (form.gramsPerCount === undefined || form.gramsPerCount <= 0) {
      return fail(
        'no-path',
        `form ${form.id} has no gramsPerCount for count→mass`,
      );
    }
    if (!isFiniteNumber(form.gramsPerCount)) {
      return fail('non-finite', `form ${form.id} gramsPerCount is not finite`);
    }
    return {
      ok: true,
      qty: qtyInBase * form.gramsPerCount,
      dim: 'mass',
      uncertaintyPct: form.uncertaintyPct,
      path: [`count-mass:${form.id}`],
    };
  }

  // mass → count via gramsPerCount
  if (fromDim === 'mass' && toDim === 'count') {
    if (form.gramsPerCount === undefined || form.gramsPerCount <= 0) {
      return fail(
        'no-path',
        `form ${form.id} has no gramsPerCount for mass→count`,
      );
    }
    if (!isFiniteNumber(form.gramsPerCount)) {
      return fail('non-finite', `form ${form.id} gramsPerCount is not finite`);
    }
    return {
      ok: true,
      qty: qtyInBase / form.gramsPerCount,
      dim: 'count',
      uncertaintyPct: form.uncertaintyPct,
      path: [`count-mass:${form.id}`],
    };
  }

  // volume ↔ count needs both density and gramsPerCount (two hops via mass)
  if (
    (fromDim === 'volume' && toDim === 'count') ||
    (fromDim === 'count' && toDim === 'volume')
  ) {
    const viaMass = applyFormBridge(qtyInBase, fromDim, 'mass', form);
    if (!viaMass.ok) return viaMass;
    const toTarget = applyFormBridge(viaMass.qty, 'mass', toDim, form);
    if (!toTarget.ok) return toTarget;
    return {
      ok: true,
      qty: toTarget.qty,
      dim: toDim,
      uncertaintyPct: viaMass.uncertaintyPct + toTarget.uncertaintyPct,
      path: [...viaMass.path, ...toTarget.path],
    };
  }

  return fail(
    'no-path',
    `form ${form.id} cannot bridge ${fromDim}→${toDim}`,
  );
}

function convertViaGraph(args: {
  value: number;
  fromUnit: UnitId;
  toUnit: UnitId;
  fromDim: Dimension;
  toDim: Dimension;
  fromFormId: string;
  toFormId: string;
  formById: Map<string, IngredientForm>;
  edges: readonly ConversionEdge[];
}): ConversionResult {
  const {
    value,
    fromUnit,
    toUnit,
    fromDim,
    toDim,
    fromFormId,
    toFormId,
    formById,
    edges,
  } = args;

  const fromForm = formById.get(fromFormId);
  if (!fromForm) {
    return fail('unknown-form', `unknown fromFormId: ${fromFormId}`);
  }
  const toForm = formById.get(toFormId);
  if (!toForm) {
    return fail('unknown-form', `unknown toFormId: ${toFormId}`);
  }

  // Input unit dim must match from-form dim (or be bridgeable via form props
  // before walking the graph — we require unit dim === form dim for clarity).
  if (fromDim !== fromForm.dim) {
    // Allow if form can bridge unit dim → form dim first
    const bridgeIn = applyFormBridge(
      value * toBaseFactor(fromUnit),
      fromDim,
      fromForm.dim,
      fromForm,
    );
    if (!bridgeIn.ok) {
      return fail(
        'no-path',
        `fromUnit dimension ${fromDim} incompatible with fromForm ${fromFormId} dim ${fromForm.dim}`,
      );
    }
    // Continue with bridged value — rare path; re-enter with adjusted value
    return convertViaGraphInner({
      startBase: bridgeIn.qty,
      preUncertainty: bridgeIn.uncertaintyPct,
      prePath: bridgeIn.path,
      fromForm,
      toForm,
      toUnit,
      toDim,
      formById,
      edges,
    });
  }

  const startBase = value * toBaseFactor(fromUnit);
  return convertViaGraphInner({
    startBase,
    preUncertainty: 0,
    prePath: [],
    fromForm,
    toForm,
    toUnit,
    toDim,
    formById,
    edges,
  });
}

function convertViaGraphInner(args: {
  startBase: number;
  preUncertainty: number;
  prePath: readonly string[];
  fromForm: IngredientForm;
  toForm: IngredientForm;
  toUnit: UnitId;
  toDim: Dimension;
  formById: Map<string, IngredientForm>;
  edges: readonly ConversionEdge[];
}): ConversionResult {
  const {
    startBase,
    preUncertainty,
    prePath,
    fromForm,
    toForm,
    toUnit,
    toDim,
    formById,
    edges,
  } = args;

  // Build adjacency with stable keys. Walk declared edges plus the inverse
  // (1/factor) of every edge not marked oneWay. Inverted edges keep the same
  // uncertaintyPct and a path key that marks the inversion (e.g. `B->A~inv`).
  const keyOf = uniqueEdgeKeys(edges);
  const adj = new Map<string, { edge: ConversionEdge; key: string }[]>();
  for (const e of edges) {
    if (!isFiniteNumber(e.factor) || e.factor === 0) {
      continue; // skip invalid edges; never invent
    }
    const key = keyOf.get(e)!;
    const forwardList = adj.get(e.fromFormId) ?? [];
    forwardList.push({ edge: e, key });
    adj.set(e.fromFormId, forwardList);

    if (!e.oneWay) {
      const invFactor = 1 / e.factor;
      if (!isFiniteNumber(invFactor) || invFactor === 0) continue;
      const invEdge: ConversionEdge = {
        fromFormId: e.toFormId,
        toFormId: e.fromFormId,
        factor: invFactor,
        uncertaintyPct: e.uncertaintyPct,
        source: e.source,
        // Synthetic inverse must not be re-inverted if it ever re-enters this loop.
        oneWay: true,
      };
      const invKey = inverseEdgeKey(key);
      const invList = adj.get(invEdge.fromFormId) ?? [];
      invList.push({ edge: invEdge, key: invKey });
      adj.set(invEdge.fromFormId, invList);
    }
  }
  // Sort outgoing edges by key for deterministic expansion order
  for (const [, list] of adj) {
    list.sort((a, b) => a.key.localeCompare(b.key));
  }

  // Best arrival per form id
  const best = new Map<string, PathArrival>();
  const start: PathArrival = {
    formId: fromForm.id,
    hops: 0,
    uncertaintyPct: 0,
    factor: 1,
    path: [],
    pathKey: '',
  };
  best.set(fromForm.id, start);

  // Worklist: simple array scan; graph is small (seed-scale)
  const queue: PathArrival[] = [start];

  while (queue.length > 0) {
    // Pick best frontier item (fewest hops, then uncertainty, then pathKey)
    let bestIdx = 0;
    for (let i = 1; i < queue.length; i++) {
      if (isBetter(queue[i]!, queue[bestIdx]!)) bestIdx = i;
    }
    const [current] = queue.splice(bestIdx, 1);
    if (!current) break;

    const recorded = best.get(current.formId);
    if (recorded && isBetter(recorded, current)) {
      continue; // superseded
    }

    const outs = adj.get(current.formId) ?? [];
    for (const { edge, key } of outs) {
      if (!formById.has(edge.toFormId)) {
        // Edge to unknown form — skip (caller must register both ends)
        continue;
      }
      if (!isFiniteNumber(edge.factor)) continue;

      const nextPath = [...current.path, key];
      const next: PathArrival = {
        formId: edge.toFormId,
        hops: current.hops + 1,
        uncertaintyPct: current.uncertaintyPct + edge.uncertaintyPct,
        factor: current.factor * edge.factor,
        path: nextPath,
        pathKey: nextPath.join(' | '),
      };

      const prev = best.get(next.formId);
      if (!prev || isBetter(next, prev)) {
        best.set(next.formId, next);
        queue.push(next);
      }
    }
  }

  const arrival = best.get(toForm.id);
  if (!arrival) {
    return fail(
      'no-path',
      `no conversion path from form ${fromForm.id} to ${toForm.id}`,
    );
  }

  // Result is in toForm's base unit (by edge definition)
  let qty = startBase * arrival.factor;
  let currentDim = toForm.dim;
  let uncertainty = preUncertainty + arrival.uncertaintyPct;
  const path = [...prePath, ...arrival.path];

  // If toUnit dimension differs from toForm dim, bridge via toForm props
  if (currentDim !== toDim) {
    const bridge = applyFormBridge(qty, currentDim, toDim, toForm);
    if (!bridge.ok) return bridge;
    qty = bridge.qty;
    currentDim = bridge.dim;
    uncertainty += bridge.uncertaintyPct;
    path.push(...bridge.path);
  }

  if (currentDim !== toDim) {
    return fail(
      'no-path',
      `arrived at form ${toForm.id} dim ${toForm.dim} but target unit is ${toDim}`,
    );
  }

  const out = qty / toBaseFactor(toUnit);
  if (!isFiniteNumber(out)) {
    return fail('non-finite', 'conversion produced non-finite result');
  }

  return {
    ok: true,
    value: out,
    dim: toDim,
    uncertaintyPct: uncertainty,
    path,
  };
}

/**
 * Convert a quantity already in a base unit to another unit of the same dimension.
 * Thin helper for pantry storage paths.
 */
export function convertBaseToUnit(
  baseQty: number,
  dim: Dimension,
  toUnit: string,
): ConversionResult {
  const baseUnit: BaseUnit = BASE_UNIT[dim];
  return convert({ value: baseQty, fromUnit: baseUnit, toUnit });
}

/**
 * Convert a display unit into the dimension's base unit quantity.
 */
export function convertToBase(
  value: number,
  unit: string,
): ConversionResult {
  const dim = dimensionOf(unit);
  if (!dim) {
    return fail('unknown-unit', `unknown unit: ${JSON.stringify(unit)}`);
  }
  const baseUnit = BASE_UNIT[dim];
  return convert({ value, fromUnit: unit, toUnit: baseUnit });
}

/** Public re-export of edge key helper for tests / seed tooling. */
export { uniqueEdgeKeys, edgeKey } from './edge-key';
