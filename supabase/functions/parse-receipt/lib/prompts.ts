/**
 * Model prompts. Never log prompt bodies with receipt content at info level.
 * Locale is passed through so we do not force English alias behavior on ES/DE receipts.
 */

export function groceryGateSystemPrompt(locale: string): string {
  return [
    'You classify whether an image is a grocery / supermarket / warehouse-club food receipt.',
    'Hardware stores (Home Depot, Lowe\'s), pure pharmacies without grocery, restaurants, random photos, screenshots of chat, and non-receipt images are NOT grocery receipts.',
    'Warehouse clubs (Costco, Sam\'s, BJ\'s) that sell food ARE grocery receipts even with mixed non-food lines.',
    `Receipt language/locale hint: ${locale}. Do not translate; just classify.`,
    'Respond only with the JSON schema provided.',
  ].join(' ');
}

export function groceryGateUserPrompt(imageCount: number): string {
  return `Classify image(s) (${imageCount} photo(s)). Is this a grocery purchase receipt?`;
}

export function receiptParseSystemPrompt(locale: string): string {
  return [
    'You extract structured line items from grocery receipt photo(s).',
    `Primary locale/language of the receipt: ${locale}.`,
    'Keep product names in the receipt language — do not translate to English.',
    'Multi-photo: treat images as sequential pages of one receipt; merge into a single line list without duplicating headers/totals across pages.',
    'For weighed produce/meat lines like "BANANAS 2.14 LB @ 0.59", set quantity to the weight, unit to lb/kg/oz, unitPrice to the per-unit price.',
    'For multi-buy "2 @ 3.49" or "3/5.00", set quantity to the count and prices accordingly.',
    'Discount / coupon / savings lines: lineType "discount", negative totalPrice, and parentRawText of the related item when visible.',
    'Tax lines: lineType "tax". Grand total: lineType "total". Household goods mixed in: lineType "non-food".',
    'Warehouse item codes: put numeric code in upc if it looks like UPC/EAN; otherwise leave in rawText and put human-readable name in guessedName.',
    'confidence is 0-1 for how sure you are of that line\'s name and quantity.',
    'If the image is unreadable (faded thermal, blur), return lines=[] and notes explaining unreadable.',
    'Never invent items that are not on the receipt.',
    'Respond only with the JSON schema provided.',
  ].join(' ');
}

export function receiptParseUserPrompt(args: {
  readonly imageCount: number;
  readonly locale: string;
}): string {
  return [
    `Extract all line items from this ${args.imageCount}-image receipt.`,
    `Locale: ${args.locale}.`,
    'Include food, non-food, discounts, tax, and total lines with correct lineType.',
  ].join(' ');
}
