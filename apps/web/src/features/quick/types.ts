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

export type QuickPrefs = {
  pins: Array<{
    ingredientId: string;
    formId: string;
    name: string;
    defaultQtyBase: number;
    dim: Dimension;
  }>;
  /** ingredientId → consume count */
  frequency: Record<string, number>;
  /** Last N consume events for undo stack (client ids). */
  recentClientTxnIds: string[];
};
