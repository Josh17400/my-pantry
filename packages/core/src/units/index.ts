/**
 * @larder/core units — dimensions, forms, conversion graph, parse/format.
 * Pure TypeScript. Zero React / React Native / platform APIs.
 *
 * Domain shapes (IngredientForm, ConversionEdge, PackageSpec, Dimension)
 * are defined in `src/domain/` and re-exported here for convenience.
 */

export type {
  Dimension,
  BaseUnit,
  UnitId,
  UnitDef,
  IngredientForm,
  ConversionEdge,
  PackageSpec,
  ConversionOk,
  ConversionErr,
  ConversionFailReason,
  ConversionResult,
} from './types';

export { BASE_UNIT, DIMENSION_OF_BASE } from './types';

export {
  UNIT_DEFS,
  UNIT_BY_ID,
  UNIT_BY_ALIAS,
  EXACT,
  toBaseFactor,
  dimensionOf,
  resolveUnitId,
  isKnownUnit,
} from './factors';

export {
  convert,
  convertBaseToUnit,
  convertToBase,
  uniqueEdgeKeys,
  edgeKey,
} from './convert';
export type { ConvertInput } from './convert';

export { inverseEdgeKey } from './edge-key';

export { parseQuantity } from './parse';
export type {
  ParseQuantityResult,
  ParsedQuantity,
  ParsedNonQuantified,
  ParsedUnparsed,
} from './parse';

export { formatQuantity, decimalsForUncertainty } from './format';
export type { FormatOpts } from './format';
