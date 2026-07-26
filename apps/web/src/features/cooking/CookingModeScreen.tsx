import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import type { Recipe } from '../../../../../packages/core/src/recipes/types.ts';
import { cn } from '../../ui/cn';
import { releaseKeepAwake, requestKeepAwake } from './keep-awake';
import { notifyTimerDone } from './notify';
import { COOKING_MODE_POLICY, cookingModeAllowsAds } from './policy';
import {
  buildStepChecklist,
  formatChecklistQty,
} from './step-ingredients';
import {
  createEmptyTimerState,
  ensureStepTimer,
  formatRemaining,
  markNotified,
  pauseTimer,
  remainingOf,
  startTimer,
  tickTimers,
  type TimerState,
} from './timers';

export type CookingModeScreenProps = {
  recipe: Recipe;
  servings: number;
  onServingsChange?: (n: number) => void;
  /** When set, used instead of react-router navigate (tests). */
  onExitToCookPreview?: (recipeId: string, servings: number) => void;
};

/**
 * Hands-busy cooking view — large type, one step, concurrent timers.
 * Ads forbidden (see policy). Exit → existing cook deduct preview.
 */
export function CookingModeScreen({
  recipe,
  servings,
  onServingsChange,
  onExitToCookPreview,
}: CookingModeScreenProps) {
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [timerState, setTimerState] = useState<TimerState>(createEmptyTimerState);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [checked, setChecked] = useState<ReadonlySet<number>>(() => new Set());
  const [keepAwakeOk, setKeepAwakeOk] = useState(false);

  const steps = recipe.steps;
  const step = steps[stepIndex];
  const totalSteps = steps.length;

  // Policy: ads never allowed — assert for tests / future ad injection guards.
  if (cookingModeAllowsAds()) {
    throw new Error('Cooking mode must never allow ads');
  }

  useEffect(() => {
    let cancelled = false;
    void requestKeepAwake().then((ok) => {
      if (!cancelled) setKeepAwakeOk(ok);
    });
    return () => {
      cancelled = true;
      void releaseKeepAwake();
    };
  }, []);

  // Ensure timer exists for current step when it has a duration.
  useEffect(() => {
    if (!step?.durationSec || step.durationSec <= 0) return;
    const label = step.timerLabel ?? `Step ${stepIndex + 1}`;
    setTimerState((s) =>
      ensureStepTimer(s, stepIndex, step.durationSec!, label),
    );
  }, [step, stepIndex]);

  // Tick running timers ~4Hz; fire notifications on finish.
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      setTimerState((prev) => {
        const { state, justFinished } = tickTimers(prev, now);
        let next = state;
        for (const t of justFinished) {
          if (!t.notified) {
            void notifyTimerDone(t.label);
            next = markNotified(next, t.id);
          }
        }
        return next;
      });
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  const checklist = useMemo(
    () => buildStepChecklist(recipe, servings, stepIndex),
    [recipe, servings, stepIndex],
  );

  const displayItems =
    checklist.stepRelevant.length > 0
      ? checklist.stepRelevant
      : checklist.items;

  const stepTimer = timerState.timers.find((t) => t.stepIndex === stepIndex);
  const activeTimers = timerState.timers.filter(
    (t) => t.status === 'running' || t.status === 'paused' || t.status === 'finished',
  );

  const goExit = useCallback(() => {
    if (onExitToCookPreview) {
      onExitToCookPreview(recipe.id, servings);
      return;
    }
    void navigate(
      `/recipes/${recipe.id}/cook?servings=${encodeURIComponent(String(servings))}`,
    );
  }, [navigate, onExitToCookPreview, recipe.id, servings]);

  const toggleCheck = (index: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  return (
    <div
      className="flex min-h-screen flex-col bg-bg text-ink"
      data-testid="cooking-mode"
      data-ads-allowed={String(COOKING_MODE_POLICY.adsAllowed)}
      data-recipe-id={recipe.id}
    >
      {/* Ads are forbidden here (policy.adsAllowed === false). */}
      <header className="border-b border-black/[0.06] bg-surface px-4 pb-3 pt-safe">
        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            type="button"
            onClick={goExit}
            className="min-h-11 min-w-11 rounded-pill px-3 text-sm font-semibold text-primary"
            data-testid="cooking-exit"
          >
            Exit
          </button>
          <p className="text-center text-xs font-medium uppercase tracking-wide text-ink-muted">
            Cooking
            {keepAwakeOk ? ' · stay awake' : ''}
          </p>
          <div className="flex min-w-[4.5rem] justify-end">
            {onServingsChange ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Fewer servings"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary"
                  onClick={() => onServingsChange(Math.max(1, servings - 1))}
                >
                  −
                </button>
                <span className="min-w-[2rem] text-center text-sm font-semibold">
                  {servings}
                </span>
                <button
                  type="button"
                  aria-label="More servings"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary"
                  onClick={() => onServingsChange(servings + 1)}
                >
                  +
                </button>
              </div>
            ) : (
              <span className="text-sm font-semibold text-ink-muted">
                {servings} srv
              </span>
            )}
          </div>
        </div>
        <h1 className="mt-2 font-display text-xl font-semibold tracking-tight text-ink">
          {recipe.title}
        </h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          Step {Math.min(stepIndex + 1, Math.max(totalSteps, 1))} of{' '}
          {Math.max(totalSteps, 1)}
        </p>
      </header>

      <main className="flex flex-1 flex-col px-4 py-5">
        {totalSteps === 0 ? (
          <p className="text-lg text-ink-muted">No steps on this recipe.</p>
        ) : (
          <>
            <div
              className={cn(
                'flex-1 rounded-card bg-surface p-5 shadow-card',
                !prefersReduced && 'transition-none',
              )}
            >
              <p
                className="font-display text-[1.65rem] font-semibold leading-snug text-ink"
                data-testid="cooking-step-text"
              >
                {step?.text}
              </p>

              {stepTimer ? (
                <div
                  className="mt-6 rounded-2xl bg-primary/10 p-4"
                  data-testid="cooking-step-timer"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                    {stepTimer.label}
                  </p>
                  <p className="mt-1 font-display text-5xl font-semibold tabular-nums text-ink">
                    {formatRemaining(remainingOf(stepTimer, nowMs))}
                  </p>
                  <div className="mt-4 flex gap-2">
                    {stepTimer.status === 'running' ? (
                      <button
                        type="button"
                        className="min-h-14 flex-1 rounded-pill bg-primary text-lg font-semibold text-white"
                        onClick={() =>
                          setTimerState((s) =>
                            pauseTimer(s, stepTimer.id, Date.now()),
                          )
                        }
                      >
                        Pause
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="min-h-14 flex-1 rounded-pill bg-primary text-lg font-semibold text-white"
                        onClick={() =>
                          setTimerState((s) =>
                            startTimer(s, stepTimer.id, Date.now()),
                          )
                        }
                        data-testid="cooking-timer-start"
                      >
                        {stepTimer.status === 'paused' ? 'Resume' : 'Start timer'}
                      </button>
                    )}
                  </div>
                  {stepTimer.status === 'finished' ? (
                    <p className="mt-2 text-sm font-semibold text-fresh" role="status">
                      Timer finished
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <section className="mt-5" aria-label="Ingredients for this step">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {checklist.stepRelevant.length > 0
                  ? 'This step'
                  : 'Ingredients (scaled)'}
              </h2>
              <ul className="space-y-2" data-testid="cooking-checklist">
                {displayItems.map((item) => {
                  const isOn = checked.has(item.index);
                  return (
                    <li key={item.index}>
                      <button
                        type="button"
                        onClick={() => toggleCheck(item.index)}
                        className={cn(
                          'flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left shadow-card',
                          isOn ? 'bg-fresh/15' : 'bg-surface',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 text-sm font-bold',
                            isOn
                              ? 'border-fresh bg-fresh text-white'
                              : 'border-ink-muted/40 text-transparent',
                          )}
                          aria-hidden
                        >
                          ✓
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              'block text-base font-semibold text-ink',
                              isOn && 'line-through opacity-70',
                            )}
                          >
                            {item.name}
                          </span>
                          <span className="text-sm text-ink-muted">
                            {formatChecklistQty(item)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            {activeTimers.length > 1 ? (
              <section className="mt-5" aria-label="All active timers">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Active timers
                </h2>
                <ul className="space-y-2" data-testid="cooking-all-timers">
                  {activeTimers.map((t) => (
                    <li
                      key={t.id}
                      className="flex min-h-12 items-center justify-between rounded-2xl bg-surface px-3 shadow-card"
                    >
                      <span className="text-sm font-medium text-ink">
                        {t.label}
                      </span>
                      <span className="font-display text-lg font-semibold tabular-nums">
                        {formatRemaining(remainingOf(t, nowMs))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </main>

      <footer className="sticky bottom-0 border-t border-black/[0.06] bg-surface-raised/95 px-4 py-3 pb-safe backdrop-blur">
        <div className="mx-auto flex max-w-lg gap-3">
          <button
            type="button"
            disabled={stepIndex <= 0}
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            className="min-h-14 flex-1 rounded-pill border border-black/[0.1] bg-surface text-lg font-semibold text-ink disabled:opacity-40"
            data-testid="cooking-back"
          >
            Back
          </button>
          {stepIndex < totalSteps - 1 ? (
            <button
              type="button"
              onClick={() => setStepIndex((i) => i + 1)}
              className="min-h-14 flex-[1.4] rounded-pill bg-primary text-lg font-semibold text-white"
              data-testid="cooking-next"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={goExit}
              className="min-h-14 flex-[1.4] rounded-pill bg-primary text-lg font-semibold text-white"
              data-testid="cooking-finish"
            >
              Finish → log cook
            </button>
          )}
        </div>
        <p className="mt-2 text-center text-[11px] text-ink-muted">
          Finish opens the cook preview to confirm pantry deductions.
          <Link
            to={`/recipes/${recipe.id}`}
            className="ml-1 font-medium text-primary"
          >
            Recipe
          </Link>
        </p>
      </footer>
    </div>
  );
}
