/**
 * Barcode / Open Food Facts types.
 *
 * Licensing boundary: OffDerivedProduct rows are OFF-sourced and must never be
 * merged into canonical seed ingredients. User mappings point at OUR ingredient
 * ids only.
 */

import type { MatchResult } from '../../../../../packages/core/src/matching/types.ts';

import {
  OFF_ATTRIBUTION_LINE,
  OFF_ATTRIBUTION_SHORT,
} from './attribution';

/** Provenance tag — every OFF-derived row carries this literally. */
export type OffSourceTag = 'open-food-facts';

/**
 * OFF product snapshot kept in a segregated store (cache / session).
 * Fields are OFF-origin only. Do not copy these into Ingredient seed rows.
 */
export type OffDerivedProduct = {
  readonly source: OffSourceTag;
  readonly barcode: string;
  readonly productName: string;
  readonly brand: string | null;
  readonly quantityLabel: string | null;
  /** Raw OFF product code (same as barcode when status=1). */
  readonly code: string;
  readonly fetchedAt: string;
  readonly offUrl: string;
  readonly attribution: typeof OFF_ATTRIBUTION_LINE;
  readonly attributionShort: typeof OFF_ATTRIBUTION_SHORT;
};

/**
 * User-confirmed barcode → canonical ingredient mapping.
 * Points only at our catalog ids — not an OFF product row.
 */
export type BarcodeCanonicalMapping = {
  readonly barcode: string;
  readonly ingredientId: string;
  readonly formId: string;
  readonly displayName: string;
  readonly confirmedAt: string;
  /**
   * Optional pointer to the OFF product that suggested the match.
   * Stored as a reference only — not merged into the ingredient.
   */
  readonly offRef?: {
    readonly barcode: string;
    readonly productName: string;
  };
};

/** Raw JSON shape we care about from OFF product API (subset). */
export type OffApiProductJson = {
  readonly code?: string;
  readonly product_name?: string;
  readonly product_name_en?: string;
  readonly brands?: string;
  readonly quantity?: string;
  readonly product_quantity?: number | string;
  readonly product_quantity_unit?: string;
};

export type OffApiResponseJson = {
  readonly status: number;
  readonly status_verbose?: string;
  readonly code?: string;
  readonly product?: OffApiProductJson;
};

export type OffLookupOk = {
  readonly ok: true;
  readonly product: OffDerivedProduct;
  readonly fromCache: boolean;
};

export type OffLookupErr = {
  readonly ok: false;
  readonly reason:
    | 'not-found'
    | 'rate-limited'
    | 'network'
    | 'invalid-barcode'
    | 'parse';
  readonly message: string;
  readonly retryAfterMs?: number;
};

export type OffLookupResult = OffLookupOk | OffLookupErr;

/** Result of matching an OFF (or manual) product name to our catalog. */
export type IngredientMatchSuggestion = {
  readonly match: MatchResult;
  readonly queryText: string;
  readonly offProduct: OffDerivedProduct | null;
};

export type ConfirmPutAwayInput = {
  readonly barcode: string;
  readonly ingredientId: string;
  readonly formId: string;
  readonly displayName: string;
  readonly qtyBase: number;
  readonly offProduct: OffDerivedProduct | null;
};
