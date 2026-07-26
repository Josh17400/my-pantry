/**
 * Core matching + dedupe are not yet on the @larder/core root barrel.
 * Deep-import the same way grocery / recipes do.
 */

export type {
  IngredientAlias,
  MatchCatalog,
  MatchInput,
  MatchPath,
  MatchResult,
  MatchVeto,
  RankedCandidate,
} from '../../../../../packages/core/src/matching/index.ts';

export {
  isAutoAccept,
  matchIngredient,
} from '../../../../../packages/core/src/matching/index.ts';

export type {
  CheckReceiptOptions,
  ReceiptDedupeDecision,
  ReceiptFingerprintInput,
  ReceiptRecord,
} from '../../../../../packages/core/src/dedupe/types.ts';

export {
  checkReceiptDuplicate,
  receiptFingerprint,
  toReceiptRecord,
} from '../../../../../packages/core/src/dedupe/receipt.ts';

export {
  seedForms,
  seedIngredients,
  seedPackages,
  type SeedIngredient,
} from '../../../../../packages/core/src/seed/index.ts';
