/**
 * Deep-import core grocery (not yet on @larder/core root barrel — see m1-g).
 * Aggregation lives here; UI must not reimplement merge rules.
 */

export type {
  BuildListOptions,
  GroceryAisleGroup,
  GroceryList,
  GroceryListLine,
  GrocerySource,
  GrocerySourceKind,
  ReorderSuggestion,
  StockGroceryInput,
} from '../../../../../packages/core/src/grocery/index.ts';
export {
  buildList,
  groupByAisle,
  manualSource,
  sourcesFromPlans,
  sourcesFromPlanShortfalls,
  sourcesFromReorder,
  sourcesFromStock,
} from '../../../../../packages/core/src/grocery/index.ts';
