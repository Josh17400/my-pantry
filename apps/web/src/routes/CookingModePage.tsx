import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import {
  CookingModeScreen,
  DEMO_COOKING_RECIPE,
} from '../features/cooking';
import { recipeDetailToCore } from '../features/recipes';
import type { Recipe } from '../features/recipes/core-imports';
import {
  hasActiveRepository,
  useRecipesStore,
} from '../state';

/**
 * Route: /recipes/:id/cooking — hands-busy step view.
 * Exit → /recipes/:id/cook (existing deduct preview). No ads.
 */
export function CookingModePage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const demo = searchParams.get('demo') === '1';
  const [recipe, setRecipe] = useState<Recipe | null>(
    demo ? DEMO_COOKING_RECIPE : null,
  );
  const [servings, setServings] = useState(
    demo ? DEMO_COOKING_RECIPE.servings : 1,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!demo);

  const load = useCallback(async () => {
    if (demo) {
      setRecipe(DEMO_COOKING_RECIPE);
      setServings(DEMO_COOKING_RECIPE.servings);
      setLoading(false);
      return;
    }
    if (!id) {
      setError('Missing recipe id.');
      setLoading(false);
      return;
    }
    if (!hasActiveRepository()) {
      // Graceful degradation for web review without data layer.
      setRecipe({ ...DEMO_COOKING_RECIPE, id });
      setServings(DEMO_COOKING_RECIPE.servings);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const detail = await useRecipesStore.getState().get(id);
      if (!detail) {
        setError('Recipe not found.');
        setRecipe(null);
        return;
      }
      const core = recipeDetailToCore(detail);
      setRecipe(core);
      const sParam = searchParams.get('servings');
      const s =
        sParam && Number.isFinite(Number(sParam)) && Number(sParam) > 0
          ? Number(sParam)
          : detail.servings;
      setServings(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [demo, id, searchParams]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4">
        <p className="text-sm text-ink-muted">Opening cooking mode…</p>
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-4">
        <p className="text-center text-sm text-critical">
          {error ?? 'Recipe unavailable.'}
        </p>
        <Link to="/recipes" className="min-h-tap text-sm font-semibold text-primary">
          ← Recipes
        </Link>
      </div>
    );
  }

  return (
    <CookingModeScreen
      recipe={recipe}
      servings={servings}
      onServingsChange={setServings}
    />
  );
}
