import { afterEach,beforeEach, describe, expect, it } from 'vitest';

import {
  isInQuietHours,
  loadDietarySettings,
  loadNotificationPrefs,
  loadUnitsDisplay,
  saveDietarySettings,
  saveNotificationPrefs,
  saveUnitsDisplay,
} from './prefs';

const mem = new Map<string, string>();

const storageMock = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => {
    mem.set(k, v);
  },
  removeItem: (k: string) => {
    mem.delete(k);
  },
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
};

describe('settings prefs', () => {
  beforeEach(() => {
    mem.clear();
    // vitest node — polyfill localStorage
    Object.defineProperty(globalThis, 'localStorage', {
      value: storageMock,
      configurable: true,
    });
  });

  afterEach(() => {
    mem.clear();
  });

  it('persists dietary allergens and flags', () => {
    saveDietarySettings({
      avoidAllergens: ['milk', 'peanut'],
      avoidDietaryFlags: ['gluten'],
      notes: 'no raw fish',
    });
    const loaded = loadDietarySettings();
    expect(loaded.avoidAllergens).toEqual(['milk', 'peanut']);
    expect(loaded.avoidDietaryFlags).toEqual(['gluten']);
    expect(loaded.notes).toBe('no raw fish');
  });

  it('notification quiet hours wrap midnight', () => {
    const prefs = {
      dailyShoppingBrief: true,
      quietHoursStart: 21,
      quietHoursEnd: 8,
    };
    expect(isInQuietHours(22, prefs)).toBe(true);
    expect(isInQuietHours(7, prefs)).toBe(true);
    expect(isInQuietHours(12, prefs)).toBe(false);
  });

  it('saves notification prefs and units', () => {
    saveNotificationPrefs({
      dailyShoppingBrief: false,
      quietHoursStart: 22,
      quietHoursEnd: 7,
    });
    expect(loadNotificationPrefs().dailyShoppingBrief).toBe(false);
    saveUnitsDisplay('metric');
    expect(loadUnitsDisplay()).toBe('metric');
  });
});
