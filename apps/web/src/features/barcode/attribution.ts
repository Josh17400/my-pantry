/**
 * Open Food Facts licensing attribution.
 *
 * OFF data is ODbL share-alike. Product data fetched from OFF must remain
 * tagged and segregated from our canonical seed catalog (see segregation.ts).
 */

/** Required credit line — ship in-app (barcode screen + settings/about). */
export const OFF_ATTRIBUTION_LINE =
  'Product data © Open Food Facts contributors, ODbL. https://openfoodfacts.org' as const;

/** Short credit for compact UI. */
export const OFF_ATTRIBUTION_SHORT =
  'Data from Open Food Facts (ODbL)' as const;

/** Descriptive User-Agent — OFF requires a custom UA identifying the app. */
export const OFF_USER_AGENT =
  'TheGoodPantry/1.0 (https://github.com/thegoodpantry; pantry-app; barcode-lookup)' as const;

/** Product page URL for a barcode (attribution / source link). */
export function offProductUrl(barcode: string): string {
  return `https://world.openfoodfacts.org/product/${encodeURIComponent(barcode)}`;
}

/** API base for single-product reads (not bulk scraping). */
export const OFF_API_PRODUCT_BASE =
  'https://world.openfoodfacts.org/api/v2/product' as const;

/** OFF rate limit: 15 product reads per minute per IP. */
export const OFF_RATE_LIMIT_PER_MINUTE = 15 as const;
