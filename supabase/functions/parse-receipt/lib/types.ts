/**
 * Shared types for the parse-receipt Edge Function.
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

export type LineType =
  | 'food'
  | 'non-food'
  | 'tax'
  | 'discount'
  | 'total'
  | 'unknown';

export type UnitHint =
  | 'g'
  | 'kg'
  | 'oz'
  | 'lb'
  | 'ml'
  | 'l'
  | 'fl_oz'
  | 'each'
  | 'ct'
  | 'pk'
  | 'unknown';

/** One image payload — base64 (raw or data-URL) or a short-lived signed URL. */
export interface ReceiptImageInput {
  /** base64 bytes or data:image/...;base64,... — never logged. */
  readonly data?: string;
  /** HTTPS URL the model can fetch (e.g. temporary signed URL). Prefer over embedding for large multi-photo. */
  readonly url?: string;
  readonly mimeType?: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic';
}

export type ParseReceiptAction = 'parse' | 'commit' | 'abandon';

export interface ParseActionBody {
  readonly action?: 'parse';
  readonly images: readonly ReceiptImageInput[];
  /** BCP-47 locale for the receipt language (e.g. "es-MX", "en-US"). Default en-US. */
  readonly locale?: string;
  readonly householdId?: string;
  /**
   * Opt-in image retention. Default false = parse-and-discard.
   * When true, caller must have uploaded to the private receipts bucket first
   * and pass storage paths via images[].url; this function still never logs bytes.
   */
  readonly retainImage?: boolean;
  /** Optional prior UPC→allergen map from client/cache (never required). */
  readonly knownAllergensByUpc?: Readonly<Record<string, readonly Allergen[]>>;
}

export interface CommitActionBody {
  readonly action: 'commit';
  readonly attemptId: string;
  /** How many food lines the user actually committed to the pantry. */
  readonly committedLineCount: number;
}

export interface AbandonActionBody {
  readonly action: 'abandon';
  readonly attemptId: string;
}

export type RequestBody = ParseActionBody | CommitActionBody | AbandonActionBody;

/** Raw line as returned by the vision model (pre-normalization). */
export interface ModelLineItem {
  readonly rawText: string;
  readonly guessedName: string;
  readonly quantity: number | null;
  readonly unit: string | null;
  readonly packageSize: string | null;
  readonly unitPrice: number | null;
  readonly totalPrice: number | null;
  readonly confidence: number;
  readonly lineType: LineType;
  readonly upc?: string | null;
  readonly parentRawText?: string | null;
}

export interface ModelParseResult {
  readonly storeName: string | null;
  readonly storeAddress: string | null;
  readonly receiptDate: string | null;
  readonly currency: string | null;
  readonly locale: string | null;
  readonly isGroceryReceipt: boolean;
  readonly groceryConfidence: number;
  readonly lines: readonly ModelLineItem[];
  readonly subtotal: number | null;
  readonly tax: number | null;
  readonly total: number | null;
  readonly notes: string | null;
}

export interface ModelGroceryGateResult {
  readonly isGroceryReceipt: boolean;
  readonly groceryConfidence: number;
  readonly reason: string;
  readonly storeHint: string | null;
}

/** Normalized line ready for client matcher / review. */
export interface NormalizedLineItem {
  readonly id: string;
  readonly rawText: string;
  readonly guessedName: string;
  readonly quantity: number | null;
  readonly unit: UnitHint;
  /** Base mass in grams when weighed / package-mass known. */
  readonly massG: number | null;
  /** Base volume in ml when package-volume known. */
  readonly volumeMl: number | null;
  readonly packageSize: string | null;
  readonly unitPrice: number | null;
  readonly totalPrice: number | null;
  readonly confidence: number;
  readonly lineType: LineType;
  readonly upc: string | null;
  /** Discount/tax lines may point at a parent food line id. */
  readonly parentLineId: string | null;
  readonly multiBuy: boolean;
  readonly weighed: boolean;
  /**
   * Allergen tags when known from UPC / prior match.
   * When unknown, allergensUnknown is true — unsafe, never clear.
   */
  readonly allergens: readonly Allergen[];
  readonly allergensUnknown: boolean;
}

export interface ConfidenceBucket {
  readonly high: number;
  readonly medium: number;
  readonly low: number;
}

export interface ParseSummary {
  readonly model: string;
  readonly gateModel: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  /** Estimated USD for this request (gate + parse + retries). */
  readonly estimatedCostUsd: number;
  readonly confidence: ConfidenceBucket;
  readonly locale: string;
  readonly imageCount: number;
  readonly groceryConfidence: number;
  readonly schemaRetryUsed: boolean;
}

export interface ParseSuccessResponse {
  readonly ok: true;
  readonly attemptId: string;
  readonly status: 'parsed';
  /** Scan quota is NOT charged yet — client must call action:commit. */
  readonly quotaCharged: false;
  readonly storeName: string | null;
  readonly receiptDate: string | null;
  readonly currency: string | null;
  readonly total: number | null;
  readonly items: readonly NormalizedLineItem[];
  readonly summary: ParseSummary;
  readonly warnings: readonly string[];
}

export interface NonGroceryResponse {
  readonly ok: false;
  readonly code: 'not_grocery';
  readonly attemptId: string;
  readonly message: string;
  readonly groceryConfidence: number;
  readonly reason: string;
  /** Pre-check cost only; scan quota not charged. */
  readonly estimatedCostUsd: number;
  readonly quotaCharged: false;
}

export interface ErrorResponse {
  readonly ok: false;
  readonly code:
    | 'unauthorized'
    | 'missing_secret'
    | 'invalid_request'
    | 'quota_exceeded'
    | 'budget_exceeded'
    | 'schema_violation'
    | 'model_error'
    | 'unreadable'
    | 'internal';
  readonly message: string;
  readonly attemptId?: string;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface CommitSuccessResponse {
  readonly ok: true;
  readonly attemptId: string;
  readonly status: 'committed';
  readonly quotaCharged: true;
  readonly committedScansThisMonth: number;
  readonly scanLimit: number;
}

export interface AbandonSuccessResponse {
  readonly ok: true;
  readonly attemptId: string;
  readonly status: 'abandoned';
  readonly quotaCharged: false;
}

export type FunctionResponse =
  | ParseSuccessResponse
  | NonGroceryResponse
  | ErrorResponse
  | CommitSuccessResponse
  | AbandonSuccessResponse;

/** Token usage from a single model call. */
export interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface VisionCallResult<T> {
  readonly data: T;
  readonly model: string;
  readonly usage: TokenUsage;
  readonly rawContent: string;
}

export interface ModelPricing {
  readonly promptPerMillionUsd: number;
  readonly completionPerMillionUsd: number;
}

export type AttemptStatus =
  | 'attempted'
  | 'parsed'
  | 'failed'
  | 'not_grocery'
  | 'committed'
  | 'abandoned';

export interface UsageSnapshot {
  readonly userId: string;
  readonly monthKey: string;
  /** Scans that count toward free-tier limit (committed only). */
  readonly committedScans: number;
  /** Sum of estimated_cost_usd for all attempts that incurred model spend. */
  readonly spentUsd: number;
}

export interface ParseAttemptRecord {
  readonly id: string;
  readonly userId: string;
  readonly householdId: string | null;
  readonly status: AttemptStatus;
  readonly estimatedCostUsd: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly model: string | null;
  readonly imageCount: number;
  readonly locale: string;
  readonly createdAt: string;
  readonly committedAt: string | null;
  readonly committedLineCount: number | null;
}

export interface QuotaConfig {
  /** Free tier committed scans per calendar month. */
  readonly freeScanLimit: number;
  /** Monthly USD circuit breaker (all model spend, including failed/abandoned). */
  readonly monthlyBudgetUsd: number;
  /** Paid users skip scan limit (budget still applies as safety). */
  readonly isPaid: boolean;
  readonly paidScanLimit: number;
  readonly paidMonthlyBudgetUsd: number;
}

export const DEFAULT_QUOTA_CONFIG: QuotaConfig = {
  freeScanLimit: 15,
  /** p95 multi-photo warehouse can approach several cents; free budget bounds spend. */
  monthlyBudgetUsd: 0.5,
  isPaid: false,
  paidScanLimit: 10_000,
  paidMonthlyBudgetUsd: 5.0,
};

/** Default Flash-class vision model on OpenRouter. */
export const DEFAULT_VISION_MODEL = 'google/gemini-2.5-flash';
export const DEFAULT_GATE_MODEL = 'google/gemini-2.5-flash';

/**
 * OpenRouter list prices (approx, mid-2026) for cost estimation / circuit breaker.
 * Override via env RECEIPT_PROMPT_USD_PER_M / RECEIPT_COMPLETION_USD_PER_M.
 */
export const DEFAULT_PRICING: ModelPricing = {
  promptPerMillionUsd: 0.3,
  completionPerMillionUsd: 2.5,
};
