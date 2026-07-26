/**
 * schema.org Recipe JSON-LD extraction — pure JSON walk, no heavy deps.
 *
 * Handles:
 * - Single Recipe object
 * - @graph arrays
 * - Top-level JSON arrays
 * - @type as string or string[]
 * - Nested recipeIngredient / recipeInstructions shapes
 */

import type { ExtractedRecipe } from './types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | null {
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

function asStringArray(v: unknown): string[] {
  if (v == null) return [];
  if (typeof v === 'string') {
    const t = v.trim();
    return t ? [t] : [];
  }
  if (Array.isArray(v)) {
    const out: string[] = [];
    for (const item of v) {
      if (typeof item === 'string' && item.trim()) out.push(item.trim());
      else if (isRecord(item)) {
        // HowToStep / HowToSection / QuantitativeValue-ish
        const text =
          asString(item.text) ??
          asString(item.name) ??
          asString(item['@value']);
        if (text) out.push(text);
        // HowToSection has itemListElement
        if (Array.isArray(item.itemListElement)) {
          out.push(...asStringArray(item.itemListElement));
        }
      }
    }
    return out;
  }
  if (isRecord(v)) {
    // Single HowToStep object
    const text = asString(v.text) ?? asString(v.name);
    if (text) return [text];
    if (Array.isArray(v.itemListElement)) {
      return asStringArray(v.itemListElement);
    }
  }
  return [];
}

function typeTokens(node: Record<string, unknown>): string[] {
  const t = node['@type'];
  if (typeof t === 'string') return [t.toLowerCase()];
  if (Array.isArray(t)) {
    return t
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.toLowerCase());
  }
  return [];
}

function isRecipeNode(node: Record<string, unknown>): boolean {
  return typeTokens(node).some(
    (t) => t === 'recipe' || t.endsWith('/recipe') || t === 'schemarecipe',
  );
}

/** ISO-8601 duration (PT1H30M) or plain minutes number/string → minutes. */
export function parseDurationToMinutes(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
    return Math.round(v);
  }
  const s = asString(v);
  if (!s) return null;

  // Plain number string
  if (/^\d+(\.\d+)?$/.test(s)) {
    return Math.round(Number(s));
  }

  // ISO-8601 duration
  const iso = s.match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i,
  );
  if (iso) {
    const days = Number(iso[1] ?? 0);
    const hours = Number(iso[2] ?? 0);
    const mins = Number(iso[3] ?? 0);
    const secs = Number(iso[4] ?? 0);
    const total = days * 24 * 60 + hours * 60 + mins + secs / 60;
    return total > 0 ? Math.round(total) : null;
  }

  // "1 hour 30 minutes", "90 min"
  let total = 0;
  const hourMatch = s.match(/(\d+(?:\.\d+)?)\s*h(?:ou)?rs?/i);
  const minMatch = s.match(/(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?/i);
  if (hourMatch) total += Number(hourMatch[1]) * 60;
  if (minMatch) total += Number(minMatch[1]);
  if (total > 0) return Math.round(total);

  return null;
}

/**
 * schema.org recipeYield can be "4", "4 servings", "Yield: 6", or
 * a QuantitativeValue object.
 */
export function parseServings(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
    return v;
  }
  if (Array.isArray(v)) {
    for (const item of v) {
      const n = parseServings(item);
      if (n != null) return n;
    }
    return null;
  }
  if (isRecord(v)) {
    const val = v.value ?? v['@value'];
    return parseServings(val);
  }
  const s = asString(v);
  if (!s) return null;
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
}

function parseImage(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (Array.isArray(v)) {
    for (const item of v) {
      const u = parseImage(item);
      if (u) return u;
    }
    return null;
  }
  if (isRecord(v)) {
    return asString(v.url) ?? asString(v.contentUrl) ?? asString(v['@id']);
  }
  return null;
}

function parseKeywords(v: unknown): string[] {
  if (typeof v === 'string') {
    return v
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return asStringArray(v);
}

export function mapRecipeNode(
  node: Record<string, unknown>,
  sourceUrl: string | null = null,
): ExtractedRecipe {
  const ingredients = asStringArray(
    node.recipeIngredient ?? node.ingredients ?? node.recipeIngredients,
  );
  const steps = asStringArray(
    node.recipeInstructions ?? node.instructions ?? node.steps,
  );

  const name =
    asString(node.name) ?? asString(node.headline) ?? 'Imported recipe';

  const prepMin = parseDurationToMinutes(node.prepTime ?? node.prep_time);
  const cookMin = parseDurationToMinutes(
    node.cookTime ?? node.cook_time ?? node.totalTime,
  );
  // If we used totalTime as cook fallback only when cookTime missing:
  const cookOnly = parseDurationToMinutes(node.cookTime ?? node.cook_time);
  const totalMin =
    parseDurationToMinutes(node.totalTime ?? node.total_time) ??
    (prepMin != null || cookOnly != null
      ? (prepMin ?? 0) + (cookOnly ?? 0) || null
      : null);

  return {
    name,
    description: asString(node.description),
    servings: parseServings(node.recipeYield ?? node.yield ?? node.servings),
    prepMin,
    cookMin: cookOnly ?? (node.cookTime == null && node.cook_time == null ? null : cookMin),
    totalMin: totalMin === 0 ? null : totalMin,
    ingredients,
    steps,
    imageUrl: parseImage(node.image ?? node.photo),
    keywords: parseKeywords(node.keywords ?? node.recipeCategory),
    sourceUrl:
      sourceUrl ??
      asString(node.url) ??
      asString(node.mainEntityOfPage) ??
      null,
    recipeCuisine: asString(node.recipeCuisine),
    recipeCategory: asString(node.recipeCategory),
    inLanguage: asString(node.inLanguage ?? node.language),
  };
}

/** Walk any JSON value collecting Recipe nodes (depth-limited). */
export function findRecipeNodes(
  root: unknown,
  maxDepth = 12,
): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();

  function walk(node: unknown, depth: number): void {
    if (depth > maxDepth || node == null) return;
    if (typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }

    if (!isRecord(node)) return;

    if (isRecipeNode(node)) {
      found.push(node);
    }

    // Prefer @graph expansion
    if (Array.isArray(node['@graph'])) {
      walk(node['@graph'], depth + 1);
    }

    for (const [key, val] of Object.entries(node)) {
      if (key === '@graph') continue;
      if (key.startsWith('@') && key !== '@type') continue;
      walk(val, depth + 1);
    }
  }

  walk(root, 0);
  return found;
}

/**
 * Parse a JSON-LD script body (may be object or array).
 * Returns the first viable Recipe with ingredients or steps.
 */
export function extractRecipeFromJsonLd(
  jsonText: string,
  sourceUrl: string | null = null,
): ExtractedRecipe | null {
  const trimmed = jsonText.trim();
  if (!trimmed) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }

  const nodes = findRecipeNodes(parsed);
  for (const node of nodes) {
    const recipe = mapRecipeNode(node, sourceUrl);
    if (recipe.ingredients.length > 0 || recipe.steps.length > 0) {
      return recipe;
    }
  }
  return null;
}

/**
 * Extract from full HTML: all application/ld+json scripts.
 */
export function extractRecipeFromHtmlJsonLd(
  html: string,
  sourceUrl: string | null = null,
): ExtractedRecipe | null {
  const scripts = collectJsonLdScripts(html);
  for (const body of scripts) {
    const recipe = extractRecipeFromJsonLd(body, sourceUrl);
    if (recipe) return recipe;
  }
  return null;
}

/** Collect text content of application/ld+json script tags. */
export function collectJsonLdScripts(html: string): string[] {
  const out: string[] = [];
  // Tolerant of attribute order / type quotes
  const re =
    /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const body = m[1]?.trim();
    if (body) out.push(body);
  }
  // Also try type without escaping +
  const re2 =
    /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  // re already covers; keep single pass
  void re2;
  return out;
}
