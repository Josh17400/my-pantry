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
  candidateToSubstitution,
  catalogConversionContext,
  clearLineSubstitution,
  type CommittedDeduction,
  type CookMachineState,
  CookPreviewLine,
  createIdleState,
  ErrorBlock,
  formatBaseQty,
  groceryItemsFromCookLines,
  linesWithSubstitution,
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
  setLineOtherSubstitution,
  setLinePantrySubstitution,
  setLineSendToGrocery,
  setLineSkipped,
  startCook,
  SubstitutionPicker,
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
 * Renders outside AppShell so the fixed confirm bar is not under the tab bar.
 */
export function CookPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const fromCooking =
    searchParams.get('from') === 'cooking' ||
    searchParams.get('from') === 'steps';
  const { loading: recipeLoading, error: recipeError } = useRecipes();
  const pantry = usePantry();
  const grocery = useGrocery();

  const [machine, setMachine] = useState<CookMachineState>(createIdleState);
  const [servings, setServings] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [groceryNote, setGroceryNote] = useState<string | null>(null);
  const [subPickerIndex, setSubPickerIndex] = useState<number | null>(null);
  const forceAfterNegative = useRef(false);
  const recipeRef = useRef<Recipe | null>(null);

  const recipeHref = id ? `/recipes/${id}` : '/recipes';

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

  const pickerLine =
    subPickerIndex != null
      ? machine.lines.find((l) => l.index === subPickerIndex)
      : undefined;

  if (!hasActiveRepository()) {
    return (
      <div className="mx-auto min-h-screen max-w-lg bg-bg px-4 pb-24 pt-safe">
        <nav className="mb-3 pt-2">
          <Link
            to={recipeHref}
            className="inline-flex min-h-tap items-center text-sm font-medium text-primary"
          >
            ← Recipe
          </Link>
        </nav>
        <ErrorBlock message="Data layer not ready." />
      </div>
    );
  }

  if ((recipeLoading || machine.phase === 'idle') && !loadError) {
    return (
      <div className="mx-auto min-h-screen max-w-lg bg-bg px-4 pb-24 pt-safe">
        <nav className="mb-3 pt-2">
          <Link
            to={recipeHref}
            className="inline-flex min-h-tap items-center text-sm font-medium text-primary"
          >
            ← Recipe
          </Link>
        </nav>
        <LoadingBlock label="Preparing cook preview…" />
      </div>
    );
  }

  if (loadError || recipeError) {
    return (
      <div className="mx-auto min-h-screen max-w-lg bg-bg px-4 pb-24 pt-safe">
        <nav className="mb-3 pt-2">
          <Link
            to="/recipes"
            className="inline-flex min-h-tap items-center text-sm font-medium text-primary"
          >
            ← Recipes
          </Link>
        </nav>
        <ErrorBlock message={loadError ?? recipeError ?? 'Error'} />
      </div>
    );
  }

  const isPreview =
    machine.phase === 'preview' || machine.phase === 'negative_prompt';
  const isDone = machine.phase === 'done';
  const isUndone = machine.phase === 'undone';
  const subs = linesWithSubstitution(machine);

  return (
    <div
      className="mx-auto min-h-screen max-w-lg bg-bg px-4 pb-32 pt-safe"
      data-testid="cook-page"
      data-phase={machine.phase}
    >
      <nav className="mb-3 flex items-center justify-between gap-2 pt-2">
        <Link
          to={recipeHref}
          className="inline-flex min-h-tap items-center text-sm font-medium text-primary"
          data-testid="cook-back-recipe"
        >
          ← Recipe
        </Link>
        {fromCooking && isPreview ? (
          <span className="text-xs font-medium text-ink-muted">
            After steps
          </span>
        ) : null}
      </nav>

      <header className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          {isDone
            ? 'Cook complete'
            : isUndone
              ? 'Cook undone'
              : fromCooking
                ? 'Steps done · review deductions'
                : 'Cook preview'}
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">
          {machine.recipeTitle}
        </h1>
        {isPreview ? (
          <p className="mt-1 text-sm text-ink-muted">
            {fromCooking
              ? 'You finished the guided steps. Review what to take out of the pantry, then confirm.'
              : 'Review and edit what you actually used before the pantry updates. Nothing is deducted until you confirm.'}
          </p>
        ) : null}
      </header>

      {isPreview ? (
        <div className="mb-4">
          <ServingsStepper
            value={servings}
            onChange={setServings}
            disabled={busy}
          />
        </div>
      ) : null}

      {machine.phase === 'error' && machine.error ? (
        <div className="mb-4">
          <ErrorBlock message={machine.error} />
          <Link
            to={recipeHref}
            className="mt-3 inline-flex min-h-tap items-center text-sm font-medium text-primary"
          >
            ← Back to recipe
          </Link>
        </div>
      ) : null}

      {isDone ? (
        <div
          role="status"
          className="mb-4 rounded-card bg-fresh/10 p-4 text-sm text-fresh"
          data-testid="cook-success"
        >
          <p className="font-semibold text-base">Cook logged</p>
          <p className="mt-1 text-fresh/90">
            All deductions share event{' '}
            <code className="text-xs" data-testid="cook-event-id">
              {machine.cookEventId}
            </code>
            .
          </p>
          {machine.committed.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-ink">
              {machine.committed.map((c) => (
                <li key={c.clientTxnId}>
                  −{Math.abs(c.deltaBase)} base · {c.ingredientId}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-ink-muted">
              No pantry quantities changed (all lines skipped or noted only).
            </p>
          )}
          {groceryNote ? <p className="mt-2 text-ink">{groceryNote}</p> : null}
        </div>
      ) : null}

      {isUndone ? (
        <div
          role="status"
          className="mb-4 rounded-card bg-primary/10 p-4 text-sm text-primary"
          data-testid="cook-undone"
        >
          Cook undone — compensating entries written for the same meal. Pantry
          quantities are restored.
        </div>
      ) : null}

      {/* Substitution summary before commit */}
      {isPreview && subs.length > 0 ? (
        <section
          className="mb-4 rounded-card border border-primary/20 bg-primary/5 p-3"
          data-testid="sub-summary"
        >
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Substitutions before commit
          </h2>
          <ul className="mt-2 space-y-2">
            {subs.map((line) => {
              const s = line.substitution!;
              return (
                <li key={line.index} className="text-sm text-ink">
                  <span className="font-medium">{line.rawText}</span>
                  {' → '}
                  {s.kind === 'pantry' ? (
                    <span>
                      {s.name} (
                      {formatBaseQty(s.actualUsedBase, s.dim)} deducted)
                    </span>
                  ) : (
                    <span className="text-low">
                      {s.note} — noted, nothing deducted
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* On done/undone, collapse line editors into a quiet list */}
      {!isDone && !isUndone ? (
        <div className="space-y-3" data-testid="cook-preview-lines">
          {machine.lines.map((line) => (
            <CookPreviewLine
              key={line.index}
              line={line}
              disabled={busy || machine.phase === 'committing'}
              onActualUsedChange={(index, value) =>
                setMachine((s) => setLineActualUsed(s, index, value))
              }
              onSkippedChange={(index, skipped) =>
                setMachine((s) => setLineSkipped(s, index, skipped))
              }
              onOpenSubstitution={(index) => setSubPickerIndex(index)}
              onClearSubstitution={(index) =>
                setMachine((s) => clearLineSubstitution(s, index))
              }
              onGroceryToggle={(index, send) =>
                setMachine((s) => setLineSendToGrocery(s, index, send))
              }
            />
          ))}
        </div>
      ) : (
        <div className="mb-4 space-y-2" data-testid="cook-result-lines">
          {machine.lines.map((line) => (
            <div
              key={line.index}
              className="rounded-xl bg-surface px-3 py-2 text-sm shadow-card"
            >
              <span className="font-medium text-ink">{line.rawText}</span>
              {line.substitution?.kind === 'pantry' ? (
                <span className="mt-0.5 block text-xs text-primary">
                  Used {line.substitution.name}
                </span>
              ) : line.substitution?.kind === 'other' ? (
                <span className="mt-0.5 block text-xs text-low">
                  Other: {line.substitution.note} (nothing deducted)
                </span>
              ) : line.skipped ? (
                <span className="mt-0.5 block text-xs text-ink-muted">
                  Skipped
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Confirm bar — fixed bottom; page is outside AppShell so tab bar cannot cover it */}
      {isPreview ? (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-black/[0.04] bg-surface-raised/95 px-4 py-3 pb-safe backdrop-blur"
          data-testid="cook-confirm-bar"
        >
          <div className="mx-auto flex max-w-lg flex-col gap-2">
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
            <Link
              to={recipeHref}
              className="inline-flex min-h-tap w-full items-center justify-center text-sm font-medium text-ink-muted"
            >
              Cancel · back to recipe
            </Link>
          </div>
        </div>
      ) : null}

      {/* Done / undone action bar */}
      {(isDone || isUndone) && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-black/[0.04] bg-surface-raised/95 px-4 py-3 pb-safe backdrop-blur"
          data-testid="cook-done-bar"
        >
          <div className="mx-auto flex max-w-lg flex-col gap-2">
            {isDone && machine.canUndo ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onUndo()}
                className="min-h-tap w-full rounded-pill border border-fresh/30 bg-surface text-sm font-semibold text-ink disabled:opacity-50"
                data-testid="cook-undo"
              >
                Undo this cook
              </button>
            ) : null}
            <Link
              to={recipeHref}
              className="inline-flex min-h-tap w-full items-center justify-center rounded-pill bg-primary text-sm font-semibold text-white"
              data-testid="cook-done-recipe"
            >
              Done → recipe
            </Link>
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

      {pickerLine ? (
        <SubstitutionPicker
          line={pickerLine}
          pantry={pantry.items}
          onClose={() => setSubPickerIndex(null)}
          onSelectOther={(note) => {
            setMachine((s) =>
              setLineOtherSubstitution(s, pickerLine.index, note),
            );
            setSubPickerIndex(null);
          }}
          onSelectPantry={(candidate) => {
            const sub = candidateToSubstitution(pickerLine, candidate);
            setMachine((s) =>
              setLinePantrySubstitution(s, pickerLine.index, sub),
            );
            setSubPickerIndex(null);
          }}
        />
      ) : null}
    </div>
  );
}
