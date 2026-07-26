import { describe, expect, it } from 'vitest';

import {
  type CookLogEvent,
  DEFAULT_COOK_WINDOW_MS,
  findDuplicateCook,
} from '../../src/dedupe';

const baseLog: CookLogEvent[] = [
  {
    cookEventId: 'cook-1',
    recipeId: 'spaghetti-bolognese',
    occurredAt: '2026-07-25T18:00:00.000Z',
    userId: 'alex',
    userDisplayName: 'Alex',
    deviceId: 'phone-a',
  },
  {
    cookEventId: 'cook-2',
    recipeId: 'chicken-parm',
    occurredAt: '2026-07-25T12:00:00.000Z',
    userId: 'sam',
    userDisplayName: 'Sam',
  },
];

describe('findDuplicateCook', () => {
  it('finds same recipe inside default 3h window', () => {
    const hit = findDuplicateCook(
      baseLog,
      {
        recipeId: 'spaghetti-bolognese',
        occurredAt: '2026-07-25T18:20:00.000Z',
      },
      { windowMs: DEFAULT_COOK_WINDOW_MS },
    );
    expect(hit).not.toBeNull();
    expect(hit!.prior.cookEventId).toBe('cook-1');
    expect(hit!.prior.userDisplayName).toBe('Alex');
    expect(hit!.defaultAction).toBe('merge');
    expect(hit!.deltaMs).toBe(20 * 60 * 1000);
  });

  it('returns null outside the window', () => {
    const hit = findDuplicateCook(baseLog, {
      recipeId: 'spaghetti-bolognese',
      occurredAt: '2026-07-25T22:00:00.000Z', // +4h
    });
    expect(hit).toBeNull();
  });

  it('boundary: exactly at window edge is a hit', () => {
    const hit = findDuplicateCook(baseLog, {
      recipeId: 'spaghetti-bolognese',
      occurredAt: '2026-07-25T21:00:00.000Z', // +3h exact
    });
    expect(hit).not.toBeNull();
    expect(hit!.deltaMs).toBe(DEFAULT_COOK_WINDOW_MS);
  });

  it('boundary: one ms past window is null', () => {
    const hit = findDuplicateCook(baseLog, {
      recipeId: 'spaghetti-bolognese',
      occurredAt: '2026-07-25T21:00:00.001Z',
    });
    expect(hit).toBeNull();
  });

  it('different recipeId is not a duplicate', () => {
    const hit = findDuplicateCook(baseLog, {
      recipeId: 'other-recipe',
      occurredAt: '2026-07-25T18:05:00.000Z',
    });
    expect(hit).toBeNull();
  });

  it('uses injected now when occurredAt omitted', () => {
    const hit = findDuplicateCook(
      baseLog,
      { recipeId: 'spaghetti-bolognese' },
      { now: () => new Date('2026-07-25T18:30:00.000Z') },
    );
    expect(hit).not.toBeNull();
    expect(hit!.prior.cookEventId).toBe('cook-1');
  });

  it('picks closest prior when multiple in window', () => {
    const log: CookLogEvent[] = [
      {
        cookEventId: 'a',
        recipeId: 'soup',
        occurredAt: '2026-07-25T10:00:00.000Z',
        userId: 'u1',
      },
      {
        cookEventId: 'b',
        recipeId: 'soup',
        occurredAt: '2026-07-25T11:30:00.000Z',
        userId: 'u2',
      },
    ];
    const hit = findDuplicateCook(log, {
      recipeId: 'soup',
      occurredAt: '2026-07-25T11:45:00.000Z',
    });
    expect(hit!.prior.cookEventId).toBe('b');
  });
});
