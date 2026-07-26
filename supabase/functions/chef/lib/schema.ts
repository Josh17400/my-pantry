/**
 * Strict schema validation for chef model JSON responses.
 */

import type {
  Allergen,
  ChefGeneratedRecipe,
  ChefIntent,
  ChefRecipeLine,
  ChefSubstitution,
  DietaryFlag,
  ModelChefResponse,
} from './types.ts';
import { isAllergen, isDietaryFlag } from './types.ts';

const INTENTS: readonly ChefIntent[] = [
  'chat',
  'what_can_i_make',
  'substitute',
  'generate_recipe',
  'cooking_qa',
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asBool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

function parseAllergens(v: unknown): Allergen[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Allergen => typeof x === 'string' && isAllergen(x));
}

function parseFlags(v: unknown): DietaryFlag[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (x): x is DietaryFlag => typeof x === 'string' && isDietaryFlag(x),
  );
}

function parseRecipeLine(raw: unknown): ChefRecipeLine | null {
  if (!isRecord(raw)) return null;
  const rawText = asString(raw.rawText) ?? asString(raw.name);
  if (!rawText) return null;
  const qty = raw.qty === null ? null : asNumber(raw.qty);
  const unit = raw.unit === null ? null : asString(raw.unit);
  const line: ChefRecipeLine = {
    rawText,
    qty: qty === undefined ? null : qty,
    unit: unit === undefined ? null : unit,
  };
  const ingredientId = asString(raw.ingredientId);
  const optional = asBool(raw.optional);
  const unknownAllergens = asBool(raw.unknownAllergens);
  const allergens = parseAllergens(raw.allergens);
  const dietaryFlags = parseFlags(raw.dietaryFlags);
  return {
    ...line,
    ...(ingredientId ? { ingredientId } : {}),
    ...(optional !== undefined ? { optional } : {}),
    ...(unknownAllergens !== undefined ? { unknownAllergens } : {}),
    ...(allergens.length ? { allergens } : {}),
    ...(dietaryFlags.length ? { dietaryFlags } : {}),
  };
}

function parseRecipe(raw: unknown): ChefGeneratedRecipe | null {
  if (raw === null || raw === undefined) return null;
  if (!isRecord(raw)) return null;
  const title = asString(raw.title);
  const servings = asNumber(raw.servings);
  if (!title || servings === null || servings <= 0) return null;
  if (!Array.isArray(raw.ingredients) || !Array.isArray(raw.steps)) return null;
  const ingredients: ChefRecipeLine[] = [];
  for (const row of raw.ingredients) {
    const line = parseRecipeLine(row);
    if (line) ingredients.push(line);
  }
  const steps: { text: string; durationSec?: number }[] = [];
  for (const row of raw.steps) {
    if (typeof row === 'string' && row.trim()) {
      steps.push({ text: row });
      continue;
    }
    if (isRecord(row)) {
      const text = asString(row.text);
      if (!text) continue;
      const durationSec = asNumber(row.durationSec);
      steps.push(
        durationSec !== null
          ? { text, durationSec }
          : { text },
      );
    }
  }
  if (ingredients.length === 0 || steps.length === 0) return null;
  const prepMin = asNumber(raw.prepMin);
  const cookMin = asNumber(raw.cookMin);
  const yieldNote = asString(raw.yieldNote);
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is string => typeof t === 'string')
    : undefined;
  return {
    title,
    servings,
    ingredients,
    steps,
    ...(prepMin !== null ? { prepMin } : {}),
    ...(cookMin !== null ? { cookMin } : {}),
    ...(yieldNote ? { yieldNote } : {}),
    ...(tags && tags.length ? { tags } : {}),
  };
}

function parseSubstitution(raw: unknown): ChefSubstitution | null {
  if (!isRecord(raw)) return null;
  const forIngredient = asString(raw.forIngredient) ?? asString(raw.for);
  const suggestion = asString(raw.suggestion) ?? asString(raw.with);
  if (!forIngredient || !suggestion) return null;
  const ratio = asString(raw.ratio);
  const ingredientId = asString(raw.ingredientId);
  const unknownAllergens = asBool(raw.unknownAllergens);
  const allergens = parseAllergens(raw.allergens);
  const dietaryFlags = parseFlags(raw.dietaryFlags);
  return {
    forIngredient,
    suggestion,
    ...(ratio ? { ratio } : {}),
    ...(ingredientId ? { ingredientId } : {}),
    ...(unknownAllergens !== undefined ? { unknownAllergens } : {}),
    ...(allergens.length ? { allergens } : {}),
    ...(dietaryFlags.length ? { dietaryFlags } : {}),
  };
}

export interface ValidateOk {
  readonly ok: true;
  readonly value: ModelChefResponse;
}

export interface ValidateErr {
  readonly ok: false;
  readonly errors: readonly string[];
}

export function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  // Strip optional markdown fences
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  const body = fenced ? fenced[1]!.trim() : trimmed;
  return JSON.parse(body) as unknown;
}

export function validateModelChefResponse(
  raw: unknown,
): ValidateOk | ValidateErr {
  const errors: string[] = [];
  if (!isRecord(raw)) {
    return { ok: false, errors: ['response must be an object'] };
  }
  const message = asString(raw.message);
  if (!message || !message.trim()) {
    errors.push('message is required');
  }
  let intent: ChefIntent = 'chat';
  const intentRaw = asString(raw.intent);
  if (intentRaw && (INTENTS as readonly string[]).includes(intentRaw)) {
    intent = intentRaw as ChefIntent;
  }

  let groundedPantryIds: string[] = [];
  if (Array.isArray(raw.groundedPantryIds)) {
    groundedPantryIds = raw.groundedPantryIds.filter(
      (x): x is string => typeof x === 'string' && x.length > 0,
    );
  } else if (Array.isArray(raw.groundedPantry)) {
    groundedPantryIds = raw.groundedPantry
      .map((x) => {
        if (typeof x === 'string') return x;
        if (isRecord(x)) return asString(x.ingredientId) ?? asString(x.id);
        return null;
      })
      .filter((x): x is string => !!x);
  }

  let substitutions: ChefSubstitution[] | undefined;
  if (Array.isArray(raw.substitutions)) {
    substitutions = [];
    for (const row of raw.substitutions) {
      const s = parseSubstitution(row);
      if (s) substitutions.push(s);
    }
  }

  let recipe: ChefGeneratedRecipe | null | undefined;
  if ('recipe' in raw) {
    recipe = parseRecipe(raw.recipe);
    if (raw.recipe !== null && raw.recipe !== undefined && recipe === null) {
      errors.push('recipe present but invalid');
    }
  }

  let suggestedPrompts: string[] | undefined;
  if (Array.isArray(raw.suggestedPrompts)) {
    suggestedPrompts = raw.suggestedPrompts.filter(
      (x): x is string => typeof x === 'string' && x.trim().length > 0,
    );
  }

  if (errors.length) return { ok: false, errors };

  const value: ModelChefResponse = {
    message: message!.trim(),
    intent,
    groundedPantryIds,
    ...(substitutions ? { substitutions } : {}),
    ...(recipe !== undefined ? { recipe } : {}),
    ...(suggestedPrompts ? { suggestedPrompts } : {}),
  };
  return { ok: true, value };
}

/** JSON Schema-ish description embedded in prompts for the model. */
export const CHEF_RESPONSE_SCHEMA_HINT = `{
  "message": string,                 // user-facing answer (required)
  "intent": "chat" | "what_can_i_make" | "substitute" | "generate_recipe" | "cooking_qa",
  "groundedPantryIds": string[],     // ingredientIds from the pantry snapshot you actually used
  "substitutions"?: [{
    "forIngredient": string,
    "suggestion": string,
    "ratio"?: string,
    "ingredientId"?: string,
    "allergens"?: string[],
    "dietaryFlags"?: string[],
    "unknownAllergens"?: boolean
  }],
  "recipe"?: {
    "title": string,
    "servings": number,
    "prepMin"?: number,
    "cookMin"?: number,
    "ingredients": [{
      "ingredientId"?: string,
      "rawText": string,
      "qty": number | null,
      "unit": string | null,
      "optional"?: boolean,
      "allergens"?: string[],
      "dietaryFlags"?: string[],
      "unknownAllergens"?: boolean
    }],
    "steps": [{ "text": string, "durationSec"?: number }],
    "tags"?: string[]
  },
  "suggestedPrompts"?: string[]
}`;
