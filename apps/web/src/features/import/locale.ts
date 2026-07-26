/**
 * Source locale detection for recipe import.
 *
 * parseQuantity flags pint/quart/gallon/fl oz/cup as ambiguousLocale because
 * US customary ≠ Imperial (e.g. UK pint 568 ml vs US 473 ml). We never guess —
 * detect signals and prompt when any line is ambiguous.
 */

import { parseQuantity } from '@larder/core';

import type {
  ExtractedRecipe,
  LocaleAmbiguity,
  LocaleChoice,
  LocaleDetection,
  RecipeLocale,
} from './types';

const UK_HOST_HINTS = [
  '.co.uk',
  '.uk',
  'bbcgoodfood',
  'bbc.co.uk',
  'deliciousmagazine',
  'jamieoliver',
  'nigella',
  'waitrose',
  'tesco.com',
  'sainsburys',
  'ocado',
  'goodhousekeeping.com/uk',
];

const AU_NZ_HINTS = ['.com.au', '.co.nz', 'taste.com.au', 'foodtolove'];

const US_HOST_HINTS = [
  'allrecipes.com',
  'nytimes.com',
  'bonappetit',
  'seriouseats',
  'foodnetwork.com',
  'simplyrecipes',
  'budgetbytes',
  'cookieandkate',
];

/**
 * Detect likely recipe locale from URL, language, cuisine, and ingredient text.
 * confidence is never high enough to auto-apply Imperial factors — ambiguous
 * units still require an explicit prompt when present.
 */
export function detectSourceLocale(
  recipe: ExtractedRecipe,
  sourceUrl: string | null = null,
): LocaleDetection {
  const signals: string[] = [];
  let scoreUs = 0;
  let scoreImperial = 0;
  let scoreMetric = 0;

  const url = (sourceUrl ?? recipe.sourceUrl ?? '').toLowerCase();
  const lang = (recipe.inLanguage ?? '').toLowerCase();
  const cuisine = (recipe.recipeCuisine ?? '').toLowerCase();
  const blob = [
    recipe.name,
    ...recipe.ingredients,
    ...recipe.steps,
    recipe.description ?? '',
  ]
    .join('\n')
    .toLowerCase();

  if (url) {
    if (UK_HOST_HINTS.some((h) => url.includes(h))) {
      scoreImperial += 3;
      signals.push(`URL suggests UK/Imperial (${url})`);
    }
    if (AU_NZ_HINTS.some((h) => url.includes(h))) {
      scoreImperial += 2;
      scoreMetric += 1;
      signals.push('URL suggests AU/NZ (metric-primary, Imperial heritage)');
    }
    if (US_HOST_HINTS.some((h) => url.includes(h))) {
      scoreUs += 3;
      signals.push('URL suggests US site');
    }
    if (url.includes('.com') && !url.includes('.co.uk') && !url.includes('.com.au')) {
      // weak US prior for bare .com
      scoreUs += 0.5;
    }
  }

  if (lang === 'en-gb' || lang === 'en_gb' || lang.startsWith('en-gb')) {
    scoreImperial += 3;
    signals.push(`inLanguage=${lang}`);
  } else if (lang === 'en-us' || lang === 'en_us') {
    scoreUs += 3;
    signals.push(`inLanguage=${lang}`);
  } else if (lang.startsWith('en')) {
    signals.push(`inLanguage=${lang} (underspecified)`);
  }

  if (
    cuisine.includes('british') ||
    cuisine.includes('uk') ||
    cuisine.includes('irish')
  ) {
    scoreImperial += 2;
    signals.push(`cuisine=${cuisine}`);
  }
  if (cuisine.includes('american') || cuisine.includes('southern')) {
    scoreUs += 2;
    signals.push(`cuisine=${cuisine}`);
  }

  // Text cues
  if (/\b(gas mark|caster sugar|plain flour|self-raising|courgette|aubergine|coriander seeds)\b/i.test(blob)) {
    scoreImperial += 1.5;
    signals.push('UK ingredient vocabulary');
  }
  if (/\b(all-purpose flour|stick of butter|confectioners|zucchini|eggplant|cilantro)\b/i.test(blob)) {
    scoreUs += 1.5;
    signals.push('US ingredient vocabulary');
  }
  if (/\b(\d+\s*g\b|\d+\s*ml\b|\d+\s*kg\b)/i.test(blob) && !/\b(cup|pint|quart)\b/i.test(blob)) {
    scoreMetric += 2;
    signals.push('Metric quantities without cup/pint');
  }

  let locale: RecipeLocale = 'unknown';
  let confidence: LocaleDetection['confidence'] = 'low';

  const max = Math.max(scoreUs, scoreImperial, scoreMetric);
  if (max >= 3) confidence = 'high';
  else if (max >= 1.5) confidence = 'medium';

  if (max === 0) {
    locale = 'unknown';
    confidence = 'low';
  } else if (scoreImperial >= scoreUs && scoreImperial >= scoreMetric) {
    locale = 'imperial';
  } else if (scoreUs >= scoreImperial && scoreUs >= scoreMetric) {
    locale = 'us';
  } else {
    locale = 'metric';
  }

  // Always prompt when ambiguous units exist — detection never silent-applies.
  return {
    locale,
    confidence,
    signals,
    promptOnAmbiguous: true,
  };
}

/**
 * Scan ingredient lines for ambiguousLocale units via parseQuantity.
 */
export function findLocaleAmbiguities(
  ingredientLines: readonly string[],
): LocaleAmbiguity[] {
  const out: LocaleAmbiguity[] = [];
  ingredientLines.forEach((rawLine, lineIndex) => {
    const parsed = parseQuantity(rawLine);
    if (parsed.kind !== 'quantity') return;
    if (!parsed.ambiguousLocale) return;
    out.push({
      unit: String(parsed.unit),
      rawLine,
      lineIndex,
      ambiguousLocale: true,
    });
  });
  return out;
}

/**
 * Whether the user must pick US vs Imperial before save.
 */
export function needsLocalePrompt(
  ambiguities: readonly LocaleAmbiguity[],
  localeChoice: LocaleChoice | null,
): boolean {
  return ambiguities.length > 0 && localeChoice == null;
}

/**
 * Human-readable explanation of the ambiguity (for UI).
 */
export function localeAmbiguityMessage(
  ambiguities: readonly LocaleAmbiguity[],
  detection: LocaleDetection,
): string {
  if (ambiguities.length === 0) return '';
  const units = [...new Set(ambiguities.map((a) => a.unit))].join(', ');
  const hint =
    detection.locale === 'imperial'
      ? ' This page looks UK/Imperial (e.g. 1 pint ≈ 568 ml).'
      : detection.locale === 'us'
        ? ' This page looks US customary (e.g. 1 pint ≈ 473 ml).'
        : ' We could not be sure of the source locale.';
  return (
    `Some units differ between US and Imperial measures (${units}).` +
    hint +
    ' Choose which system this recipe uses — we will not guess.'
  );
}

/**
 * Note attached when user picks Imperial: our unit registry is US-based,
 * so Imperial choice is recorded as a warning for the user to adjust amounts.
 */
export function localeChoiceNote(choice: LocaleChoice): string {
  if (choice === 'us') {
    return 'Interpreted with US customary units (app default).';
  }
  return (
    'Source marked as Imperial (UK). Our conversion table uses US sizes ' +
    '(pint 473 ml vs Imperial 568 ml). Review ambiguous lines and adjust quantities if needed.'
  );
}
