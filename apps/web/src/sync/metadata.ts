/**
 * Metadata sync — last-write-wins on updated_at.
 * Only the ledger needs union semantics; recipes / locations / par are LWW.
 */

import { remoteWinsLww, toIso } from './mapping';
import type { SyncLocalPort, SyncRemotePort } from './ports';
import type {
  LocalLocation,
  LocalPantryItem,
  LocalRecipe,
  LocalRecipeLine,
  LocalRecipeStep,
} from './types';

export type MetadataSyncResult = {
  locationsApplied: number;
  recipesApplied: number;
  pantryMetaApplied: number;
  locationsPushed: number;
  recipesPushed: number;
};

function tagsToWire(tags: string | null): unknown {
  if (tags == null || tags === '') return [];
  try {
    return JSON.parse(tags) as unknown;
  } catch {
    return [];
  }
}

function tagsFromWire(tags: unknown): string | null {
  if (tags == null) return null;
  if (typeof tags === 'string') return tags;
  return JSON.stringify(tags);
}

function substitutesToWire(s: string | null): unknown {
  if (s == null || s === '') return [];
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return [];
  }
}

function substitutesFromWire(s: unknown): string | null {
  if (s == null) return null;
  if (typeof s === 'string') return s;
  return JSON.stringify(s);
}

/**
 * Pull remote metadata and apply LWW; push local-newer recipes/locations.
 */
export async function syncMetadata(args: {
  local: SyncLocalPort;
  remote: SyncRemotePort;
  localHouseholdId: string;
  remoteHouseholdId: string;
}): Promise<MetadataSyncResult> {
  const { local, remote, localHouseholdId, remoteHouseholdId } = args;
  let locationsApplied = 0;
  let recipesApplied = 0;
  let pantryMetaApplied = 0;
  let locationsPushed = 0;
  let recipesPushed = 0;

  // ── Locations (remote snapshot wins per id when present; simple replace) ─
  const remoteLocs = await remote.pullLocations(remoteHouseholdId);
  const localLocs = await local.listLocations(localHouseholdId);
  const localById = new Map(localLocs.map((l) => [l.id, l]));

  for (const rl of remoteLocs) {
    const mapped: LocalLocation = {
      id: rl.id,
      householdId: localHouseholdId,
      name: rl.name,
      icon: rl.icon,
      tint: rl.tint,
      parentId: rl.parent_id,
      sortOrder: rl.sort_order,
    };
    // Locations have no updated_at on either side — remote pull overwrites.
    await local.upsertLocation(mapped);
    locationsApplied += 1;
  }

  // Push local-only locations (not on server).
  const remoteIds = new Set(remoteLocs.map((r) => r.id));
  const toPushLocs = localLocs
    .filter((l) => !remoteIds.has(l.id))
    .map((l) => ({
      id: l.id,
      household_id: remoteHouseholdId,
      name: l.name,
      icon: l.icon,
      tint: l.tint,
      parent_id: l.parentId,
      sort_order: l.sortOrder,
    }));
  if (toPushLocs.length > 0) {
    await remote.upsertLocations(toPushLocs);
    locationsPushed = toPushLocs.length;
  }
  void localById;

  // ── Recipes LWW on updated_at ───────────────────────────────────────────
  const remoteRecipes = await remote.pullRecipes(remoteHouseholdId);
  const localRecipes = await local.listRecipes(localHouseholdId);
  const localRecipeById = new Map(localRecipes.map((r) => [r.id, r]));
  const remoteRecipeById = new Map(remoteRecipes.map((r) => [r.id, r]));

  for (const rr of remoteRecipes) {
    const localRecipe = localRecipeById.get(rr.id);
    const remoteUpdated = toIso(rr.updated_at) ?? rr.updated_at;
    if (localRecipe && !remoteWinsLww(localRecipe.updatedAt, remoteUpdated)) {
      continue;
    }

    const linesRemote = await remote.pullRecipeLines(rr.id);
    const stepsRemote = await remote.pullRecipeSteps(rr.id);

    const recipe: LocalRecipe = {
      id: rr.id,
      householdId: localHouseholdId,
      title: rr.title,
      servings: rr.servings,
      yieldNote: rr.yield_note,
      prepMin: rr.prep_min,
      cookMin: rr.cook_min,
      authorId: rr.author_id,
      visibility: rr.visibility,
      forkedFrom: rr.forked_from,
      tags: tagsFromWire(rr.tags),
      imageUrl: rr.image_url,
      createdAt: toIso(rr.created_at) ?? rr.created_at,
      updatedAt: remoteUpdated,
    };

    const lines: LocalRecipeLine[] = linesRemote.map((line) => ({
      id: line.id,
      recipeId: line.recipe_id,
      sortOrder: line.sort_order,
      ingredientId: line.ingredient_id,
      formId: line.form_id,
      rawText: line.raw_text,
      qty: line.qty,
      unit: line.unit,
      optional: Boolean(line.optional),
      groupId: line.group_id,
      substitutes: substitutesFromWire(line.substitutes),
      unknownAllergens: Boolean(line.unknown_allergens),
      nonQuantified: Boolean(line.non_quantified),
      qtyHigh: line.qty_high,
      qtyLow: line.qty_low,
      isRange: Boolean(line.is_range),
    }));

    const steps: LocalRecipeStep[] = stepsRemote.map((s) => ({
      id: s.id,
      recipeId: s.recipe_id,
      sortOrder: s.sort_order,
      text: s.text,
      durationSec: s.duration_sec,
      timerLabel: s.timer_label,
    }));

    await local.replaceRecipeBundle({ recipe, lines, steps });
    recipesApplied += 1;
  }

  // Push local recipes that are strictly newer than remote, or remote-missing.
  for (const lr of localRecipes) {
    if (!lr.householdId) continue; // skip seed/global recipes
    const remoteR = remoteRecipeById.get(lr.id);
    if (remoteR) {
      const remoteUpdated = toIso(remoteR.updated_at) ?? remoteR.updated_at;
      // remoteWinsLww(a, b) ⇔ b > a. Local is newer when remoteWinsLww(remote, local).
      if (!remoteWinsLww(remoteUpdated, lr.updatedAt)) {
        continue; // remote equal or newer
      }
    }

    const bundle = await local.getRecipeBundle(lr.id);
    if (!bundle) continue;

    await remote.upsertRecipes([
      {
        id: bundle.recipe.id,
        household_id: remoteHouseholdId,
        title: bundle.recipe.title,
        servings: bundle.recipe.servings,
        yield_note: bundle.recipe.yieldNote,
        prep_min: bundle.recipe.prepMin,
        cook_min: bundle.recipe.cookMin,
        author_id: bundle.recipe.authorId,
        visibility: bundle.recipe.visibility,
        forked_from: bundle.recipe.forkedFrom,
        tags: tagsToWire(bundle.recipe.tags),
        image_url: bundle.recipe.imageUrl,
        created_at: bundle.recipe.createdAt,
        updated_at: bundle.recipe.updatedAt,
      },
    ]);

    await remote.replaceRecipeChildren(
      bundle.recipe.id,
      bundle.lines.map((line) => ({
        id: line.id,
        recipe_id: line.recipeId,
        sort_order: line.sortOrder,
        ingredient_id: line.ingredientId,
        form_id: line.formId,
        raw_text: line.rawText,
        qty: line.qty,
        unit: line.unit,
        optional: line.optional,
        group_id: line.groupId,
        substitutes: substitutesToWire(line.substitutes),
        unknown_allergens: line.unknownAllergens,
        non_quantified: line.nonQuantified,
        qty_high: line.qtyHigh,
        qty_low: line.qtyLow,
        is_range: line.isRange,
      })),
      bundle.steps.map((s) => ({
        id: s.id,
        recipe_id: s.recipeId,
        sort_order: s.sortOrder,
        text: s.text,
        duration_sec: s.durationSec,
        timer_label: s.timerLabel,
      })),
    );
    recipesPushed += 1;
  }

  // ── Pantry item metadata LWW (par, location, opened, expires) ───────────
  // Never let remote qty_base overwrite a fresher local fold.
  const remoteItems = await remote.pullPantryItemsMeta(remoteHouseholdId);
  for (const ri of remoteItems) {
    const mapped: LocalPantryItem = {
      householdId: localHouseholdId,
      ingredientId: ri.ingredient_id,
      formId: ri.form_id,
      locationId: ri.location_id,
      qtyBase: ri.qty_base,
      dim:
        ri.dim === 'mass' || ri.dim === 'volume' || ri.dim === 'count'
          ? ri.dim
          : 'mass',
      parLevelBase: ri.par_level_base,
      lowThresholdPct: ri.low_threshold_pct,
      lastVerifiedAt: toIso(ri.last_verified_at),
      unverifiedCookCount: ri.unverified_cook_count,
      openedAt: toIso(ri.opened_at),
      expiresAt: toIso(ri.expires_at),
      updatedAt: toIso(ri.updated_at) ?? ri.updated_at,
      watermarkCursor: ri.watermark_cursor,
      lastAbsoluteCursor: ri.last_absolute_cursor,
      isNegative: Boolean(ri.is_negative),
      conflict: Boolean(ri.conflict),
    };

    const existing = await local.getPantryItem(
      localHouseholdId,
      mapped.ingredientId,
      mapped.formId,
    );
    const wins = remoteWinsLww(existing?.updatedAt, mapped.updatedAt);
    const result = await local.applyPantryMetadataLww(mapped, {
      remoteWins: wins,
    });
    if (result === 'applied' || result === 'inserted') {
      pantryMetaApplied += 1;
    }
  }

  return {
    locationsApplied,
    recipesApplied,
    pantryMetaApplied,
    locationsPushed,
    recipesPushed,
  };
}

/**
 * Pure LWW resolution for tests.
 */
export function resolveLww<T extends { updatedAt: string }>(
  local: T | null,
  remote: T,
): { winner: 'local' | 'remote'; value: T } {
  if (!local) return { winner: 'remote', value: remote };
  if (remoteWinsLww(local.updatedAt, remote.updatedAt)) {
    return { winner: 'remote', value: remote };
  }
  return { winner: 'local', value: local };
}
