import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import {
  DEFAULT_DEVICE_ID,
  DEFAULT_HOUSEHOLD_ID,
  DEFAULT_USER_ID,
} from '../db/constants';
import {
  acceptNegativeAndContinue,
  beginCommit,
  buildCookTxns,
  buildUndoTxns,
  cancelNegativePrompt,
  catalogConversionContext,
  type CommittedDeduction,
  type CookMachineState,
  CookPreviewLine,
  createIdleState,
  ErrorBlock,
  groceryItemsFromCookLines,
  LoadingBlock,
  markCommitError,
  markCommitSuccess,
  markUndone,
  NegativeStockPrompt,
  newCookEventId,
  pantryItemsToStock,
  recipeDetailToCore,
  replanCook,
  requestConfirm,
  ServingsStepper,
  setLineActualUsed,
  setLineSendToGrocery,
  setLineSkipped,
  setLineSubstitution,
  startCook,
} from '../features/recipes';
import type { Recipe } from '../features/recipes/core-imports';
import {
  hasActiveRepository,
  useGrocery,
  usePantry,
  useRecipes,
} from '../state';
import { usePantryStore } from '../state/pantry-store';
import { useRecipesStore } from '../state/recipes-store';
import { cn } from '../ui/cn';

/**
 * Cook flow — planCook made visible.
 * Always preview + edit before commit; one cookEventId; undo; negative prompt.
 */
export function CookPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { loading: recipeLoading, error: recipeError } = useRecipes();
  const pantry = usePantry();
  const grocery = useGrocery();

  const [machine, setMachine] = useState<CookMachineState>(createIdleState);
  const [servings, setServings] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [groceryNote, setGroceryNote] = useState<string | null>(null);
  const forceAfterNegative = useRef(false);
  const recipeRef = useRef<Recipe | null>(null);

  const boot = useCallback(async () => {
    if (!id || !hasActiveRepository()) return;
    setLoadError(null);
    try {
      // Stable store actions — do not close over whole store objects.
      const detail = await useRecipesStore.getState().get(id);
      if (!detail) {
        setLoadError('Recipe not found.');
        return;
      }
      await usePantryStore.getState().load();
      const core = recipeDetailToCore(detail);
      recipeRef.current = core;
      const sParam = searchParams.get('servings');
      const s =
        sParam && Number.isFinite(Number(sParam)) && Number(sParam) > 0
          ? Number(sParam)
          : detail.servings;
      setServings(s);
      const items = usePantryStore.getState().items;
      setMachine(
        startCook({
          recipe: core,
          servings: s,
          pantry: pantryItemsToStock(items),
          ctx: catalogConversionContext(),
        }),
      );
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, [id, searchParams]);

  useEffect(() => {
    void boot();
  }, [boot]);

  // Live replan when servings or pantry change (preview only)
  useEffect(() => {
    const recipe = recipeRef.current;
    if (!recipe) return;
    if (machine.phase !== 'preview') return;
    setMachine((prev) => {
      if (prev.phase !== 'preview') return prev;
      return replanCook(prev, {
        recipe,
        servings,
        pantry: pantryItemsToStock(pantry.items),
        ctx: catalogConversionContext(),
      });
    });
    // Intentionally omit machine.phase from deps to avoid replan loops on every edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servings, pantry.items]);

  const commitCook = async (state: CookMachineState) => {
    setBusy(true);
    setGroceryNote(null);
    let next = beginCommit(state);
    setMachine(next);
    try {
      const cookEventId = newCookEventId();
      const meta = {
        householdId: pantry.householdId || DEFAULT_HOUSEHOLD_ID,
        deviceId: DEFAULT_DEVICE_ID,
        userId: DEFAULT_USER_ID,
      };
      const txns = buildCookTxns(next, meta, cookEventId);
      const committed: CommittedDeduction[] = [];

      for (const txn of txns) {
        await pantry.appendTxn(txn);
        if (txn.kind === 'relative') {
          committed.push({
            ingredientId: txn.ingredientId,
            formId: txn.formId,
            deltaBase: txn.deltaBase,
            clientTxnId: txn.clientTxnId,
          });
        }
      }

      const groceryItems = groceryItemsFromCookLines(next.recipeId, next.lines);
      if (groceryItems.length > 0) {
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
          await grocery.updateItems([...existing, ...groceryItems]);
        } else {
          await grocery.create(groceryItems);
        }
        setGroceryNote(
          `Added ${groceryItems.length} shortfall item(s) to the grocery list.`,
        );
      }

      next = markCommitSuccess(next, cookEventId, committed);
      setMachine(next);
    } catch (err) {
      setMachine(
        markCommitError(
          next,
          err instanceof Error ? err.message : String(err),
        ),
      );
    } finally {
      setBusy(false);
      forceAfterNegative.current = false;
    }
  };

  const onConfirm = () => {
    if (busy) return;
    const checked = requestConfirm(machine);
    setMachine(checked);
    if (checked.phase === 'negative_prompt') return;
    void commitCook(checked);
  };

  const onProceedDespiteNegative = () => {
    const accepted = acceptNegativeAndContinue(machine);
    forceAfterNegative.current = true;
    setMachine(accepted);
    void commitCook(accepted);
  };

  const onUndo = async () => {
    if (!machine.canUndo || busy) return;
    setBusy(true);
    try {
      const meta = {
        householdId: pantry.householdId || DEFAULT_HOUSEHOLD_ID,
        deviceId: DEFAULT_DEVICE_ID,
        userId: DEFAULT_USER_ID,
      };
      const undoTxns = buildUndoTxns(machine, meta);
      for (const txn of undoTxns) {
        await pantry.appendTxn(txn);
      }
      setMachine(markUndone(machine));
    } catch (err) {
      setMachine(
        markCommitError(
          machine,
          err instanceof Error ? err.message : String(err),
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  if (!hasActiveRepository()) {
    return (
      <div className="mx-auto max-w-lg pb-24">
        <ErrorBlock message="Data layer not ready." />
      </div>
    );
  }

  if ((recipeLoading || machine.phase === 'idle') && !loadError) {
    return (
      <div className="mx-auto max-w-lg pb-24">
        <LoadingBlock label="Preparing cook preview…" />
      </div>
    );
  }

  if (loadError || recipeError) {
    return (
      <div className="mx-auto max-w-lg pb-24">
        <ErrorBlock message={loadError ?? recipeError ?? 'Error'} />
        <Link to="/recipes" className="mt-4 inline-block text-sm text-primary">
          ← Recipes
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg pb-32">
      <nav className="mb-3">
        <Link
          to={id ? `/recipes/${id}` : '/recipes'}
          className="inline-flex min-h-tap items-center text-sm font-medium text-primary"
        >
          ← Recipe
        </Link>
      </nav>

      <header className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          Cook preview
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">
          {machine.recipeTitle}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Review and edit what you actually used before the pantry updates.
          Nothing is deducted until you confirm.
        </p>
      </header>

      {(machine.phase === 'preview' || machine.phase === 'negative_prompt') && (
        <div className="mb-4">
          <ServingsStepper
            value={servings}
            onChange={setServings}
            disabled={busy}
          />
        </div>
      )}

      {machine.phase === 'error' && machine.error ? (
        <div className="mb-4">
          <ErrorBlock message={machine.error} />
        </div>
      ) : null}

      {machine.phase === 'done' ? (
        <div
          role="status"
          className="mb-4 rounded-card bg-fresh/10 p-4 text-sm text-fresh"
        >
          <p className="font-semibold">Cook logged</p>
          <p className="mt-1 text-fresh/90">
            All deductions share event{' '}
            <code className="text-xs">{machine.cookEventId}</code>.
          </p>
          {groceryNote ? <p className="mt-2">{groceryNote}</p> : null}
          {machine.canUndo ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onUndo()}
              className="mt-3 min-h-tap rounded-pill border border-fresh/30 bg-surface px-4 text-sm font-semibold text-ink"
            >
              Undo this cook
            </button>
          ) : null}
        </div>
      ) : null}

      {machine.phase === 'undone' ? (
        <div
          role="status"
          className="mb-4 rounded-card bg-primary/10 p-4 text-sm text-primary"
        >
          Cook undone — compensating entries written for the same meal.
        </div>
      ) : null}

      <div className="space-y-3" data-testid="cook-preview-lines">
        {machine.lines.map((line) => (
          <CookPreviewLine
            key={line.index}
            line={line}
            disabled={
              busy ||
              machine.phase === 'done' ||
              machine.phase === 'undone'
            }
            onActualUsedChange={(index, value) =>
              setMachine((s) => setLineActualUsed(s, index, value))
            }
            onSkippedChange={(index, skipped) =>
              setMachine((s) => setLineSkipped(s, index, skipped))
            }
            onSubstitutionChange={(index, note) =>
              setMachine((s) => setLineSubstitution(s, index, note))
            }
            onGroceryToggle={(index, send) =>
              setMachine((s) => setLineSendToGrocery(s, index, send))
            }
          />
        ))}
      </div>

      {(machine.phase === 'preview' || machine.phase === 'negative_prompt') && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-black/[0.04] bg-surface-raised/95 px-4 py-3 pb-safe backdrop-blur">
          <div className="mx-auto max-w-lg">
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className={cn(
                'min-h-tap w-full rounded-pill bg-primary text-sm font-semibold text-white',
                'disabled:opacity-50',
              )}
              data-testid="cook-confirm"
            >
              {busy ? 'Updating pantry…' : 'Confirm cook'}
            </button>
          </div>
        </div>
      )}

      {machine.phase === 'negative_prompt' ? (
        <NegativeStockPrompt
          lines={machine.lines}
          candidateIndices={machine.negativeCandidates}
          busy={busy}
          onAdjust={() => setMachine((s) => cancelNegativePrompt(s))}
          onProceed={onProceedDespiteNegative}
        />
      ) : null}
    </div>
  );
}
