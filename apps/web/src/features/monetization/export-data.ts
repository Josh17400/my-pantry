/**
 * Data export — JSON of pantry, recipes, and history.
 * People will not trust an inventory they cannot get out.
 */

import type { DomainRepository } from '../../db/domain-repository';
import type { PantryItemView, RecipeDetail } from '../../db/types';
import type {
  DataExportHistoryEvent,
  DataExportPantryItem,
  DataExportRecipe,
  DataExportV1,
} from './types';

export type ExportInput = {
  readonly householdId: string;
  readonly pantry: readonly PantryItemView[];
  readonly recipes: readonly RecipeDetail[];
  /** Optional ledger / cook history events. */
  readonly history?: readonly DataExportHistoryEvent[];
  readonly exportedAt?: string;
};

/**
 * Build a versioned export object. Pure — easy to unit test.
 */
export function buildDataExport(input: ExportInput): DataExportV1 {
  const exportedAt = input.exportedAt ?? new Date().toISOString();
  return {
    schemaVersion: 1,
    exportedAt,
    app: 'the-good-pantry',
    householdId: input.householdId,
    pantry: input.pantry.map(mapPantry),
    recipes: input.recipes.map(mapRecipe),
    history: input.history ? [...input.history] : [],
  };
}

function mapPantry(item: PantryItemView): DataExportPantryItem {
  return {
    ingredientId: item.ingredientId,
    ingredientName: item.ingredientName,
    formId: item.formId,
    formName: item.formName,
    locationId: item.locationId,
    locationName: item.locationName,
    qtyBase: item.qtyBase,
    dim: item.dim,
    parLevelBase: item.parLevelBase,
    lowThresholdPct: item.lowThresholdPct,
    lastVerifiedAt: item.lastVerifiedAt,
    expiresAt: item.expiresAt,
    updatedAt: item.updatedAt,
  };
}

function mapRecipe(r: RecipeDetail): DataExportRecipe {
  return {
    id: r.id,
    title: r.title,
    servings: r.servings,
    prepMin: r.prepMin ?? null,
    cookMin: r.cookMin ?? null,
    tags: [...(r.tags ?? [])],
    visibility: r.visibility,
    ingredients: (r.ingredients ?? []).map((line) => ({
      rawText: line.rawText,
      qty: line.qty ?? null,
      unit: line.unit ?? null,
      optional: Boolean(line.optional),
      ingredientId: line.ingredientId ?? null,
    })),
    steps: (r.steps ?? []).map((s) => ({
      text: s.text,
      durationSec: s.durationSec ?? null,
    })),
  };
}

/**
 * Validate that a value is a DataExportV1 (or close enough for round-trip).
 */
export function isValidDataExport(value: unknown): value is DataExportV1 {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== 1) return false;
  if (v.app !== 'the-good-pantry') return false;
  if (typeof v.exportedAt !== 'string') return false;
  if (typeof v.householdId !== 'string') return false;
  if (!Array.isArray(v.pantry)) return false;
  if (!Array.isArray(v.recipes)) return false;
  if (!Array.isArray(v.history)) return false;
  return true;
}

export function exportToJsonString(data: DataExportV1, pretty = true): string {
  return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
}

export function parseExportJson(raw: string): DataExportV1 | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValidDataExport(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Load domain data and build export. Best-effort history from cook txns
 * when the repo exposes listTxns — otherwise history is empty.
 */
export async function collectExportFromRepository(
  domain: DomainRepository,
  householdId: string,
): Promise<DataExportV1> {
  const pantry = await domain.listPantryItems(householdId);
  const summaries = await domain.listRecipes(householdId);
  const recipes: RecipeDetail[] = [];
  for (const s of summaries) {
    const full = await domain.getRecipe(s.id);
    if (full) recipes.push(full);
  }

  const history: DataExportHistoryEvent[] = [];
  // Sample history from pantry ingredients (bounded).
  const seen = new Set<string>();
  for (const item of pantry.slice(0, 40)) {
    const key = `${item.ingredientId}:${item.formId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const txns = await domain.listTxnsForIngredient(
        item.ingredientId,
        householdId,
      );
      for (const t of txns.slice(0, 20)) {
        history.push({
          id: t.id,
          kind: t.kind,
          reason: t.reason,
          ingredientId: t.ingredientId,
          formId: t.formId,
          deltaBase: t.kind === 'relative' ? (t.deltaBase ?? null) : null,
          targetBase: t.kind === 'absolute' ? (t.targetBase ?? null) : null,
          occurredAt: t.occurredAt,
          refId: t.refId ?? null,
        });
      }
    } catch {
      /* driver may not support */
    }
  }

  history.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  return buildDataExport({
    householdId,
    pantry,
    recipes,
    history,
  });
}

/** Trigger a browser download of the export JSON. */
export function downloadExportJson(data: DataExportV1, filename?: string): void {
  const name =
    filename ??
    `good-pantry-export-${data.exportedAt.slice(0, 10)}.json`;
  const blob = new Blob([exportToJsonString(data)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
