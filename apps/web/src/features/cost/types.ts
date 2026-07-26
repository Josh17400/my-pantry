/**
 * Cost-per-meal types — honest arithmetic over ledger prices.
 */

export type PricedTxn = {
  readonly id: string;
  readonly ingredientId: string;
  readonly formId: string;
  readonly reason: string;
  readonly kind: 'relative' | 'absolute';
  /** For relative: signed delta in base units. */
  readonly deltaBase?: number;
  readonly unitPrice?: number;
  readonly refId?: string;
  readonly occurredAt: string;
};

export type IngredientPricePoint = {
  readonly ingredientId: string;
  readonly formId: string;
  /** Price per base unit (g/ml/each), derived from purchase unitPrice/deltaBase. */
  readonly pricePerBase: number;
  readonly asOf: string;
  readonly purchaseTxnId: string;
};

export type LineCost = {
  readonly ingredientId: string;
  readonly formId: string;
  readonly qtyBase: number;
  readonly pricePerBase: number | null;
  readonly lineCost: number | null;
  readonly priced: boolean;
};

export type MealCostResult = {
  readonly cookEventId: string;
  readonly lines: readonly LineCost[];
  /** Sum of priced lines only. */
  readonly totalCost: number | null;
  readonly pricedLineCount: number;
  readonly totalLineCount: number;
  readonly servings: number;
  readonly perServing: number | null;
  /**
   * Honest incompleteness label, e.g. "estimated from 6 of 9 ingredients".
   * null when fully priced or no cook lines.
   */
  readonly completenessLabel: string | null;
  readonly complete: boolean;
};

export type MealCostTrendPoint = {
  readonly cookEventId: string;
  readonly occurredAt: string;
  readonly totalCost: number | null;
  readonly perServing: number | null;
  readonly complete: boolean;
  readonly completenessLabel: string | null;
};

export type ExpensiveIngredient = {
  readonly ingredientId: string;
  readonly formId: string;
  readonly totalSpend: number;
  readonly cookCount: number;
  readonly avgCostPerCook: number;
};
