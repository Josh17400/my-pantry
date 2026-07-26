import { type ReactNode,useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import type { RecipeDetail, RecipeSummary } from '../db/types';
import {
  catalogConversionContext,
  ErrorBlock,
  findCookableRecipes,
  LoadingBlock,
  pantryItemsToStock,
  RecipeCard,
  recipeDetailToCore,
  RecipesEmptyState,
} from '../features/recipes';
import type { Recipe } from '../features/recipes/core-imports';
import {
  getDomainRepository,
  hasActiveRepository,
  usePantry,
  usePantryStore,
  useRecipes,
  useRecipesStore,
} from '../state';
import { cn } from '../ui/cn';
import { SegmentedControl } from '../ui/SegmentedControl';

type FilterMode = 'all' | 'can-make';

/**
 * Recipe list — cards, can-make-now filter, search by name / ingredient.
 */
export function RecipesPage() {
  const {
    recipes,
    loading,
    error,
    clearError,
  } = useRecipes();
  const pantry = usePantry();
  const [searchParams] = useSearchParams();
  const initialFilter: FilterMode =
    searchParams.get('filter') === 'can-make' ? 'can-make' : 'all';
  const [filter, setFilter] = useState<FilterMode>(initialFilter);
  const [query, setQuery] = useState('');
  const [details, setDetails] = useState<RecipeDetail[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // Keep segment in sync when arriving via home cook-now CTA.
  useEffect(() => {
    if (searchParams.get('filter') === 'can-make') {
      setFilter('can-make');
    }
  }, [searchParams]);

  // Stable actions from getState — do not put the whole store in deps
  // (that re-runs every item update and livelocks the page).
  const refresh = useCallback(async () => {
    if (!hasActiveRepository()) return;
    await useRecipesStore.getState().list();
    await usePantryStore.getState().load();
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Load full recipes for ingredient search + cookable ranking
  useEffect(() => {
    if (!hasActiveRepository() || recipes.length === 0) {
      setDetails([]);
      return;
    }
    let cancelled = false;
    setDetailsLoading(true);
    setDetailsError(null);
    void (async () => {
      try {
        const domain = getDomainRepository();
        const loaded: RecipeDetail[] = [];
        for (const summary of recipes) {
          const d = await domain.getRecipe(summary.id);
          if (d) loaded.push(d);
        }
        if (!cancelled) setDetails(loaded);
      } catch (err) {
        if (!cancelled) {
          setDetailsError(
            err instanceof Error ? err.message : String(err),
          );
        }
      } finally {
        if (!cancelled) setDetailsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recipes]);

  const coreRecipes: Recipe[] = useMemo(
    () => details.map(recipeDetailToCore),
    [details],
  );

  const cookableIds = useMemo(() => {
    if (coreRecipes.length === 0) return new Set<string>();
    const stock = pantryItemsToStock(pantry.items);
    const ranked = findCookableRecipes(coreRecipes, stock, {
      ...catalogConversionContext(),
      now: Date.now(),
    });
    return new Set(
      ranked.filter((m) => m.fullyCookable).map((m) => m.recipe.id),
    );
  }, [coreRecipes, pantry.items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let listRows: RecipeSummary[] = recipes;

    if (filter === 'can-make') {
      listRows = listRows.filter((r) => cookableIds.has(r.id));
    }

    if (q) {
      const detailById = new Map(details.map((d) => [d.id, d]));
      listRows = listRows.filter((r) => {
        if (r.title.toLowerCase().includes(q)) return true;
        const d = detailById.get(r.id);
        if (!d) return false;
        return d.ingredients.some(
          (line) =>
            line.rawText.toLowerCase().includes(q) ||
            (line.ingredientId?.toLowerCase().includes(q) ?? false),
        );
      });
    }

    return listRows;
  }, [recipes, filter, query, cookableIds, details]);

  if (!hasActiveRepository()) {
    return (
      <PageShell>
        <ErrorBlock message="Data layer not ready. Open the app on a platform with an initialized repository (or inject one in tests)." />
      </PageShell>
    );
  }

  const showLoading = loading && recipes.length === 0;

  return (
    <PageShell>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">
            My Recipes
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {cookableIds.size > 0
              ? `You have everything for ${cookableIds.size} recipe${cookableIds.size === 1 ? '' : 's'}`
              : 'Plan a cook — the pantry updates when you confirm'}
          </p>
        </div>
        <Link
          to="/recipes/new"
          className={cn(
            'inline-flex min-h-tap shrink-0 items-center justify-center rounded-pill bg-primary px-4 text-sm font-semibold text-white',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          )}
        >
          New
        </Link>
      </header>

      <div className="mb-4">
        <label className="sr-only" htmlFor="recipe-search">
          Search recipes
        </label>
        <input
          id="recipe-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or ingredient"
          className={cn(
            'min-h-tap w-full rounded-pill border border-black/[0.06] bg-surface px-4 text-sm text-ink shadow-card',
            'placeholder:text-ink-muted',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          )}
        />
      </div>

      <SegmentedControl
        aria-label="Recipe filter"
        className="mb-5"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'can-make', label: 'Can make now' },
        ]}
      />

      {error ? (
        <div className="mb-4">
          <ErrorBlock
            message={error}
            onRetry={() => {
              clearError();
              void refresh();
            }}
          />
        </div>
      ) : null}

      {detailsError ? (
        <div className="mb-4">
          <ErrorBlock message={detailsError} />
        </div>
      ) : null}

      {showLoading || detailsLoading ? (
        <LoadingBlock label="Loading recipes…" />
      ) : recipes.length === 0 ? (
        <RecipesEmptyState />
      ) : filtered.length === 0 ? (
        <p className="rounded-card bg-surface p-6 text-center text-sm text-ink-muted shadow-card">
          No recipes match your search
          {filter === 'can-make' ? ' or can be made with current pantry stock' : ''}.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filtered.map((r) => (
            <li key={r.id}>
              <RecipeCard
                recipe={{
                  id: r.id,
                  title: r.title,
                  servings: r.servings,
                  prepMin: r.prepMin,
                  cookMin: r.cookMin,
                  imageUrl: r.imageUrl,
                  canMakeNow: cookableIds.has(r.id),
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full min-w-0 max-w-lg overflow-x-hidden px-4 pb-24 pt-2">
      {children}
    </div>
  );
}
