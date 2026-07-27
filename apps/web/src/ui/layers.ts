/**
 * Stacking layers for app chrome vs modal surfaces.
 *
 * History: tab bar and sheets both used freehand `z-40`. Equal z-index means
 * DOM order wins, and the tab bar renders after main content — so it painted
 * over sheet primary actions (Add to pantry, Log waste, Save, etc.).
 *
 * Rule: chrome stays at Z_CHROME; anything that must capture taps above the
 * shell uses Z_SHEET or higher. Never invent a new freehand z-index for overlays.
 *
 * Tailwind mirrors these via theme.extend.zIndex (z-chrome / z-sheet / z-toast).
 */
export const Z_INDEX = {
  /** Fixed tab bar + raised FAB wrapper. */
  chrome: 40,
  /** Modal sheets, full-screen pickers, confirm dialogs. Above chrome. */
  sheet: 50,
  /** Transient toasts (undo) — above an open sheet so they stay reachable. */
  toast: 60,
} as const;

/** Tailwind class names for the same tokens (prefer these over bare z-40). */
export const Z_CLASS = {
  chrome: 'z-chrome',
  sheet: 'z-sheet',
  toast: 'z-toast',
} as const;

export type ZLayer = keyof typeof Z_INDEX;
