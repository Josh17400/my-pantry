import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  AllergenUnknownBadge,
  catalogConversionContext,
  ErrorBlock,
  formatBaseQty,
  formatMinutes,
  groceryItemsFromPlan,
  LoadingBlock,
  pantryItemsToStock,
  planCook,
  presentCookStatus,
  recipeDetailToCore,
  scaleRecipe,
  ServingsStepper,
} from '../features/recipes';
import { getIngredientName } from '../features/recipes/catalog';
import { statusChipClass } from '../features/recipes/status-styles';
import {
  hasActiveRepository,
  useGrocery,
  usePantry,
  usePantryStore,
  useRecipes,
  useRecipesStore,
} from '../state';
import { cn } from '../ui/cn';
import { PlaceholderThumb } from '../ui/PlaceholderThumb';

/**
 * Recipe detail — have/need per line, live servings scale, add missing to grocery, cook CTA.
 */
export function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { current, loading, error, clearError } = useRecipes();
  const pantry = usePantry();
  const grocery = useGrocery();
  const [servings, setServings] = useState(1);
  const [groceryMsg, setGroceryMsg] = useState<string | null>(null);
  const [groceryBusy, setGroceryBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id || !hasActiveRepository()) return;
    // Stable store actions — avoid deps on the whole pantry/recipes objects.
    const d = await useRecipesStore.getState().get(id);
    if (d) setServings(d.servings);
    await usePantryStore.getState().load();
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const detail = current?.id === id ? current : null;

  const core = useMemo(
    () => (detail ? recipeDetailToCore(detail) : null),
    [detail],
  );

  const scaled = useMemo(() => {
    if (!core) return null;
    return scaleRecipe(core, servings);
  }, [core, servings]);

  const plan = useMemo(() => {
    if (!core) return null;
    return planCook(
      core,
      servings,
      pantryItemsToStock(pantry.items),
      catalogConversionContext(),
    );
  }, [core, servings, pantry.items]);

  const addMissingToGrocery = async () => {
    if (!plan || !detail) return;
    setGroceryBusy(true);
    setGroceryMsg(null);
    try {
      const items = groceryItemsFromPlan(detail.id, detail.title, plan);
      if (items.length === 0) {
        setGroceryMsg('Nothing missing to add.');
        return;
      }
      await grocery.load();
      const { useGroceryStore } = await import('../state/grocery-store');
      const list = useGroceryStore.getState().list;
      if (list) {
        const existing = list.items.map((row) => ({
          id: row.id,
          ingredientId: row.ingredientId,
          formId: row.formId,
          name: row.name,
          category: row.category,
          qtyBase: row.qtyBase,
          dim: row.dim,
          displayQty: row.displayQty,
          sources: row.sources,
          recipeIds: row.recipeIds,
          checked: row.checked,
          sortOrder: row.sortOrder,
          notes: row.notes,
        }));
        await grocery.updateItems([...existing, ...items]);
      } else {
        await grocery.create(items);
      }
      setGroceryMsg(`Added ${items.length} item${items.length === 1 ? '' : 's'} to grocery list.`);
    } catch (err) {
      setGroceryMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setGroceryBusy(false);
    }
  };

  if (!hasActiveRepository()) {
    return (
      <div className="mx-auto max-w-lg pb-24">
        <ErrorBlock message="Data layer not ready." />
      </div>
    );
  }

  if (loading && !detail) {
    return (
      <div className="mx-auto max-w-lg pb-24">
        <LoadingBlock label="Loading recipe…" />
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="mx-auto max-w-lg pb-24">
        <ErrorBlock message={error} onRetry={() => { clearError(); void load(); }} />
      </div>
    );
  }

  if (!detail || !scaled || !plan) {
    return (
      <div className="mx-auto max-w-lg pb-24">
        <ErrorBlock message="Recipe not found." />
        <Link to="/recipes" className="mt-4 inline-block text-sm text-primary">
          ← Back to recipes
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg pb-28">
      <nav className="mb-3">
        <Link
          to="/recipes"
          className="inline-flex min-h-tap items-center text-sm font-medium text-primary"
        >
          ← Recipes
        </Link>
      </nav>

      <div className="mb-4 overflow-hidden rounded-card bg-surface shadow-card">
        <div className="flex justify-center bg-tint-cream/60 py-8">
          {detail.imageUrl ? (
            <img
              src={detail.imageUrl}
              alt=""
              className="max-h-48 rounded-2xl object-cover"
            />
          ) : (
            <PlaceholderThumb name={detail.title} tint="cream" size="lg" />
          )}
        </div>
        <div className="p-4">
          <h1 className="font-display text-2xl font-semibold text-ink">
            {detail.title}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {formatMinutes(detail.prepMin, detail.cookMin)}
            {detail.yieldNote ? ` · ${detail.yieldNote}` : ''}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <ServingsStepper value={servings} onChange={setServings} />
            <Link
              to={`/recipes/${detail.id}/edit`}
              className="min-h-tap text-sm font-medium text-primary"
            >
              Edit
            </Link>
          </div>
        </div>
      </div>

      <section className="mb-6">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">
          Ingredients
        </h2>
        <ul className="space-y-2">
          {plan.lines.map((pl, i) => {
            const presentation = presentCookStatus(pl.status);
            const scaledLine = scaled.ingredients[i];
            const name =
              getIngredientName(pl.line.ingredientId) || pl.line.rawText;
            return (
              <li
                key={`${pl.line.rawText}-${i}`}
                className="rounded-2xl bg-surface px-3 py-3 shadow-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">
                      {scaledLine?.qty != null && scaledLine.unit
                        ? `${scaledLine.qty} ${scaledLine.unit} `
                        : ''}
                      {name}
                      {pl.line.optional ? (
                        <span className="ml-1 text-xs font-normal text-ink-muted">
                          (optional)
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      Need {formatBaseQty(pl.needBase, pl.needDim)} · Have{' '}
                      {formatBaseQty(pl.haveBase, pl.needDim)}
                      {pl.shortfallBase != null && pl.shortfallBase > 0
                        ? ` · Short ${formatBaseQty(pl.shortfallBase, pl.needDim)}`
                        : ''}
                    </p>
                    {pl.line.unknownAllergens ? (
                      <div className="mt-1">
                        <AllergenUnknownBadge compact />
                      </div>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-medium',
                      statusChipClass(presentation.tone),
                    )}
                  >
                    {presentation.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">
          Steps
        </h2>
        <ol className="space-y-3">
          {detail.steps.map((step, i) => (
            <li
              key={step.id}
              className="flex gap-3 rounded-2xl bg-surface p-3 shadow-card"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-sm font-semibold text-primary">
                {i + 1}
              </span>
              <div>
                <p className="text-sm text-ink">{step.text}</p>
                {step.durationSec ? (
                  <p className="mt-1 text-xs text-ink-muted">
                    {Math.round(step.durationSec / 60)} min
                    {step.timerLabel ? ` · ${step.timerLabel}` : ''}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {groceryMsg ? (
        <p className="mb-3 text-sm text-ink-muted" role="status">
          {groceryMsg}
        </p>
      ) : null}

      <div className="fixed bottom-0 left-0 right-0 border-t border-black/[0.04] bg-surface-raised/95 px-4 py-3 pb-safe backdrop-blur">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={groceryBusy}
              onClick={() => void addMissingToGrocery()}
              className={cn(
                'min-h-tap flex-1 rounded-pill border border-black/[0.08] bg-surface px-3 text-sm font-semibold text-ink',
                'disabled:opacity-50',
              )}
            >
              Add missing to grocery
            </button>
            <button
              type="button"
              onClick={() =>
                navigate(
                  `/recipes/${detail.id}/cooking?servings=${servings}`,
                )
              }
              className="min-h-tap flex-1 rounded-pill bg-primary px-3 text-sm font-semibold text-white"
              data-testid="start-cooking"
            >
              Start cooking
            </button>
          </div>
          <button
            type="button"
            onClick={() =>
              navigate(`/recipes/${detail.id}/cook?servings=${servings}`)
            }
            className="min-h-tap w-full rounded-pill border border-primary/25 bg-primary/10 px-3 text-sm font-semibold text-primary"
          >
            Log cook (skip steps)
          </button>
        </div>
      </div>
    </div>
  );
}
