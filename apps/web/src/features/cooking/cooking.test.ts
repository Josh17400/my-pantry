import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { DEMO_COOKING_RECIPE } from './demo-recipe';
import {
  COOKING_MODE_POLICY,
  cookingModeAllowsAds,
} from './policy';
import { buildStepChecklist } from './step-ingredients';
import {
  createEmptyTimerState,
  createTimer,
  ensureStepTimer,
  formatRemaining,
  markNotified,
  pauseTimer,
  remainingOf,
  startTimer,
  tickTimers,
  upsertTimer,
} from './timers';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('timer state transitions', () => {
  it('idle → running → paused → running → finished', () => {
    let state = createEmptyTimerState();
    const timer = createTimer({
      id: 'step-0',
      stepIndex: 0,
      label: 'Boil',
      durationSec: 10,
    });
    state = upsertTimer(state, timer);
    expect(state.timers[0]!.status).toBe('idle');

    const t0 = 1_000_000;
    state = startTimer(state, 'step-0', t0);
    expect(state.timers[0]!.status).toBe('running');
    expect(remainingOf(state.timers[0]!, t0)).toBe(10_000);

    // 3s later
    const t1 = t0 + 3_000;
    expect(remainingOf(state.timers[0]!, t1)).toBe(7_000);
    state = pauseTimer(state, 'step-0', t1);
    expect(state.timers[0]!.status).toBe('paused');
    expect(state.timers[0]!.remainingMs).toBe(7_000);

    // resume
    const t2 = t1 + 5_000;
    state = startTimer(state, 'step-0', t2);
    expect(state.timers[0]!.status).toBe('running');
    expect(remainingOf(state.timers[0]!, t2)).toBe(7_000);

    // finish
    const t3 = t2 + 7_000;
    const tick = tickTimers(state, t3);
    expect(tick.justFinished).toHaveLength(1);
    expect(tick.state.timers[0]!.status).toBe('finished');
    expect(remainingOf(tick.state.timers[0]!, t3)).toBe(0);

    const notified = markNotified(tick.state, 'step-0');
    expect(notified.timers[0]!.notified).toBe(true);
  });

  it('supports multiple concurrent timers', () => {
    let state = createEmptyTimerState();
    state = ensureStepTimer(state, 0, 60, 'Pasta');
    state = ensureStepTimer(state, 1, 30, 'Sauce');
    const t0 = 5_000;
    state = startTimer(state, 'step-0', t0);
    state = startTimer(state, 'step-1', t0);
    expect(state.timers.filter((x) => x.status === 'running')).toHaveLength(2);

    const t1 = t0 + 30_000;
    const tick = tickTimers(state, t1);
    const pasta = tick.state.timers.find((x) => x.id === 'step-0')!;
    const sauce = tick.state.timers.find((x) => x.id === 'step-1')!;
    expect(sauce.status).toBe('finished');
    expect(pasta.status).toBe('running');
    expect(remainingOf(pasta, t1)).toBe(30_000);
  });

  it('formats remaining as m:ss', () => {
    expect(formatRemaining(0)).toBe('0:00');
    expect(formatRemaining(65_000)).toBe('1:05');
    expect(formatRemaining(600_000)).toBe('10:00');
  });
});

describe('AdSlot absent from cooking mode', () => {
  it('policy forbids ads', () => {
    expect(COOKING_MODE_POLICY.adsAllowed).toBe(false);
    expect(cookingModeAllowsAds()).toBe(false);
  });

  it('CookingModeScreen source does not import or render AdSlot', () => {
    const src = readFileSync(path.join(here, 'CookingModeScreen.tsx'), 'utf8');
    expect(src).not.toMatch(/\bAdSlot\b/);
    expect(src).not.toMatch(/data-ad-slot/);
    expect(src).toContain('data-ads-allowed');
    expect(src).toContain('COOKING_MODE_POLICY');
  });

  it('CookingModePage route does not import AdSlot', () => {
    const page = readFileSync(
      path.join(here, '../../routes/CookingModePage.tsx'),
      'utf8',
    );
    expect(page).not.toMatch(/\bAdSlot\b/);
  });
});

describe('step checklist scaling', () => {
  it('scales quantities to servings and tags step-relevant lines', () => {
    const { items, stepRelevant } = buildStepChecklist(
      DEMO_COOKING_RECIPE,
      2,
      0,
    );
    const pasta = items.find((i) => i.name.toLowerCase().includes('spaghetti'));
    expect(pasta).toBeTruthy();
    // half of 340g at 2/4 servings
    expect(pasta!.qty).toBe(170);
    // step 0 mentions pasta / salt
    expect(stepRelevant.length).toBeGreaterThan(0);
  });
});
