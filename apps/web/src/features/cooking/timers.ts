/**
 * Step timers — pure state machine.
 * Multiple concurrent timers are supported (cooking is parallel).
 */

export type TimerStatus = 'idle' | 'running' | 'paused' | 'finished';

export type StepTimer = {
  readonly id: string;
  readonly stepIndex: number;
  readonly label: string;
  /** Total duration in ms. */
  readonly durationMs: number;
  /** Remaining ms when last (started|paused). */
  readonly remainingMs: number;
  readonly status: TimerStatus;
  /** Wall-clock when current running segment started (ms). */
  readonly segmentStartedAt: number | null;
  /** True once finished so UI can fire notification once. */
  readonly notified: boolean;
};

export type TimerState = {
  readonly timers: readonly StepTimer[];
};

export function createEmptyTimerState(): TimerState {
  return { timers: [] };
}

export function createTimer(input: {
  id: string;
  stepIndex: number;
  label: string;
  durationSec: number;
}): StepTimer {
  const durationMs = Math.max(0, Math.round(input.durationSec * 1000));
  return {
    id: input.id,
    stepIndex: input.stepIndex,
    label: input.label,
    durationMs,
    remainingMs: durationMs,
    status: 'idle',
    segmentStartedAt: null,
    notified: false,
  };
}

function recomputeRunning(timer: StepTimer, nowMs: number): StepTimer {
  if (timer.status !== 'running' || timer.segmentStartedAt == null) {
    return timer;
  }
  const elapsed = nowMs - timer.segmentStartedAt;
  const remaining = Math.max(0, timer.remainingMs - elapsed);
  if (remaining <= 0) {
    return {
      ...timer,
      remainingMs: 0,
      status: 'finished',
      segmentStartedAt: null,
    };
  }
  // Keep remainingMs as of segment start; UI uses live remaining via remainingOf.
  return timer;
}

/** Live remaining for display (does not mutate). */
export function remainingOf(timer: StepTimer, nowMs: number): number {
  if (timer.status === 'finished') return 0;
  if (timer.status !== 'running' || timer.segmentStartedAt == null) {
    return timer.remainingMs;
  }
  return Math.max(0, timer.remainingMs - (nowMs - timer.segmentStartedAt));
}

export function startTimer(
  state: TimerState,
  timerId: string,
  nowMs: number,
): TimerState {
  return {
    timers: state.timers.map((t) => {
      if (t.id !== timerId) return t;
      if (t.status === 'finished' || t.remainingMs <= 0) {
        return {
          ...t,
          remainingMs: t.durationMs,
          status: 'running',
          segmentStartedAt: nowMs,
          notified: false,
        };
      }
      if (t.status === 'running') return t;
      return {
        ...t,
        status: 'running',
        segmentStartedAt: nowMs,
      };
    }),
  };
}

export function pauseTimer(
  state: TimerState,
  timerId: string,
  nowMs: number,
): TimerState {
  return {
    timers: state.timers.map((t) => {
      if (t.id !== timerId) return t;
      if (t.status !== 'running') return t;
      const rem = remainingOf(t, nowMs);
      if (rem <= 0) {
        return {
          ...t,
          remainingMs: 0,
          status: 'finished',
          segmentStartedAt: null,
        };
      }
      return {
        ...t,
        remainingMs: rem,
        status: 'paused',
        segmentStartedAt: null,
      };
    }),
  };
}

export function resetTimer(state: TimerState, timerId: string): TimerState {
  return {
    timers: state.timers.map((t) => {
      if (t.id !== timerId) return t;
      return {
        ...t,
        remainingMs: t.durationMs,
        status: 'idle',
        segmentStartedAt: null,
        notified: false,
      };
    }),
  };
}

/**
 * Tick all running timers. Marks finished when remaining hits 0.
 * Returns timers that newly finished (for notifications).
 */
export function tickTimers(
  state: TimerState,
  nowMs: number,
): { state: TimerState; justFinished: readonly StepTimer[] } {
  const justFinished: StepTimer[] = [];
  const timers = state.timers.map((t) => {
    if (t.status !== 'running') return t;
    const rem = remainingOf(t, nowMs);
    if (rem <= 0) {
      const finished: StepTimer = {
        ...t,
        remainingMs: 0,
        status: 'finished',
        segmentStartedAt: null,
        notified: false,
      };
      justFinished.push(finished);
      return finished;
    }
    return recomputeRunning(t, nowMs);
  });
  return { state: { timers }, justFinished };
}

export function markNotified(state: TimerState, timerId: string): TimerState {
  return {
    timers: state.timers.map((t) =>
      t.id === timerId ? { ...t, notified: true } : t,
    ),
  };
}

export function upsertTimer(state: TimerState, timer: StepTimer): TimerState {
  const idx = state.timers.findIndex((t) => t.id === timer.id);
  if (idx < 0) return { timers: [...state.timers, timer] };
  const next = [...state.timers];
  next[idx] = timer;
  return { timers: next };
}

export function removeTimer(state: TimerState, timerId: string): TimerState {
  return { timers: state.timers.filter((t) => t.id !== timerId) };
}

export function formatRemaining(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ensureStepTimer(
  state: TimerState,
  stepIndex: number,
  durationSec: number,
  label: string,
): TimerState {
  const id = `step-${stepIndex}`;
  const existing = state.timers.find((t) => t.id === id);
  if (existing) return state;
  return upsertTimer(
    state,
    createTimer({ id, stepIndex, label, durationSec }),
  );
}
