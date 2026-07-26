/**
 * Design tokens — measured from mockups (DESIGN.md). Do not adjust by eye.
 * Primary is yellow-olive (hue ≈ 68°), not forest green.
 */

export const colors = {
  bg: '#ECEAE4',
  surface: '#F7F6F2',
  surfaceRaised: '#FCFCFC',
  primary: '#484C20',
  primarySoft: '#585C2C',
  text: '#1F1D18',
  fresh: '#3B602D',
  /** Status text only — "Getting low". Never use for body copy on fill. */
  low: '#8F5410',
  /**
   * Bars, dots, icons only. Fails WCAG AA as text (3.03:1 on bg).
   * Never assign to color / text-color.
   */
  lowFill: '#C0741F',
  critical: '#9B4514',
  textMuted: '#6E6A5A',
  sage: '#CCD4BC',
  tan: '#E0D8C0',
  sky: '#CCD4D4',
  cream: '#E0D4C8',
  white: '#FFFFFF',
  /**
   * Track behind freshness bars.
   * Chosen light enough that low-fill (#C0741F) meets 3:1 non-text contrast
   * (darker warm greys fail against low-fill's mid luminance).
   */
  barTrack: '#EFECE4',
} as const;

export type ColorToken = keyof typeof colors;

export type StatusBand = 'fresh' | 'low' | 'critical';

/** Semantic status → text color (contrast-safe). */
export const statusTextColor: Record<StatusBand, string> = {
  fresh: colors.fresh,
  low: colors.low,
  critical: colors.critical,
};

/** Semantic status → fill color for bars/dots/icons (low uses vibrant fill). */
export const statusFillColor: Record<StatusBand, string> = {
  fresh: colors.fresh,
  low: colors.lowFill,
  critical: colors.critical,
};

export type TintName = 'sage' | 'tan' | 'sky' | 'cream';

export const tints: Record<TintName, string> = {
  sage: colors.sage,
  tan: colors.tan,
  sky: colors.sky,
  cream: colors.cream,
};

/**
 * Foreground/background pairs the design system actually paints for text or UI chrome.
 * Used by the contrast build gate.
 */
export type ContrastPair = {
  name: string;
  fg: string;
  bg: string;
  /** 'normal' = 4.5:1, 'large' | 'ui' = 3.0:1 */
  level: 'normal' | 'large' | 'ui';
};

export const contrastPairs: readonly ContrastPair[] = [
  // Body / primary text
  { name: 'text on bg', fg: colors.text, bg: colors.bg, level: 'normal' },
  { name: 'text on surface', fg: colors.text, bg: colors.surface, level: 'normal' },
  { name: 'text on surface-raised', fg: colors.text, bg: colors.surfaceRaised, level: 'normal' },
  // Muted
  { name: 'text-muted on bg', fg: colors.textMuted, bg: colors.bg, level: 'normal' },
  { name: 'text-muted on surface', fg: colors.textMuted, bg: colors.surface, level: 'normal' },
  { name: 'text-muted on surface-raised', fg: colors.textMuted, bg: colors.surfaceRaised, level: 'normal' },
  // Status text (core product signal — small colored labels)
  { name: 'fresh on bg', fg: colors.fresh, bg: colors.bg, level: 'normal' },
  { name: 'fresh on surface', fg: colors.fresh, bg: colors.surface, level: 'normal' },
  { name: 'low on bg', fg: colors.low, bg: colors.bg, level: 'normal' },
  { name: 'low on surface', fg: colors.low, bg: colors.surface, level: 'normal' },
  { name: 'critical on bg', fg: colors.critical, bg: colors.bg, level: 'normal' },
  { name: 'critical on surface', fg: colors.critical, bg: colors.surface, level: 'normal' },
  // Inverse on primary (CTA, FAB label if any, selected pill)
  { name: 'white on primary', fg: colors.white, bg: colors.primary, level: 'normal' },
  { name: 'white on primary-soft', fg: colors.white, bg: colors.primarySoft, level: 'normal' },
  // Primary as text (wordmark leaf accents, links)
  { name: 'primary on bg', fg: colors.primary, bg: colors.bg, level: 'normal' },
  { name: 'primary on surface', fg: colors.primary, bg: colors.surface, level: 'normal' },
  // Text on location tints (stat cards, placeholder washes)
  { name: 'text on sage', fg: colors.text, bg: colors.sage, level: 'normal' },
  { name: 'text on tan', fg: colors.text, bg: colors.tan, level: 'normal' },
  { name: 'text on sky', fg: colors.text, bg: colors.sky, level: 'normal' },
  { name: 'text on cream', fg: colors.text, bg: colors.cream, level: 'normal' },
  // Primary on tints (icons / initials)
  { name: 'primary on sage', fg: colors.primary, bg: colors.sage, level: 'large' },
  { name: 'primary on tan', fg: colors.primary, bg: colors.tan, level: 'large' },
  { name: 'primary on sky', fg: colors.primary, bg: colors.sky, level: 'large' },
  { name: 'primary on cream', fg: colors.primary, bg: colors.cream, level: 'large' },
  // UI chrome (icons, bars — 3:1)
  { name: 'fresh fill on bar-track', fg: colors.fresh, bg: colors.barTrack, level: 'ui' },
  { name: 'low-fill on bar-track', fg: colors.lowFill, bg: colors.barTrack, level: 'ui' },
  { name: 'critical fill on bar-track', fg: colors.critical, bg: colors.barTrack, level: 'ui' },
  { name: 'primary on surface (FAB edge)', fg: colors.primary, bg: colors.surface, level: 'ui' },
] as const;

/** Colors forbidden as text (deliberate anti-pattern gate). */
export const forbiddenTextColors = [colors.lowFill] as const;
