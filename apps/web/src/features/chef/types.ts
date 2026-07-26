/**
 * Client types for the AI chef Edge Function.
 */

export type Allergen =
  | 'milk'
  | 'egg'
  | 'fish'
  | 'shellfish'
  | 'tree_nut'
  | 'peanut'
  | 'wheat'
  | 'soy'
  | 'sesame';

export type DietaryFlag =
  | 'gluten'
  | 'pork'
  | 'alcohol'
  | 'beef'
  | 'shellfish-derived';

export type ChefIntent =
  | 'chat'
  | 'what_can_i_make'
  | 'substitute'
  | 'generate_recipe'
  | 'cooking_qa';

export type ChefMessageRole = 'user' | 'assistant';

export type ChatMessage = {
  readonly id: string;
  readonly role: ChefMessageRole;
  readonly content: string;
  readonly groundedPantry?: readonly GroundedPantryItem[];
  readonly substitutions?: readonly ChefSubstitution[];
  readonly recipe?: ChefGeneratedRecipe | null;
  readonly error?: boolean;
};

export type GroundedPantryItem = {
  readonly ingredientId: string;
  readonly name: string;
};

export type ChefSubstitution = {
  readonly forIngredient: string;
  readonly suggestion: string;
  readonly ratio?: string;
  readonly ingredientId?: string;
};

export type ChefRecipeLine = {
  readonly ingredientId?: string;
  readonly rawText: string;
  readonly qty: number | null;
  readonly unit: string | null;
  readonly optional?: boolean;
  readonly unknownAllergens?: boolean;
};

export type ChefGeneratedRecipe = {
  readonly title: string;
  readonly servings: number;
  readonly prepMin?: number;
  readonly cookMin?: number;
  readonly ingredients: readonly ChefRecipeLine[];
  readonly steps: readonly { readonly text: string; readonly durationSec?: number }[];
  readonly tags?: readonly string[];
};

export type PantrySnapshotItem = {
  readonly ingredientId: string;
  readonly name: string;
  readonly qtyBase?: number;
  readonly dim?: 'mass' | 'volume' | 'count';
  readonly formId?: string;
  readonly allergens?: readonly Allergen[];
  readonly dietaryFlags?: readonly DietaryFlag[];
  readonly unknownAllergens?: boolean;
};

export type DietaryProfile = {
  readonly avoidAllergens: readonly Allergen[];
  readonly avoidDietaryFlags: readonly DietaryFlag[];
  readonly notes?: string;
};

export type CatalogIngredientRef = {
  readonly id: string;
  readonly name: string;
  readonly allergens: readonly Allergen[];
  readonly dietaryFlags: readonly DietaryFlag[];
};

export type ChefSuccessResponse = {
  readonly ok: true;
  readonly attemptId: string;
  readonly message: string;
  readonly intent: ChefIntent;
  readonly groundedPantry: readonly GroundedPantryItem[];
  readonly substitutions?: readonly ChefSubstitution[];
  readonly recipe?: ChefGeneratedRecipe | null;
  readonly suggestedPrompts?: readonly string[];
  readonly summary: {
    readonly model: string;
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly estimatedCostUsd: number;
    readonly remainingBudgetUsd: number;
  };
};

export type ChefErrorResponse = {
  readonly ok: false;
  readonly code:
    | 'unauthorized'
    | 'entitlement_required'
    | 'missing_secret'
    | 'invalid_request'
    | 'rate_limited'
    | 'budget_exceeded'
    | 'safety_blocked'
    | 'schema_violation'
    | 'model_error'
    | 'internal'
    | 'network'
    | 'offline';
  readonly message: string;
  readonly attemptId?: string;
  readonly upgradeUrl?: string;
  readonly violations?: readonly {
    readonly kind: string;
    readonly detail: string;
  }[];
};

export type ChefResponse = ChefSuccessResponse | ChefErrorResponse;

export type EntitlementState = 'unknown' | 'free' | 'paid';

export const SUGGESTED_PROMPTS: readonly string[] = [
  'What can I make tonight with what I have?',
  'Suggest a substitution with a ratio',
  'Generate a simple weeknight recipe from my pantry',
  'How do I know when chicken is done?',
];
