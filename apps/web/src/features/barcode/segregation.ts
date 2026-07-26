/**
 * OFF data segregation — licensing boundary.
 *
 * ODbL share-alike can attach to a *derived database*. Mixing OFF fields into
 * our canonical seed ingredients would make that obligation impossible to
 * unwind. Rules enforced here:
 *
 * 1. Every OFF row is tagged `source: 'open-food-facts'`.
 * 2. OFF rows live only in OffDerivedProduct / cache — never Ingredient seed.
 * 3. User mappings store *our* ingredientId + formId only.
 * 4. Purchase txns reference canonical ids only.
 */

import type { Ingredient } from '@larder/core';

import {
  OFF_ATTRIBUTION_LINE,
  OFF_ATTRIBUTION_SHORT,
  offProductUrl,
} from './attribution';
import type {
  BarcodeCanonicalMapping,
  OffApiProductJson,
  OffDerivedProduct,
  OffSourceTag,
} from './types';

export const OFF_SOURCE: OffSourceTag = 'open-food-facts';

/** Type guard: row is OFF-sourced (segregated). */
export function isOffSourced(
  row: { readonly source?: string } | null | undefined,
): row is { readonly source: OffSourceTag } {
  return row?.source === OFF_SOURCE;
}

/**
 * Map OFF API product JSON → segregated OffDerivedProduct.
 * Does not touch the canonical catalog.
 */
export function mapOffApiToDerived(
  barcode: string,
  product: OffApiProductJson,
  fetchedAt: string = new Date().toISOString(),
): OffDerivedProduct {
  const name =
    (product.product_name?.trim()) ||
    (product.product_name_en?.trim()) ||
    'Unknown product';
  const brand =
    product.brands?.trim() ? product.brands.trim() : null;
  const quantityLabel =
    product.quantity?.trim()
      ? product.quantity.trim()
      : null;

  return {
    source: OFF_SOURCE,
    barcode,
    productName: name,
    brand,
    quantityLabel,
    code: product.code?.trim() || barcode,
    fetchedAt,
    offUrl: offProductUrl(barcode),
    attribution: OFF_ATTRIBUTION_LINE,
    attributionShort: OFF_ATTRIBUTION_SHORT,
  };
}

/**
 * Build a query string for matchIngredient from an OFF product.
 * Brand is included when present to improve matching; result is still only a
 * suggestion against *our* catalog.
 */
export function offProductMatchQuery(product: OffDerivedProduct): string {
  if (product.brand) {
    return `${product.brand} ${product.productName}`.trim();
  }
  return product.productName;
}

/**
 * Assert we never treat an OFF product as a canonical Ingredient.
 * Used by tests and put-away confirmation.
 */
export function assertNotCanonicalIngredient(
  product: OffDerivedProduct,
): void {
  if (product.source !== OFF_SOURCE) {
    throw new Error('Expected OFF-sourced product');
  }
  // Structural: OffDerivedProduct has no `id` / `defaultFormId` of Ingredient.
  const asUnknown = product as unknown as Partial<Ingredient>;
  if (
    'defaultFormId' in asUnknown &&
    asUnknown.defaultFormId !== undefined &&
    !('barcode' in product)
  ) {
    throw new Error('OFF product must not look like a seed Ingredient');
  }
}

/**
 * Create a user mapping (ours) from a confirmed put-away.
 * OFF fields are not copied onto the mapping beyond an optional ref.
 */
export function buildCanonicalMapping(input: {
  barcode: string;
  ingredientId: string;
  formId: string;
  displayName: string;
  offProduct: OffDerivedProduct | null;
  confirmedAt?: string;
}): BarcodeCanonicalMapping {
  const mapping: BarcodeCanonicalMapping = {
    barcode: input.barcode,
    ingredientId: input.ingredientId,
    formId: input.formId,
    displayName: input.displayName,
    confirmedAt: input.confirmedAt ?? new Date().toISOString(),
  };
  if (input.offProduct) {
    return {
      ...mapping,
      offRef: {
        barcode: input.offProduct.barcode,
        productName: input.offProduct.productName,
      },
    };
  }
  return mapping;
}

/**
 * True when a value is safe to treat as our catalog id path (not OFF).
 * Mappings must only store these.
 */
export function isCanonicalIngredientId(
  id: string,
  catalogIds: ReadonlySet<string>,
): boolean {
  return catalogIds.has(id);
}
