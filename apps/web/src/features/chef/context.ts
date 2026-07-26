/**
 * Build pantry snapshot + catalog slice + dietary profile for chef requests.
 */

import { seedIngredients } from '../recipes/core-imports';
import type { PantryItemView } from '../../db/types';
import type {
  Allergen,
  CatalogIngredientRef,
  DietaryFlag,
  DietaryProfile,
  PantrySnapshotItem,
} from './types';

const ALLERGEN_SET = new Set<string>([
  'milk',
  'egg',
  'fish',
  'shellfish',
  'tree_nut',
  'peanut',
  'wheat',
  'soy',
  'sesame',
]);

const FLAG_SET = new Set<string>([
  'gluten',
  'pork',
  'alcohol',
  'beef',
  'shellfish-derived',
]);

function asAllergens(xs: readonly string[] | undefined): Allergen[] {
  if (!xs) return [];
  return xs.filter((x): x is Allergen => ALLERGEN_SET.has(x));
}

function asFlags(xs: readonly string[] | undefined): DietaryFlag[] {
  if (!xs) return [];
  return xs.filter((x): x is DietaryFlag => FLAG_SET.has(x));
}

const seedById = new Map(seedIngredients.map((i) => [i.id, i]));

/**
 * Map pantry rows + seed tags into the chef snapshot.
 * Grounding is only honest if we send real stock.
 */
export function buildPantrySnapshot(
  items: readonly PantryItemView[],
): PantrySnapshotItem[] {
  return items
    .filter((i) => i.qtyBase > 0)
    .map((i) => {
      const seed = seedById.get(i.ingredientId);
      return {
        ingredientId: i.ingredientId,
        name: i.ingredientName || seed?.name || i.ingredientId,
        qtyBase: i.qtyBase,
        dim: i.dim,
        formId: i.formId,
        allergens: asAllergens(seed?.allergens as readonly string[] | undefined),
        dietaryFlags: asFlags(
          seed?.dietaryFlags as readonly string[] | undefined,
        ),
      };
    });
}

/**
 * Catalog slice: pantry ingredients + a small staple set so the model can
 * map recipe lines. Full seed is too large for every turn.
 */
export function buildCatalogSlice(
  pantry: readonly PantrySnapshotItem[],
  maxExtra = 40,
): CatalogIngredientRef[] {
  const ids = new Set(pantry.map((p) => p.ingredientId));
  const out: CatalogIngredientRef[] = [];

  for (const p of pantry) {
    const seed = seedById.get(p.ingredientId);
    out.push({
      id: p.ingredientId,
      name: p.name,
      allergens: p.allergens ?? asAllergens(seed?.allergens as readonly string[] | undefined),
      dietaryFlags:
        p.dietaryFlags ??
        asFlags(seed?.dietaryFlags as readonly string[] | undefined),
    });
  }

  let added = 0;
  for (const s of seedIngredients) {
    if (ids.has(s.id)) continue;
    if (added >= maxExtra) break;
    // Prefer staples and gluten-critical grains for gate scanning.
    if (
      !s.isStaple &&
      !s.dietaryFlags.includes('gluten') &&
      !s.allergens.includes('wheat')
    ) {
      continue;
    }
    out.push({
      id: s.id,
      name: s.name,
      allergens: asAllergens(s.allergens),
      dietaryFlags: asFlags(s.dietaryFlags),
    });
    ids.add(s.id);
    added += 1;
  }

  // Always include barley/rye/etc. for safety name scanning even if not staples.
  for (const id of [
    'barley',
    'rye',
    'spelt',
    'farro',
    'malt-extract',
    'soy-sauce',
    'flour-ap',
    'oats-rolled',
  ]) {
    if (ids.has(id)) continue;
    const s = seedById.get(id);
    if (!s) continue;
    out.push({
      id: s.id,
      name: s.name,
      allergens: asAllergens(s.allergens),
      dietaryFlags: asFlags(s.dietaryFlags),
    });
  }

  return out;
}

/**
 * Dietary profile from localStorage (simple until profile screen exists).
 * Keys: tgp.avoidAllergens, tgp.avoidDietaryFlags (JSON string arrays).
 */
export function loadDietaryProfile(): DietaryProfile {
  try {
    const a = localStorage.getItem('tgp.avoidAllergens');
    const d = localStorage.getItem('tgp.avoidDietaryFlags');
    const notes = localStorage.getItem('tgp.dietaryNotes') ?? undefined;
    return {
      avoidAllergens: a ? asAllergens(JSON.parse(a) as string[]) : [],
      avoidDietaryFlags: d ? asFlags(JSON.parse(d) as string[]) : [],
      notes: notes || undefined,
    };
  } catch {
    return { avoidAllergens: [], avoidDietaryFlags: [] };
  }
}

export function saveDietaryProfile(profile: DietaryProfile): void {
  localStorage.setItem(
    'tgp.avoidAllergens',
    JSON.stringify([...profile.avoidAllergens]),
  );
  localStorage.setItem(
    'tgp.avoidDietaryFlags',
    JSON.stringify([...profile.avoidDietaryFlags]),
  );
  if (profile.notes) {
    localStorage.setItem('tgp.dietaryNotes', profile.notes);
  } else {
    localStorage.removeItem('tgp.dietaryNotes');
  }
}

/**
 * Entitlement from Supabase session metadata (same as receipt function).
 * Dev fallback: VITE_CHEF_PAID=true or localStorage tgp.plan=paid.
 */
export async function resolveEntitlement(): Promise<'free' | 'paid'> {
  if (import.meta.env.VITE_CHEF_PAID === 'true') return 'paid';
  try {
    if (localStorage.getItem('tgp.plan') === 'paid') return 'paid';
    if (localStorage.getItem('tgp.plan') === 'free') return 'free';
  } catch {
    /* ignore */
  }

  const { getSupabaseClient } = await import('../../supabase/config');
  const client = getSupabaseClient();
  if (!client) {
    // Offline companion without auth — show upsell rather than broken chat.
    return 'free';
  }
  const { data } = await client.auth.getUser();
  const user = data.user;
  if (!user) return 'free';
  const plan = (user.app_metadata?.plan ?? user.user_metadata?.plan) as
    | string
    | undefined;
  if (plan === 'paid' || plan === 'pro' || plan === 'unlimited') return 'paid';
  return 'free';
}
