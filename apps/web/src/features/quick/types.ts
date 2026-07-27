import type { Dimension } from '@larder/core';

/** One quick-consume tile (pinned or frequency-suggested). */
export type QuickItem = {
  id: string;
  ingredientId: string;
  formId: string;
  name: string;
  /** Default consume amount in base units (1 yogurt cup, 1 apple, 1 egg). */
  defaultQtyBase: number;
  dim: Dimension;
  /** User-pinned vs auto-suggested by frequency. */
  origin: 'pinned' | 'suggested';
  /** How many times consumed via quick (for ranking). */
  frequency: number;
  /** On-hand quantity in base units when derived from pantry. */
  stockQtyBase: number;
  /**
   * False when pinned but currently out of stock — shown non-tappable.
   * Suggested tiles are only built from stock above epsilon, so always true.
   */
  consumable: boolean;
};

export type QuickConsumeEvent = {
  id: string;
  item: QuickItem;
  qtyBase: number;
  clientTxnId: string;
  occurredAt: string;
  /** True after appendTxn succeeded (or demo). */
  committed: boolean;
};

export type QuickPin = {
  ingredientId: string;
  formId: string;
  name: string;
  defaultQtyBase: number;
  dim: Dimension;
};

export type QuickPrefs = {
  pins: QuickPin[];
  /** ingredientId → consume count */
  frequency: Record<string, number>;
  /** Last N consume events for undo stack (client ids). */
  recentClientTxnIds: string[];
};

/** Minimal pantry row needed to derive quick tiles (read-only projection). */
export type QuickPantryLine = {
  ingredientId: string;
  formId: string;
  ingredientName: string;
  formName: string | null;
  qtyBase: number;
  dim: Dimension;
  /** ISO timestamp — used as purchase/recency tie-break when available. */
  updatedAt: string;
};
