/**
 * Prompt construction for the AI chef.
 * Safety instructions here are NOT the safety control — see safety_gate.ts.
 */

import type {
  CatalogIngredientRef,
  ChefIntent,
  ChefMessage,
  DietaryProfile,
  PantrySnapshotItem,
  RecipeContext,
} from './types.ts';
import { CHEF_RESPONSE_SCHEMA_HINT } from './schema.ts';

export function systemPrompt(intent: ChefIntent): string {
  return [
    'You are the AI chef for The Good Pantry — a pantry-aware cooking assistant.',
    'Respond with a single JSON object only (no markdown fences) matching this schema:',
    CHEF_RESPONSE_SCHEMA_HINT,
    '',
    'Rules:',
    '1. Ground "what can I make" answers in the provided pantry snapshot. Never invent pantry stock.',
    '2. List groundedPantryIds for every pantry ingredient you relied on.',
    '3. Respect the user dietary profile: do not recommend avoided allergens or dietary flags.',
    '4. If an ingredient is unresolved free text, set unknownAllergens: true.',
    '5. Prefer ingredientId values from the catalog when known.',
    '6. Substitutions must include a practical ratio when possible (e.g. "1:1", "¾ cup for 1 cup").',
    '7. For generate_recipe, return a complete recipe with mapped ingredients and steps.',
    `8. Current intent hint: ${intent}.`,
    '',
    'Note: a server-side safety filter will block unsafe recommendations. Still obey the dietary profile.',
  ].join('\n');
}

function formatPantry(pantry: readonly PantrySnapshotItem[]): string {
  if (pantry.length === 0) return '(empty pantry)';
  return pantry
    .map((p) => {
      const qty =
        p.qtyBase !== undefined && p.dim
          ? ` qty=${p.qtyBase}${p.dim === 'mass' ? 'g' : p.dim === 'volume' ? 'ml' : 'ea'}`
          : '';
      const a =
        p.allergens && p.allergens.length
          ? ` allergens=[${p.allergens.join(',')}]`
          : '';
      const d =
        p.dietaryFlags && p.dietaryFlags.length
          ? ` dietary=[${p.dietaryFlags.join(',')}]`
          : '';
      const u = p.unknownAllergens ? ' unknownAllergens=true' : '';
      return `- ${p.ingredientId}: ${p.name}${qty}${a}${d}${u}`;
    })
    .join('\n');
}

function formatDietary(d: DietaryProfile): string {
  const a = d.avoidAllergens.length
    ? d.avoidAllergens.join(', ')
    : '(none)';
  const f = d.avoidDietaryFlags.length
    ? d.avoidDietaryFlags.join(', ')
    : '(none)';
  const notes = d.notes ? `\nNotes: ${d.notes}` : '';
  return `Avoid allergens: ${a}\nAvoid dietary flags: ${f}${notes}`;
}

function formatRecipe(r: RecipeContext | undefined): string {
  if (!r) return '(no current recipe)';
  const lines = (r.ingredients ?? [])
    .map((i) => {
      const u = i.unknownAllergens ? ' [unknown allergens]' : '';
      return `  - ${i.rawText}${i.ingredientId ? ` (${i.ingredientId})` : ''}${u}`;
    })
    .join('\n');
  return [
    `Title: ${r.title ?? '(untitled)'}`,
    r.servings !== undefined ? `Servings: ${r.servings}` : '',
    'Ingredients:',
    lines || '  (none)',
  ]
    .filter(Boolean)
    .join('\n');
}

function formatCatalog(catalog: readonly CatalogIngredientRef[]): string {
  if (catalog.length === 0) return '(no catalog slice)';
  // Cap size so prompts stay cheap.
  const slice = catalog.slice(0, 80);
  return slice
    .map((c) => {
      const a = c.allergens.length ? c.allergens.join('+') : '-';
      const d = c.dietaryFlags.length ? c.dietaryFlags.join('+') : '-';
      return `- ${c.id}: ${c.name} [A:${a}|D:${d}]`;
    })
    .join('\n');
}

export function buildUserContext(args: {
  readonly pantry: readonly PantrySnapshotItem[];
  readonly dietary: DietaryProfile;
  readonly recipe?: RecipeContext;
  readonly catalog: readonly CatalogIngredientRef[];
  readonly intent: ChefIntent;
}): string {
  return [
    `Intent: ${args.intent}`,
    '',
    '## Dietary profile (hard constraints)',
    formatDietary(args.dietary),
    '',
    '## Pantry snapshot (only claim stock from this list)',
    formatPantry(args.pantry),
    '',
    '## Current recipe context',
    formatRecipe(args.recipe),
    '',
    '## Catalog refs (use ingredientIds when recommending)',
    formatCatalog(args.catalog),
  ].join('\n');
}

export function buildChatMessages(args: {
  readonly intent: ChefIntent;
  readonly history: readonly ChefMessage[];
  readonly pantry: readonly PantrySnapshotItem[];
  readonly dietary: DietaryProfile;
  readonly recipe?: RecipeContext;
  readonly catalog: readonly CatalogIngredientRef[];
}): readonly { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const out: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: systemPrompt(args.intent) },
    { role: 'user', content: buildUserContext(args) },
  ];
  for (const m of args.history) {
    if (m.role === 'system') continue;
    out.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    });
  }
  return out;
}
