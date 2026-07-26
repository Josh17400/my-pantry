import { describe, expect, it } from 'vitest';

import { defaultQuickPrefs, SUGGESTED_CATALOG } from './prefs';

describe('quick-consume prefs', () => {
  it('ships default pinned tiles for yogurt, apple, egg', () => {
    const prefs = defaultQuickPrefs();
    const names = prefs.pins.map((p) => p.name.toLowerCase());
    expect(names).toContain('yogurt');
    expect(names).toContain('apple');
    expect(names).toContain('egg');
  });

  it('suggested catalog does not duplicate default pins', () => {
    const prefs = defaultQuickPrefs();
    const pinned = new Set(prefs.pins.map((p) => p.ingredientId));
    for (const s of SUGGESTED_CATALOG) {
      // banana / string-cheese / carrot should not be in default pins
      expect(pinned.has(s.ingredientId)).toBe(false);
    }
  });

  it('egg default qty is 1 count — stepper multiplies without extra taps for 1', () => {
    const egg = defaultQuickPrefs().pins.find((p) => p.ingredientId === 'egg');
    expect(egg?.defaultQtyBase).toBe(1);
    expect(egg?.dim).toBe('count');
  });
});
