/**
 * Microdata fallback for schema.org Recipe (itemtype Recipe).
 * Lightweight attribute walk — not a full HTML parser.
 */

import type { ExtractedRecipe } from './types';
import { parseDurationToMinutes, parseServings } from './jsonld';

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

/**
 * Find the first itemtype="…Recipe" block and pull itemprop values.
 * Heuristic: works on common WP/Allrecipes-style microdata.
 */
export function extractRecipeFromMicrodata(
  html: string,
  sourceUrl: string | null = null,
): ExtractedRecipe | null {
  // Locate a Recipe item scope (schema.org/Recipe or http://schema.org/Recipe)
  const startRe =
    /itemtype\s*=\s*["'][^"']*schema\.org\/Recipe["']/i;
  const startMatch = startRe.exec(html);
  if (!startMatch || startMatch.index == null) return null;

  // Take a generous window after the match (microdata is usually local)
  const windowStart = Math.max(0, startMatch.index - 200);
  const windowHtml = html.slice(windowStart, windowStart + 80_000);

  const name =
    propContent(windowHtml, 'name') ??
    propContent(windowHtml, 'headline');
  const ingredients = propContents(windowHtml, 'recipeIngredient');
  // Some sites use itemprop="ingredients"
  if (ingredients.length === 0) {
    ingredients.push(...propContents(windowHtml, 'ingredients'));
  }
  const steps = [
    ...propContents(windowHtml, 'recipeInstructions'),
    ...propContents(windowHtml, 'instructions'),
  ];

  if (!name && ingredients.length === 0 && steps.length === 0) {
    return null;
  }

  const prepMin = parseDurationToMinutes(
    propContent(windowHtml, 'prepTime') ?? propAttr(windowHtml, 'prepTime', 'datetime') ?? propAttr(windowHtml, 'prepTime', 'content'),
  );
  const cookMin = parseDurationToMinutes(
    propContent(windowHtml, 'cookTime') ??
      propAttr(windowHtml, 'cookTime', 'datetime') ??
      propAttr(windowHtml, 'cookTime', 'content'),
  );
  const totalMin = parseDurationToMinutes(
    propContent(windowHtml, 'totalTime') ??
      propAttr(windowHtml, 'totalTime', 'datetime') ??
      propAttr(windowHtml, 'totalTime', 'content'),
  );
  const servings = parseServings(
    propContent(windowHtml, 'recipeYield') ??
      propAttr(windowHtml, 'recipeYield', 'content'),
  );

  return {
    name: name ?? 'Imported recipe',
    description: propContent(windowHtml, 'description'),
    servings,
    prepMin,
    cookMin,
    totalMin:
      totalMin ??
      (prepMin != null || cookMin != null
        ? (prepMin ?? 0) + (cookMin ?? 0) || null
        : null),
    ingredients,
    steps: uniquePreserve(steps),
    imageUrl:
      propAttr(windowHtml, 'image', 'src') ??
      propAttr(windowHtml, 'image', 'content') ??
      propContent(windowHtml, 'image'),
    keywords: [],
    sourceUrl,
    recipeCuisine: propContent(windowHtml, 'recipeCuisine'),
    recipeCategory: propContent(windowHtml, 'recipeCategory'),
    inLanguage: null,
  };
}

function uniquePreserve(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of items) {
    const k = i.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(i);
  }
  return out;
}

/** itemprop="x" … >text</ or content="…" */
function propContent(html: string, prop: string): string | null {
  const attr = propAttr(html, prop, 'content');
  if (attr) return attr;

  // <span itemprop="name">Title</span>
  const re = new RegExp(
    `itemprop\\s*=\\s*["']${escapeRe(prop)}["'][^>]*>([\\s\\S]*?)<\\/`,
    'i',
  );
  const m = re.exec(html);
  if (m?.[1]) {
    const text = stripTags(m[1]);
    return text || null;
  }
  return null;
}

function propContents(html: string, prop: string): string[] {
  const out: string[] = [];
  const re = new RegExp(
    `itemprop\\s*=\\s*["']${escapeRe(prop)}["'][^>]*(?:content\\s*=\\s*["']([^"']+)["'][^>]*)?>([\\s\\S]*?)(?:<\\/|$)`,
    'gi',
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1]?.trim()) {
      out.push(decodeEntities(m[1].trim()));
      continue;
    }
    if (m[2]) {
      const text = stripTags(m[2]);
      // Avoid grabbing huge nested blocks
      if (text && text.length < 500) out.push(text);
    }
  }
  // Also content-only self-closing style
  const re2 = new RegExp(
    `itemprop\\s*=\\s*["']${escapeRe(prop)}["'][^>]*content\\s*=\\s*["']([^"']+)["']`,
    'gi',
  );
  while ((m = re2.exec(html)) !== null) {
    if (m[1]?.trim()) out.push(decodeEntities(m[1].trim()));
  }
  return uniquePreserve(out);
}

function propAttr(
  html: string,
  prop: string,
  attr: string,
): string | null {
  const re = new RegExp(
    `itemprop\\s*=\\s*["']${escapeRe(prop)}["'][^>]*\\b${escapeRe(attr)}\\s*=\\s*["']([^"']+)["']`,
    'i',
  );
  const m = re.exec(html);
  if (m?.[1]) return decodeEntities(m[1].trim());

  // attr before itemprop
  const re2 = new RegExp(
    `\\b${escapeRe(attr)}\\s*=\\s*["']([^"']+)["'][^>]*itemprop\\s*=\\s*["']${escapeRe(prop)}["']`,
    'i',
  );
  const m2 = re2.exec(html);
  return m2?.[1] ? decodeEntities(m2[1].trim()) : null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
