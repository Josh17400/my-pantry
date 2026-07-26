/**
 * Shared types for the chef Edge Function.
 * Strict boundary types — no `any` on request/response surfaces.
 */

/** Major US FALCPA + sesame allergens (mirrors packages/core). */
export const ALLERGENS = [
  'milk',
  'egg',
  'fish',
  'shellfish',
  'tree_nut',
  'peanut',
  'wheat',
  'soy',
  'sesame',
] as const;

export type Allergen = (typeof ALLERGENS)[number];

/** Practical dietary flags (mirrors packages/core). */
export const DIETARY_FLAGS = [
  'gluten',
  'pork',
  'alcohol',
  'beef',
  'shellfish-derived',
] as const;

export type DietaryFlag = (typeof DIETARY_FLAGS)[number];

export type ChefIntent =
  | 'chat'
  | 'what_can_i_make'
  | 'substitute'
  | 'generate_recipe'
  | 'cooking_qa';

export type ChefMessageRole = 'user' | 'assistant' | 'system';

export interface ChefMessage {
  readonly role: ChefMessageRole;
  readonly content: string;
}

/** One pantry line the chef may ground answers on. */
export interface PantrySnapshotItem {
  readonly ingredientId: string;
  readonly name: string;
  readonly qtyBase?: number;
  readonly dim?: 'mass' | 'volume' | 'count';
  readonly formId?: string;
  readonly allergens?: readonly Allergen[];
  readonly dietaryFlags?: readonly DietaryFlag[];
  /** When true, treat as unsafe for avoid-list users. */
  readonly unknownAllergens?: boolean;
}

export interface DietaryProfile {
  readonly avoidAllergens: readonly Allergen[];
  readonly avoidDietaryFlags: readonly DietaryFlag[];
  /** Optional free-text prefs (vegetarian, low-carb) — soft, not the hard gate. */
  readonly notes?: string;
}

export interface RecipeContextLine {
  readonly ingredientId?: string;
  readonly rawText: string;
  readonly qty?: number | null;
  readonly unit?: string | null;
  readonly allergens?: readonly Allergen[];
  readonly dietaryFlags?: readonly DietaryFlag[];
  readonly unknownAllergens?: boolean;
}

export interface RecipeContext {
  readonly id?: string;
  readonly title?: string;
  readonly servings?: number;
  readonly ingredients?: readonly RecipeContextLine[];
  readonly steps?: readonly string[];
}

export interface CatalogIngredientRef {
  readonly id: string;
  readonly name: string;
  readonly allergens: readonly Allergen[];
  readonly dietaryFlags: readonly DietaryFlag[];
}

export type RequestBody = {
  readonly action?: 'chat';
  readonly messages: readonly ChefMessage[];
  readonly intent?: ChefIntent;
  readonly pantry?: readonly PantrySnapshotItem[];
  readonly dietary?: DietaryProfile;
  readonly recipe?: RecipeContext;
  /**
   * Optional ingredient catalog slice for resolving model ingredient ids
   * and running the hard allergen gate. Client should send known seed rows
   * referenced in pantry / recipe, or a relevant subset.
   */
  readonly catalog?: readonly CatalogIngredientRef[];
  readonly householdId?: string;
  /** When true, request streaming SSE (best-effort; client may fall back). */
  readonly stream?: boolean;
};

export interface GroundedPantryItem {
  readonly ingredientId: string;
  readonly name: string;
}

/** Structured recipe the model may return (saved as real Recipe client-side). */
export interface ChefRecipeLine {
  readonly ingredientId?: string;
  readonly rawText: string;
  readonly qty: number | null;
  readonly unit: string | null;
  readonly optional?: boolean;
  readonly allergens?: readonly Allergen[];
  readonly dietaryFlags?: readonly DietaryFlag[];
  readonly unknownAllergens?: boolean;
}

export interface ChefGeneratedRecipe {
  readonly title: string;
  readonly servings: number;
  readonly prepMin?: number;
  readonly cookMin?: number;
  readonly yieldNote?: string;
  readonly ingredients: readonly ChefRecipeLine[];
  readonly steps: readonly { readonly text: string; readonly durationSec?: number }[];
  readonly tags?: readonly string[];
}

export interface ChefSubstitution {
  readonly forIngredient: string;
  readonly suggestion: string;
  readonly ratio?: string;
  readonly ingredientId?: string;
  readonly allergens?: readonly Allergen[];
  readonly dietaryFlags?: readonly DietaryFlag[];
  readonly unknownAllergens?: boolean;
}

/** Parsed model payload after schema validation (pre safety gate). */
export interface ModelChefResponse {
  readonly message: string;
  readonly intent: ChefIntent;
  readonly groundedPantryIds: readonly string[];
  readonly substitutions?: readonly ChefSubstitution[];
  readonly recipe?: ChefGeneratedRecipe | null;
  readonly suggestedPrompts?: readonly string[];
}

export interface GateViolation {
  readonly kind:
    | 'flagged_allergen'
    | 'flagged_dietary'
    | 'unknown_allergens'
    | 'unknown_ingredient';
  readonly detail: string;
  readonly ingredientId?: string;
  readonly rawText?: string;
  readonly allergen?: Allergen;
  readonly dietaryFlag?: DietaryFlag;
}

export interface ChefSuccessResponse {
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
}

export interface ErrorResponse {
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
    | 'internal';
  readonly message: string;
  readonly attemptId?: string;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
  readonly violations?: readonly GateViolation[];
  readonly upgradeUrl?: string;
}

export type FunctionResponse = ChefSuccessResponse | ErrorResponse;

export interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface ModelPricing {
  readonly promptPerMillionUsd: number;
  readonly completionPerMillionUsd: number;
}

export interface UsageSnapshot {
  readonly userId: string;
  readonly monthKey: string;
  readonly requestCount: number;
  readonly spentUsd: number;
}

export interface ChefAttemptRecord {
  readonly id: string;
  readonly userId: string;
  readonly householdId: string | null;
  readonly status: 'ok' | 'failed' | 'safety_blocked' | 'rate_limited';
  readonly estimatedCostUsd: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly model: string | null;
  readonly intent: string;
  readonly createdAt: string;
}

export interface QuotaConfig {
  readonly isPaid: boolean;
  /** Monthly USD circuit breaker for chef model spend. */
  readonly monthlyBudgetUsd: number;
  /** Max requests per rolling window (rate limit). */
  readonly rateLimitCount: number;
  /** Rate-limit window in milliseconds. */
  readonly rateLimitWindowMs: number;
}

export const DEFAULT_QUOTA_CONFIG: QuotaConfig = {
  isPaid: false,
  /** Paid-only feature; budget still applies as runaway protection. */
  monthlyBudgetUsd: 3.0,
  rateLimitCount: 30,
  rateLimitWindowMs: 60 * 60 * 1000, // 30 / hour
};

/** Flash-class for chat / sub / Q&A. */
export const DEFAULT_CHAT_MODEL = 'google/gemini-2.5-flash';
/** Slightly stronger model for full recipe generation. */
export const DEFAULT_RECIPE_MODEL = 'google/gemini-2.5-flash';

export const DEFAULT_PRICING: ModelPricing = {
  promptPerMillionUsd: 0.3,
  completionPerMillionUsd: 2.5,
};

export function isAllergen(v: string): v is Allergen {
  return (ALLERGENS as readonly string[]).includes(v);
}

export function isDietaryFlag(v: string): v is DietaryFlag {
  return (DIETARY_FLAGS as readonly string[]).includes(v);
}
