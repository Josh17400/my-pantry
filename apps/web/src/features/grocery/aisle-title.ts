/** Known seed category slugs → store-friendly aisle titles. */
const KNOWN: Record<string, string> = {
  produce: 'Produce',
  dairy: 'Dairy',
  'meat-seafood': 'Meat & Seafood',
  'grains-pasta': 'Grains & Pasta',
  'pantry-staples': 'Pantry staples',
  canned: 'Canned',
  baking: 'Baking',
  'spices-herbs': 'Spices & Herbs',
  condiments: 'Condiments',
  'oils-vinegars': 'Oils & Vinegars',
  frozen: 'Frozen',
  beverages: 'Beverages',
  'baby-household': 'Baby & Household',
  other: 'Other',
  Other: 'Other',
};

/** Pretty aisle headers from seed category slugs. */
export function aisleTitle(category: string): string {
  if (!category) return 'Other';
  const known = KNOWN[category] ?? KNOWN[category.toLowerCase()];
  if (known) return known;
  return category
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
