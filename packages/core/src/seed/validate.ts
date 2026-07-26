/**
 * validateSeed() — structural + safety checks for the canonical catalog.
 *
 * Failures are hard: matching, recipes, receipts, and par levels all resolve
 * against this data. Silent corruption here is the worst failure class.
 */

import { isAllergen, isDietaryFlag } from '../domain/allergens';
import type { ConversionEdge, IngredientForm } from '../domain/types';
import type {
  SeedCatalog,
  SeedCategoryBundle,
  SeedValidationIssue,
  SeedValidationResult,
} from './types';

/** Physically sane density band (g/ml). Honey ≈ 1.42; puffed cereals ~0.1. */
export const DENSITY_MIN_G_PER_ML = 0.1;
export const DENSITY_MAX_G_PER_ML = 2.0;

function issue(
  code: SeedValidationIssue['code'],
  message: string,
  path?: string,
): SeedValidationIssue {
  return path !== undefined ? { code, message, path } : { code, message };
}

/** Undirected pair key so A→B and B→A collide. */
export function undirectedEdgeKey(fromFormId: string, toFormId: string): string {
  return fromFormId < toFormId
    ? `${fromFormId}::${toFormId}`
    : `${toFormId}::${fromFormId}`;
}

/**
 * Normalize alias for collision detection: trim, collapse whitespace, lower.
 * Matching track may use a richer normalizer; this catches seed-level dups.
 */
export function normalizeAlias(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

function formRequiresDensity(f: IngredientForm): boolean {
  // Volume forms must bridge to mass for package nets / many recipes.
  return f.dim === 'volume';
}

function formRequiresGramsPerCount(f: IngredientForm): boolean {
  return f.dim === 'count';
}

/**
 * Validate a seed catalog (or category bundle).
 * Pure: no I/O. Returns all issues (does not short-circuit).
 */
export function validateSeed(
  catalog: SeedCategoryBundle | SeedCatalog,
): SeedValidationResult {
  const issues: SeedValidationIssue[] = [];
  const { ingredients, forms, edges, packages } = catalog;

  // ── Ingredient ids ────────────────────────────────────────────────────
  const ingredientById = new Map<string, (typeof ingredients)[number]>();
  for (const ing of ingredients) {
    if (!ing.id || ing.id.trim() === '') {
      issues.push(issue('empty_id', 'ingredient id is empty'));
      continue;
    }
    if (ingredientById.has(ing.id)) {
      issues.push(
        issue(
          'duplicate_ingredient_id',
          `duplicate ingredient id "${ing.id}"`,
          ing.id,
        ),
      );
    } else {
      ingredientById.set(ing.id, ing);
    }
    for (const a of ing.allergens) {
      if (!isAllergen(a)) {
        issues.push(
          issue(
            'invalid_allergen',
            `ingredient "${ing.id}" has invalid allergen "${a}"`,
            ing.id,
          ),
        );
      }
    }
    for (const d of ing.dietaryFlags) {
      if (!isDietaryFlag(d)) {
        issues.push(
          issue(
            'invalid_dietary_flag',
            `ingredient "${ing.id}" has invalid dietary flag "${d}"`,
            ing.id,
          ),
        );
      }
    }
  }

  // ── Forms ─────────────────────────────────────────────────────────────
  const formById = new Map<string, IngredientForm>();
  const formsByIngredient = new Map<string, IngredientForm[]>();

  for (const f of forms) {
    if (!f.id || f.id.trim() === '') {
      issues.push(issue('empty_id', 'form id is empty'));
      continue;
    }
    if (formById.has(f.id)) {
      issues.push(
        issue('duplicate_form_id', `duplicate form id "${f.id}"`, f.id),
      );
    } else {
      formById.set(f.id, f);
    }

    if (!ingredientById.has(f.ingredientId)) {
      issues.push(
        issue(
          'orphan_form',
          `form "${f.id}" references unknown ingredient "${f.ingredientId}"`,
          f.id,
        ),
      );
    } else {
      const list = formsByIngredient.get(f.ingredientId) ?? [];
      list.push(f);
      formsByIngredient.set(f.ingredientId, list);
    }

    if (
      f.uncertaintyPct < 0 ||
      !Number.isFinite(f.uncertaintyPct)
    ) {
      issues.push(
        issue(
          'invalid_uncertainty',
          `form "${f.id}" uncertaintyPct must be finite ≥ 0`,
          f.id,
        ),
      );
    }

    if (formRequiresDensity(f)) {
      if (f.densityGPerMl === undefined) {
        issues.push(
          issue(
            'form_missing_density',
            `volume form "${f.id}" requires densityGPerMl`,
            f.id,
          ),
        );
      }
    }

    if (formRequiresGramsPerCount(f)) {
      if (f.gramsPerCount === undefined) {
        issues.push(
          issue(
            'form_missing_grams_per_count',
            `count form "${f.id}" requires gramsPerCount`,
            f.id,
          ),
        );
      }
    }

    // Mass forms may omit density (pure weight stocking) — OK.
    if (f.densityGPerMl !== undefined) {
      const d = f.densityGPerMl;
      if (!Number.isFinite(d) || d < DENSITY_MIN_G_PER_ML || d > DENSITY_MAX_G_PER_ML) {
        issues.push(
          issue(
            'density_out_of_band',
            `form "${f.id}" densityGPerMl=${d} outside ${DENSITY_MIN_G_PER_ML}–${DENSITY_MAX_G_PER_ML} g/ml`,
            f.id,
          ),
        );
      }
    }

    if (f.gramsPerCount !== undefined) {
      if (!Number.isFinite(f.gramsPerCount) || f.gramsPerCount <= 0) {
        issues.push(
          issue(
            'invalid_factor',
            `form "${f.id}" gramsPerCount must be finite > 0`,
            f.id,
          ),
        );
      }
    }
  }

  // ── Every ingredient has ≥1 form; defaultFormId resolves ──────────────
  for (const ing of ingredients) {
    const own = formsByIngredient.get(ing.id) ?? [];
    if (own.length === 0) {
      issues.push(
        issue(
          'no_forms',
          `ingredient "${ing.id}" has no forms`,
          ing.id,
        ),
      );
    }
    const def = formById.get(ing.defaultFormId);
    if (!def) {
      issues.push(
        issue(
          'missing_default_form',
          `ingredient "${ing.id}" defaultFormId "${ing.defaultFormId}" does not exist`,
          ing.id,
        ),
      );
    } else if (def.ingredientId !== ing.id) {
      issues.push(
        issue(
          'default_form_wrong_ingredient',
          `ingredient "${ing.id}" defaultFormId "${ing.defaultFormId}" belongs to "${def.ingredientId}"`,
          ing.id,
        ),
      );
    }
  }

  // ── Alias collisions (across different ingredients) ───────────────────
  const aliasOwner = new Map<string, string>();
  for (const ing of ingredients) {
    const seenLocal = new Set<string>();
    // Ingredient name is also a match key
    const nameKey = normalizeAlias(ing.name);
    if (nameKey) {
      const owner = aliasOwner.get(nameKey);
      if (owner !== undefined && owner !== ing.id) {
        issues.push(
          issue(
            'alias_collision',
            `name/alias "${nameKey}" collides between "${owner}" and "${ing.id}"`,
            ing.id,
          ),
        );
      } else {
        aliasOwner.set(nameKey, ing.id);
      }
      seenLocal.add(nameKey);
    }
    // id as alias target (matching often keys on id)
    const idKey = normalizeAlias(ing.id.replace(/-/g, ' '));
    if (idKey && !seenLocal.has(idKey)) {
      const owner = aliasOwner.get(idKey);
      if (owner !== undefined && owner !== ing.id) {
        issues.push(
          issue(
            'alias_collision',
            `id-derived alias "${idKey}" collides between "${owner}" and "${ing.id}"`,
            ing.id,
          ),
        );
      } else {
        aliasOwner.set(idKey, ing.id);
      }
    }

    for (const raw of ing.aliases) {
      const key = normalizeAlias(raw);
      if (!key) continue;
      if (seenLocal.has(key)) continue;
      seenLocal.add(key);
      const owner = aliasOwner.get(key);
      if (owner !== undefined && owner !== ing.id) {
        issues.push(
          issue(
            'alias_collision',
            `alias "${key}" collides between "${owner}" and "${ing.id}"`,
            ing.id,
          ),
        );
      } else {
        aliasOwner.set(key, ing.id);
      }
    }
  }

  // ── Edges ─────────────────────────────────────────────────────────────
  /** Map undirected pair → first directed edge seen (for duplicate-direction). */
  const undirectedSeen = new Map<
    string,
    { from: string; to: string; edge: ConversionEdge }
  >();

  for (const e of edges) {
    if (!formById.has(e.fromFormId)) {
      issues.push(
        issue(
          'edge_unknown_form',
          `edge ${e.fromFormId}→${e.toFormId}: unknown fromFormId`,
          `${e.fromFormId}->${e.toFormId}`,
        ),
      );
    }
    if (!formById.has(e.toFormId)) {
      issues.push(
        issue(
          'edge_unknown_form',
          `edge ${e.fromFormId}→${e.toFormId}: unknown toFormId`,
          `${e.fromFormId}->${e.toFormId}`,
        ),
      );
    }

    const fromF = formById.get(e.fromFormId);
    const toF = formById.get(e.toFormId);
    if (fromF && toF && fromF.ingredientId !== toF.ingredientId) {
      issues.push(
        issue(
          'edge_cross_ingredient',
          `edge ${e.fromFormId}→${e.toFormId} crosses ingredients "${fromF.ingredientId}" / "${toF.ingredientId}"`,
          `${e.fromFormId}->${e.toFormId}`,
        ),
      );
    }

    if (!Number.isFinite(e.factor) || e.factor <= 0) {
      issues.push(
        issue(
          'invalid_factor',
          `edge ${e.fromFormId}→${e.toFormId} factor must be finite > 0`,
          `${e.fromFormId}->${e.toFormId}`,
        ),
      );
    }
    if (!Number.isFinite(e.uncertaintyPct) || e.uncertaintyPct < 0) {
      issues.push(
        issue(
          'invalid_uncertainty',
          `edge ${e.fromFormId}→${e.toFormId} uncertaintyPct invalid`,
          `${e.fromFormId}->${e.toFormId}`,
        ),
      );
    }

    // EDGE DIRECTION INVARIANT: only one direction of each form pair.
    const ukey = undirectedEdgeKey(e.fromFormId, e.toFormId);
    const prev = undirectedSeen.get(ukey);
    if (prev) {
      const sameDirection =
        prev.from === e.fromFormId && prev.to === e.toFormId;
      if (sameDirection) {
        // Duplicate identical direction — also bad (ambiguous factors)
        issues.push(
          issue(
            'duplicate_direction_edge',
            `duplicate edge ${e.fromFormId}→${e.toFormId} (same direction twice)`,
            ukey,
          ),
        );
      } else {
        issues.push(
          issue(
            'duplicate_direction_edge',
            `both directions declared for form pair ${e.fromFormId} ↔ ${e.toFormId}; emit one direction only (convert() auto-inverts)`,
            ukey,
          ),
        );
      }
    } else {
      undirectedSeen.set(ukey, {
        from: e.fromFormId,
        to: e.toFormId,
        edge: e,
      });
    }
  }

  // ── Packages ──────────────────────────────────────────────────────────
  for (const p of packages) {
    if (!formById.has(p.formId)) {
      issues.push(
        issue(
          'package_unknown_form',
          `package "${p.label}" references unknown form "${p.formId}"`,
          p.label,
        ),
      );
    }
    if (!Number.isFinite(p.netG) || p.netG <= 0) {
      issues.push(
        issue(
          'invalid_factor',
          `package "${p.label}" netG must be finite > 0`,
          p.label,
        ),
      );
    }
    if (p.drainedG !== undefined) {
      if (!Number.isFinite(p.drainedG) || p.drainedG <= 0 || p.drainedG > p.netG) {
        issues.push(
          issue(
            'invalid_factor',
            `package "${p.label}" drainedG must be finite, > 0, and ≤ netG`,
            p.label,
          ),
        );
      }
    }
  }

  return { ok: issues.length === 0, issues };
}
