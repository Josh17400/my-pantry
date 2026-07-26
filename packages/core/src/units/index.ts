/**
 * @larder/core units — dimensions, forms, conversion graph, parse/format.
 * Pure TypeScript. Zero React / React Native / platform APIs.
 *
 * Domain shapes (IngredientForm, ConversionEdge, PackageSpec, Dimension)
 * are defined in `src/domain/` and re-exported here for convenience.
 */

export type { ConvertInput } from './convert';
export {
  convert,
  convertBaseToUnit,
  convertToBase,
  edgeKey,
  uniqueEdgeKeys,
} from './convert';
export { inverseEdgeKey } from './edge-key';
export {
  dimensionOf,
  EXACT,
  isKnownUnit,
  resolveUnitId,
  toBaseFactor,
  UNIT_BY_ALIAS,
  UNIT_BY_ID,
  UNIT_DEFS,
} from './factors';
export type { FormatOpts } from './format';
export { decimalsForUncertainty,formatQuantity } from './format';
export type {
  ParsedNonQuantified,
  ParsedQuantity,
  ParsedUnparsed,
  ParseQuantityResult,
} from './parse';
export { parseQuantity } from './parse';
export type {
  BaseUnit,
  ConversionEdge,
  ConversionErr,
  ConversionFailReason,
  ConversionOk,
  ConversionResult,
  Dimension,
  IngredientForm,
  PackageSpec,
  UnitDef,
  UnitId,
} from './types';
export { BASE_UNIT, DIMENSION_OF_BASE } from './types';
