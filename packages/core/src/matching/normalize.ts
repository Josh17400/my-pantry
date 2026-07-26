/**
 * Receipt / recipe string normalization for cascade steps 3–4.
 *
 * Order: lowercase → strip size/pack → strip grade → strip brand tokens →
 * collapse whitespace → singularize last token.
 */

/** Size / pack tokens (with optional leading number already stripped separately). */
const SIZE_PATTERN =
  /\b\d+(?:[./]\d+)?\s*(?:oz|ounces?|lb|lbs|pounds?|g|kg|ml|l|liters?|litres?|ct|count|pk|pack|packs|pcs?|pieces?|gal|gallon|gallons|qt|quart|quarts|pt|pint|pints|fl\.?\s*oz)\b/gi;

/** Bare size-like tokens after numbers removed. */
const BARE_SIZE_TOKENS = new Set([
  'oz',
  'ounce',
  'ounces',
  'lb',
  'lbs',
  'pound',
  'pounds',
  'g',
  'kg',
  'ml',
  'l',
  'liter',
  'liters',
  'litre',
  'litres',
  'ct',
  'count',
  'pk',
  'pack',
  'packs',
  'pc',
  'pcs',
  'piece',
  'pieces',
  'gal',
  'gallon',
  'gallons',
  'qt',
  'quart',
  'quarts',
  'pt',
  'pint',
  'pints',
]);

/** Grade / quality tokens. */
const GRADE_PATTERN =
  /\b(?:grade\s*[a-d]|grade\s*aa|xl|xxl|large|medium|small|jumbo|extra\s*large|select|choice|prime|fancy)\b/gi;

/**
 * Brand / marketing tokens stripped from free text.
 * Keep conservative — do not strip words that are also ingredient names.
 */
const BRAND_TOKENS = new Set([
  'organic',
  'org',
  'natural',
  'fresh',
  'premium',
  'select',
  'great',
  'value',
  'kirkland',
  'signature',
  'kraft',
  'heinz',
  'hellmanns',
  'hellmann',
  'best',
  'foods',
  'nestle',
  'store',
  'brand',
  'private',
  'label',
  'market',
  'pantry',
  'essential',
  'essentials',
  'everyday',
  'simple',
  'truth',
  'happy',
  'farms',
  'farm',
  'fields',
  'harvest',
  'valley',
  'horizon',
  'daisy',
  'land',
  'lakes',
  'tillamook',
  'cabot',
  'sargento',
  'philadelphia',
  'chobani',
  'dannon',
  'yoplait',
  'silk',
  'breeze',
  'campbells',
  'campbell',
  'swanson',
  'progresso',
  'pacific',
  'college',
  'inn',
  'knorr',
  'maggi',
  'mccormick',
  'tone',
  'tones',
  'badia',
  'goya',
  'barilla',
  'cecco',
  'ronzoni',
  'hunts',
  'hunt',
  'monte',
  'dole',
  'chiquita',
  'driscolls',
  'driscoll',
  'tyson',
  'perdue',
  'foster',
  'applegate',
  'oscar',
  'mayer',
  'hormel',
  'jennie',
  'butterball',
  'pillsbury',
  'medal',
  'king',
  'arthur',
  'bob',
  'mill',
  'quaker',
  'general',
  'mills',
  'kelloggs',
  'kellogg',
  'nabisco',
  'oreo',
  'lays',
  'frito',
  'pepsi',
  'coke',
  'coca',
  'cola',
  'tropicana',
  'minute',
  'maid',
  'simply',
  'naked',
  'bolthouse',
  'pure',
  'leaf',
  'lipton',
  'twinings',
  'celestial',
  'original',
  'classic',
  'traditional',
  'homemade',
  'style',
  'recipe',
  'improved',
  'family',
  'size',
  'twin',
  'multi',
  'club',
  'warehouse',
  'costco',
  'sams',
  'walmart',
  'kroger',
  'safeway',
  'trader',
  'joes',
  'aldi',
  'lidl',
  'target',
  'gather',
  // Common receipt brand names / fluff
  'morton',
  'domino',
  'dominoes',
  'local',
  'yellow', // produce color fluff when not part of catalog name
  'bulb',
  'bunch',
  'bag',
  'thick',
  'cut',
  'long',
  'grain',
  'plain',
  'greek', // often style fluff on yogurt receipts; catalog has plain "yogurt"
]);

/** Words that look like brands but must never strip (ingredient cores). */
const NEVER_STRIP = new Set([
  'cream',
  'cheese',
  'milk',
  'butter',
  'oil',
  'flour',
  'sugar',
  'salt',
  'pepper',
  'chicken',
  'beef',
  'pork',
  'fish',
  'rice',
  'bean',
  'beans',
  'stock',
  'broth',
  'cube',
  'cubes',
  'sour',
  'heavy',
  'whipping',
  'half',
  'tomato',
  'tomatoes',
  'onion',
  'garlic',
  'egg',
  'eggs',
  'yogurt',
  'yoghurt',
  'peanut',
  'almond',
  'soy',
  'wheat',
  'oat',
  'oats',
  'corn',
  'potato',
  'potatoes',
  'lemon',
  'lime',
  'orange',
  'apple',
  'banana',
  'honey',
  'maple',
  'vanilla',
  'cocoa',
  'chocolate',
  'coffee',
  'tea',
  'water',
  'juice',
  'sauce',
  'paste',
  'powder',
  'whole', // "whole milk" — brand strip of "whole foods" handled as multi-token
  'red',
  'white',
  'green',
  'black',
  'brown',
  'sweet',
  'hot',
  'mild',
  'light',
  'dark',
  'plain',
  'italian',
  'french',
  'swiss',
  'cheddar',
  'parmesan',
  'mozzarella',
  'ricotta',
  'cottage',
  'blue',
  'feta',
]);

/**
 * Aggressive OCR / receipt abbreviations expanded before normalization.
 * Applied as whole-token replacements on the lowercased raw string.
 */
const ABBREV: Readonly<Record<string, string>> = {
  hvy: 'heavy',
  hv: 'heavy',
  crm: 'cream',
  cr: 'cream',
  chz: 'cheese',
  chse: 'cheese',
  chkn: 'chicken',
  chk: 'chicken',
  ck: 'chicken',
  brth: 'broth',
  stk: 'stock',
  stck: 'stock',
  btr: 'butter',
  bttr: 'butter',
  mlk: 'milk',
  ygrt: 'yogurt',
  yog: 'yogurt',
  flr: 'flour',
  sgr: 'sugar',
  slt: 'salt',
  ppr: 'pepper',
  tmt: 'tomato',
  tmto: 'tomato',
  onn: 'onion',
  grlc: 'garlic',
  pz: 'pizza',
  prkl: 'pickle',
  may: 'mayo',
  mayo: 'mayonnaise',
  pb: 'peanut butter',
  pnut: 'peanut',
  almd: 'almond',
  parm: 'parmesan',
  mozz: 'mozzarella',
  ric: 'ricotta',
  whp: 'whipping',
  whpng: 'whipping',
  hlv: 'half',
  hlf: 'half',
  smi: 'semi',
  swt: 'sweet',
  unsltd: 'unsalted',
  sltd: 'salted',
  whl: 'whole',
  skm: 'skim',
  ff: 'fat free',
  lf: 'low fat',
  org: 'organic', // stripped later as brand
  bnls: 'boneless',
  sknls: 'skinless',
  grnd: 'ground',
  frzn: 'frozen',
  frsh: 'fresh',
  cn: 'can',
  cnd: 'canned',
};

/**
 * Simple English singularization for the final token.
 * Deterministic; not a full linguistic stemmer.
 */
export function singularize(word: string): string {
  if (word.length <= 2) return word;
  const lower = word.toLowerCase();

  // Irregular / preserve
  const irregular: Record<string, string> = {
    leaves: 'leaf',
    loaves: 'loaf',
    potatoes: 'potato',
    tomatoes: 'tomato',
    heroes: 'hero',
    berries: 'berry',
    cherries: 'cherry',
    strawberries: 'strawberry',
    blueberries: 'blueberry',
    raspberries: 'raspberry',
    blackberries: 'blackberry',
    cranberries: 'cranberry',
    geese: 'goose',
    mice: 'mouse',
    children: 'child',
    people: 'person',
    feet: 'foot',
    teeth: 'tooth',
    knives: 'knife',
    wives: 'wife',
    lives: 'life',
    halves: 'half',
    shelves: 'shelf',
    calves: 'calf',
    wolves: 'wolf',
    pasta: 'pasta',
    spaghetti: 'spaghetti',
    rice: 'rice',
    cheese: 'cheese',
    butter: 'butter',
    flour: 'flour',
    sugar: 'sugar',
    molasses: 'molasses',
    oats: 'oat',
    chives: 'chive',
    cloves: 'clove',
  };
  if (irregular[lower] !== undefined) return irregular[lower]!;

  if (lower.endsWith('ies') && lower.length > 4) {
    return lower.slice(0, -3) + 'y';
  }
  if (
    lower.endsWith('sses') ||
    lower.endsWith('shes') ||
    lower.endsWith('ches') ||
    lower.endsWith('xes') ||
    lower.endsWith('zes')
  ) {
    return lower.slice(0, -2);
  }
  if (lower.endsWith('oes') && lower.length > 4) {
    return lower.slice(0, -2);
  }
  if (
    lower.endsWith('s') &&
    !lower.endsWith('ss') &&
    !lower.endsWith('us') &&
    !lower.endsWith('is') &&
    !lower.endsWith('ous')
  ) {
    return lower.slice(0, -1);
  }
  return lower;
}

/** Expand known receipt abbreviations token-wise. */
export function expandAbbreviations(raw: string): string {
  return raw
    .toLowerCase()
    .split(/[\s/,_-]+/)
    .filter(Boolean)
    .map((tok) => ABBREV[tok] ?? tok)
    .join(' ');
}

/**
 * Full normalization pipeline.
 * Empty / whitespace-only → empty string.
 */
export function normalizeIngredientText(raw: string): string {
  if (raw.trim().length === 0) return '';

  let s = expandAbbreviations(raw);

  // Drop price-like and pure numbers hanging around
  s = s.replace(/\$\s*\d+(?:\.\d{1,2})?/g, ' ');
  s = s.replace(SIZE_PATTERN, ' ');
  s = s.replace(GRADE_PATTERN, ' ');
  // Remaining standalone numbers
  s = s.replace(/\b\d+(?:[./]\d+)?\b/g, ' ');

  // Punctuation → space
  s = s.replace(/[^a-z\s]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  const tokens = s.split(' ').filter(Boolean);
  const kept: string[] = [];
  for (const tok of tokens) {
    if (BARE_SIZE_TOKENS.has(tok)) continue;
    if (NEVER_STRIP.has(tok)) {
      kept.push(tok);
      continue;
    }
    if (BRAND_TOKENS.has(tok)) continue;
    kept.push(tok);
  }

  if (kept.length === 0) {
    // Fall back to non-brand strip only so we never wipe ingredient cores
    const fallback = tokens.filter((t) => !BARE_SIZE_TOKENS.has(t));
    if (fallback.length === 0) return '';
    const last = singularize(fallback[fallback.length - 1]!);
    const head = fallback.slice(0, -1);
    return [...head, last].join(' ').trim();
  }

  // Singularize last token only (multiword: "heavy creams" → "heavy cream")
  const last = singularize(kept[kept.length - 1]!);
  const head = kept.slice(0, -1);
  return [...head, last].join(' ').trim();
}

/**
 * Light key for exact alias lookup: lowercase, collapse whitespace,
 * expand abbrev, no brand stripping (aliases are stored as users typed).
 */
export function aliasKey(raw: string): string {
  return expandAbbreviations(raw)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
