/**
 * WCAG relative luminance + contrast ratio helpers.
 * Used by the build-gate contrast test.
 */

function srgbChannelToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Parse #RGB or #RRGGBB to [r,g,b] 0–255. */
export function parseHex(hex: string): [number, number, number] {
  const raw = hex.replace('#', '').trim();
  if (raw.length === 3) {
    const r = parseInt(raw[0]! + raw[0]!, 16);
    const g = parseInt(raw[1]! + raw[1]!, 16);
    const b = parseInt(raw[2]! + raw[2]!, 16);
    return [r, g, b];
  }
  if (raw.length !== 6) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return [r, g, b];
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  const R = srgbChannelToLinear(r);
  const G = srgbChannelToLinear(g);
  const B = srgbChannelToLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** Contrast ratio between two colors (1–21). */
export function contrastRatio(fg: string, bg: string): number {
  const L1 = relativeLuminance(fg);
  const L2 = relativeLuminance(bg);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function minRatioForLevel(level: 'normal' | 'large' | 'ui'): number {
  return level === 'normal' ? 4.5 : 3.0;
}
