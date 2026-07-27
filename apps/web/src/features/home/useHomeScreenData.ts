/**
 * Home screen data orchestration.
 *
 * Screens use Zustand hooks (usePantry / useRecipes / useLocations) — never SQLite.
 * When no repository is active (web companion without Supabase), falls back to
 * track-G fixture demo data so the overview remains reviewable.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Recipe } from '../../../../../packages/core/src/recipes/types.ts';
import { getAuthClient } from '../../auth';
import { DEFAULT_LOCATION_IDS } from '../../db/constants';
import type { LocationRow, PantryItemView } from '../../db/types';
import {
  getDomainRepository,
  hasActiveRepository,
  useLocations,
  usePantry,
  useRecipes,
} from '../../state';
import type { StatusBand } from '../../ui';
import {
  computeCookNow,
  type CookNowResult,
  pantryItemsToStockRows,
} from './cookable';
import { loadDemoHomeData } from './demo-data';
import {
  type ItemDisplay,
  locationStatusWord,
  shortIngredientName,
  toItemDisplay,
} from './display';
import { displayNameFromUser } from './greeting';

/** Stable empty fallbacks so demo-mode deps don't change identity every render. */
const EMPTY_PANTRY_ITEMS: PantryItemView[] = [];
const EMPTY_LOCATIONS: LocationRow[] = [];

export type GlanceCard = {
  id: string;
  name: string;
  count: number;
  statusWord: string;
  status: StatusBand;
  tint: 'sage' | 'tan' | 'sky' | 'cream';
  /** All glance cards are real locations (Favorites removed). */
  kind: 'location';
};

export type HighlightItem = {
  key: string;
  name: string;
  ingredientId: string;
  formId: string;
  display: ItemDisplay;
  tint: 'sage' | 'tan' | 'sky' | 'cream';
};

export type HomeScreenData = {
  phase: 'loading' | 'error' | 'empty' | 'ready';
  error: string | null;
  /** true when using fixture demo (no active repo) */
  isDemo: boolean;
  /** Signed-in display name, or null → greet without a name */
  greetingName: string | null;
  glance: GlanceCard[];
  cookNow: CookNowResult;
  fridgeHighlights: HighlightItem[];
  pantryStaples: HighlightItem[];
  items: PantryItemView[];
  locations: LocationRow[];
  reload: () => void;
};

const TINT_CYCLE: ('sage' | 'tan' | 'sky' | 'cream')[] = [
  'sky',
  'tan',
  'cream',
  'sage',
];

function locationTint(loc: LocationRow, index: number): 'sage' | 'tan' | 'sky' | 'cream' {
  const t = loc.tint?.toLowerCase();
  if (t === 'sage' || t === 'tan' || t === 'sky' || t === 'cream') return t;
  // Map seed hex / names onto soft washes (cold roots → sky, pantry → tan)
  if (/fridge|freezer|refrigerator/i.test(loc.name)) return 'sky';
  if (/pantry/i.test(loc.name)) return 'tan';
  return TINT_CYCLE[index % TINT_CYCLE.length]!;
}

function detailToRecipe(detail: {
  id: string;
  householdId: string | null;
  title: string;
  servings: number;
  prepMin: number | null;
  cookMin: number | null;
  tags: string[];
  imageUrl: string | null;
  ingredients: {
    ingredientId?: string;
    formId?: string;
    rawText: string;
    qty?: number | null;
    unit?: string | null;
    optional?: boolean;
    group?: string;
    substitutes?: readonly string[];
    unknownAllergens?: boolean;
    nonQuantified?: boolean;
    qtyHigh?: number;
    qtyLow?: number;
    isRange?: boolean;
  }[];
  steps: {
    text: string;
    durationSec?: number;
    timerLabel?: string;
  }[];
}): Recipe {
  return {
    id: detail.id,
    householdId: detail.householdId ?? undefined,
    title: detail.title,
    servings: detail.servings,
    prepMin: detail.prepMin ?? undefined,
    cookMin: detail.cookMin ?? undefined,
    tags: detail.tags,
    imageUrl: detail.imageUrl ?? undefined,
    ingredients: detail.ingredients.map((line) => ({
      ingredientId: line.ingredientId,
      formId: line.formId,
      rawText: line.rawText,
      qty: line.qty ?? null,
      unit: line.unit ?? null,
      optional: line.optional,
      group: line.group,
      substitutes: line.substitutes,
      unknownAllergens: line.unknownAllergens,
      nonQuantified: line.nonQuantified,
      qtyHigh: line.qtyHigh,
      qtyLow: line.qtyLow,
      isRange: line.isRange,
    })),
    steps: detail.steps.map((s) => ({
      text: s.text,
      durationSec: s.durationSec,
      timerLabel: s.timerLabel,
    })),
  };
}

function buildGlance(
  locations: readonly LocationRow[],
  items: readonly PantryItemView[],
  nowMs: number,
): GlanceCard[] {
  const roots = locations
    .filter((l) => l.parentId == null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  // Collapse children into parent counts (Pantry includes Spices / Baking / …)
  const childIdsByParent = new Map<string, string[]>();
  for (const loc of locations) {
    if (loc.parentId) {
      const list = childIdsByParent.get(loc.parentId) ?? [];
      list.push(loc.id);
      childIdsByParent.set(loc.parentId, list);
    }
  }

  const cards: GlanceCard[] = [];
  let idx = 0;
  for (const root of roots) {
    const childIds = childIdsByParent.get(root.id) ?? [];
    const locationIds = new Set([root.id, ...childIds]);
    const subset = items.filter(
      (i) => i.locationId != null && locationIds.has(i.locationId) && i.qtyBase > 0,
    );
    const { word, status } = locationStatusWord(subset, nowMs);

    // Fridge-like names get "Fresh" when well stocked
    let statusWord = word;
    if (
      status === 'fresh' &&
      /fridge|refrigerator/i.test(root.name)
    ) {
      statusWord = 'Fresh';
    }

    cards.push({
      id: root.id,
      name: root.name,
      count: subset.length,
      statusWord,
      status,
      tint: locationTint(root, idx),
      kind: 'location',
    });
    idx += 1;
  }

  // Preferred order: Fridge · Freezer · Pantry (no Favorites / Around the House)
  const preferredOrder: readonly string[] = [
    DEFAULT_LOCATION_IDS.fridge,
    DEFAULT_LOCATION_IDS.freezer,
    DEFAULT_LOCATION_IDS.pantry,
  ];
  cards.sort((a, b) => {
    const ai = preferredOrder.indexOf(a.id);
    const bi = preferredOrder.indexOf(b.id);
    if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return cards;
}

function pickHighlights(
  items: readonly PantryItemView[],
  locationId: string,
  childIds: readonly string[],
  limit: number,
  nowMs: number,
  preferExpiring: boolean,
): HighlightItem[] {
  const ids = new Set([locationId, ...childIds]);
  let pool = items.filter(
    (i) => i.locationId != null && ids.has(i.locationId) && i.qtyBase > 0,
  );

  if (preferExpiring) {
    pool = [...pool].sort((a, b) => {
      const ae = a.expiresAt ? Date.parse(a.expiresAt) : Number.POSITIVE_INFINITY;
      const be = b.expiresAt ? Date.parse(b.expiresAt) : Number.POSITIVE_INFINITY;
      if (ae !== be) return ae - be;
      // Then lower stock ratio
      const ar = a.parLevelBase > 0 ? a.qtyBase / a.parLevelBase : 1;
      const br = b.parLevelBase > 0 ? b.qtyBase / b.parLevelBase : 1;
      return ar - br;
    });
  } else {
    // Pantry staples — drifted / low first so provenance is visible on the rail
    pool = [...pool].sort((a, b) => {
      const aDrift = a.unverifiedCookCount > 0 || a.lastVerifiedAt == null ? 0 : 1;
      const bDrift = b.unverifiedCookCount > 0 || b.lastVerifiedAt == null ? 0 : 1;
      if (aDrift !== bDrift) return aDrift - bDrift;
      const ar = a.parLevelBase > 0 ? a.qtyBase / a.parLevelBase : 1;
      const br = b.parLevelBase > 0 ? b.qtyBase / b.parLevelBase : 1;
      return ar - br;
    });
  }

  return pool.slice(0, limit).map((item, i) => ({
    key: `${item.ingredientId}:${item.formId}`,
    name: shortIngredientName(item.ingredientName),
    ingredientId: item.ingredientId,
    formId: item.formId,
    display: toItemDisplay(item, nowMs),
    tint: TINT_CYCLE[i % TINT_CYCLE.length]!,
  }));
}

function shouldUseDemo(): boolean {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === '1' || params.get('demo') === 'true') {
      return true;
    }
    if (params.get('empty') === '1') {
      return false; // force empty via no demo + no data
    }
  }
  // Demo fixtures only in browser DEV when no repo — never ship stranger's groceries
  // to production or native first-run users.
  return import.meta.env.DEV && !hasActiveRepository();
}

export function useHomeScreenData(): HomeScreenData {
  const pantry = usePantry();
  const recipesStore = useRecipes();
  const locationsStore = useLocations();

  const [fullRecipes, setFullRecipes] = useState<Recipe[]>([]);
  const [demo, setDemo] = useState<ReturnType<typeof loadDemoHomeData> | null>(
    null,
  );
  const [bootstrapped, setBootstrapped] = useState(false);
  const [recipeLoadError, setRecipeLoadError] = useState<string | null>(null);
  const [greetingName, setGreetingName] = useState<string | null>(null);

  const useDemo = shouldUseDemo();

  // Resolve signed-in name when available; never invent a default.
  useEffect(() => {
    const auth = getAuthClient();
    let cancelled = false;
    void auth.initialize().then((state) => {
      if (cancelled) return;
      setGreetingName(displayNameFromUser(state.session?.user ?? null));
    });
    const unsub = auth.subscribe((state) => {
      setGreetingName(displayNameFromUser(state.session?.user ?? null));
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const reload = useCallback(() => {
    setBootstrapped(false);
    setRecipeLoadError(null);
    if (useDemo) {
      setDemo(loadDemoHomeData());
      setFullRecipes(loadDemoHomeData().recipes);
      setBootstrapped(true);
      return;
    }
    if (!hasActiveRepository()) {
      setDemo(null);
      setFullRecipes([]);
      setBootstrapped(true);
      return;
    }
    void (async () => {
      try {
        const { usePantryStore } = await import('../../state/pantry-store');
        const { useRecipesStore } = await import('../../state/recipes-store');
        const { useLocationsStore } = await import('../../state/locations-store');
        await Promise.all([
          usePantryStore.getState().load(),
          useRecipesStore.getState().list(),
          useLocationsStore.getState().list(),
        ]);
      } catch (err) {
        setRecipeLoadError(
          err instanceof Error ? err.message : String(err),
        );
        setBootstrapped(true);
      }
    })();
  }, [useDemo]);

  // Initial load
  useEffect(() => {
    if (useDemo) {
      const data = loadDemoHomeData();
      setDemo(data);
      setFullRecipes(data.recipes);
      setBootstrapped(true);
      return;
    }
    if (!hasActiveRepository()) {
      setBootstrapped(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { usePantryStore } = await import('../../state/pantry-store');
        const { useRecipesStore } = await import('../../state/recipes-store');
        const { useLocationsStore } = await import('../../state/locations-store');
        await Promise.all([
          usePantryStore.getState().load(),
          useRecipesStore.getState().list(),
          useLocationsStore.getState().list(),
        ]);
      } catch (err) {
        if (!cancelled) {
          setRecipeLoadError(
            err instanceof Error ? err.message : String(err),
          );
        }
      } finally {
        if (!cancelled) setBootstrapped(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally once on mount / demo flag
     
  }, [useDemo]);

  // Hydrate full recipes for cook-now after list.
  // Do NOT call recipesStore.get() here — that toggles `loading` and would
  // re-trigger this effect (infinite loop once a real repo has recipes).
  // Read details via the domain repo directly.
  useEffect(() => {
    if (useDemo || !hasActiveRepository()) return;
    if (recipesStore.loading) return;
    const summaries = recipesStore.recipes;
    if (summaries.length === 0) {
      setFullRecipes([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const domain = getDomainRepository();
        const details = await Promise.all(
          summaries.map((s) => domain.getRecipe(s.id)),
        );
        if (cancelled) return;
        const recipes = details
          .filter((d): d is NonNullable<typeof d> => d != null)
          .map(detailToRecipe);
        setFullRecipes(recipes);
        setRecipeLoadError(null);
      } catch (err) {
        if (!cancelled) {
          setRecipeLoadError(
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only re-hydrate when the summary list identity changes, not on loading toggles
    // from other store actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useDemo, recipesStore.recipes]);

  const items = useDemo ? (demo?.items ?? EMPTY_PANTRY_ITEMS) : pantry.items;
  const locations = useDemo
    ? (demo?.locations ?? EMPTY_LOCATIONS)
    : locationsStore.locations;
  const recipes = useDemo ? (demo?.recipes ?? fullRecipes) : fullRecipes;

  const loading =
    !bootstrapped ||
    (!useDemo &&
      (pantry.loading || recipesStore.loading || locationsStore.loading) &&
      items.length === 0 &&
      locations.length === 0);

  const storeError =
    recipeLoadError ??
    (!useDemo
      ? pantry.error || recipesStore.error || locationsStore.error
      : null);

  const nowMs = Date.now();

  const cookNow = useMemo(
    () =>
      computeCookNow(recipes, pantryItemsToStockRows(items), {
        now: nowMs,
      }),
    [recipes, items, nowMs],
  );

  const glance = useMemo(
    () => buildGlance(locations, items, nowMs),
    [locations, items, nowMs],
  );

  const childMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const loc of locations) {
      if (loc.parentId) {
        const list = m.get(loc.parentId) ?? [];
        list.push(loc.id);
        m.set(loc.parentId, list);
      }
    }
    return m;
  }, [locations]);

  const fridgeHighlights = useMemo(() => {
    const fridgeId =
      locations.find((l) => /fridge/i.test(l.name))?.id ??
      DEFAULT_LOCATION_IDS.fridge;
    return pickHighlights(
      items,
      fridgeId,
      childMap.get(fridgeId) ?? [],
      8,
      nowMs,
      true,
    );
  }, [items, locations, childMap, nowMs]);

  const pantryStaples = useMemo(() => {
    const pantryId =
      locations.find((l) => /^pantry$/i.test(l.name))?.id ??
      DEFAULT_LOCATION_IDS.pantry;
    return pickHighlights(
      items,
      pantryId,
      childMap.get(pantryId) ?? [],
      8,
      nowMs,
      false,
    );
  }, [items, locations, childMap, nowMs]);

  let phase: HomeScreenData['phase'];
  if (loading) {
    phase = 'loading';
  } else if (storeError && items.length === 0 && !useDemo) {
    phase = 'error';
  } else if (items.length === 0) {
    phase = 'empty';
  } else {
    phase = 'ready';
  }

  return {
    phase,
    error: storeError,
    isDemo: useDemo,
    greetingName,
    glance,
    cookNow,
    fridgeHighlights,
    pantryStaples,
    items,
    locations,
    reload,
  };
}
