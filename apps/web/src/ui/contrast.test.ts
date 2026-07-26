import { describe, expect, it } from 'vitest';

import {
  contrastRatio,
  minRatioForLevel,
} from './contrast';
import {
  colors,
  contrastPairs,
  forbiddenTextColors,
  statusTextColor,
} from './tokens';

describe('design token contrast (WCAG AA gate)', () => {
  it.each(
    contrastPairs.map((pair) => [pair.name, pair] as const),
  )('%s meets AA threshold', (_name, pair) => {
    const ratio = contrastRatio(pair.fg, pair.bg);
    const min = minRatioForLevel(pair.level);
    expect(
      ratio,
      `${pair.name}: ${pair.fg} on ${pair.bg} = ${ratio.toFixed(2)}:1 (need ${min}:1 for ${pair.level})`,
    ).toBeGreaterThanOrEqual(min);
  });

  it('documents every pair ratio for the report table', () => {
    const rows = contrastPairs.map((pair) => {
      const ratio = contrastRatio(pair.fg, pair.bg);
      const min = minRatioForLevel(pair.level);
      return {
        name: pair.name,
        fg: pair.fg,
        bg: pair.bg,
        ratio: Number(ratio.toFixed(2)),
        min,
        pass: ratio >= min,
      };
    });
    // Always log for report pickup; assert all pass.
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(rows, null, 2));
    expect(rows.every((r) => r.pass)).toBe(true);
  });

  it('never uses low-fill (#C0741F) as a status text color', () => {
    for (const [band, hex] of Object.entries(statusTextColor)) {
      expect(
        hex.toUpperCase(),
        `statusTextColor.${band} must not be low-fill`,
      ).not.toBe(colors.lowFill.toUpperCase());
    }
    for (const forbidden of forbiddenTextColors) {
      expect(forbidden.toUpperCase()).toBe(colors.lowFill.toUpperCase());
      const usedAsStatusText = Object.values(statusTextColor).some(
        (c) => c.toUpperCase() === forbidden.toUpperCase(),
      );
      expect(usedAsStatusText).toBe(false);
    }
  });

  it('low text token differs from low-fill and both are on the palette', () => {
    expect(colors.low).toBe('#8F5410');
    expect(colors.lowFill).toBe('#C0741F');
    expect(colors.low).not.toBe(colors.lowFill);
    // low text is AA on bg; low-fill is not
    expect(contrastRatio(colors.low, colors.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.lowFill, colors.bg)).toBeLessThan(4.5);
  });

  it('primary is yellow-olive (not forest green)', () => {
    // Parse primary #484C20 — G slightly above R, B lowest (hue ~68°)
    const hex = colors.primary.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    expect(g).toBeGreaterThanOrEqual(r);
    expect(r).toBeGreaterThan(b);
    // Green must not dominate red by a wide margin (that would be forest)
    expect(g - r).toBeLessThan(30);
  });
});
