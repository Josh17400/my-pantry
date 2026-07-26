/**
 * @larder/core/grocery — list generation, aggregation, trip id carriage.
 *
 * Pure TypeScript. Zero React, zero platform APIs, zero I/O.
 * Does not implement receipt reconciliation (track D) — only carries shoppingTripId.
 *
 * Root barrel (`src/index.ts`) is owned by the architect — do not edit it.
 */

export type { AggregateContext } from './aggregate';
export {
  aggregateSources,
  groupByAisle,
  purchaseQtyFromSource,
} from './aggregate';
export { buildList } from './build';
export {
  manualSource,
  sourcesFromPlans,
  sourcesFromPlanShortfalls,
  sourcesFromReorder,
  sourcesFromStock,
} from './sources';
export type {
  BuildListOptions,
  GroceryAisleGroup,
  GroceryList,
  GroceryListLine,
  GrocerySource,
  GrocerySourceKind,
  RecipeShortfallInput,
  ReorderSuggestion,
  StockGroceryInput,
} from './types';
