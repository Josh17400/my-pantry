/**
 * Client-side types for receipt capture → review → commit.
 * Mirrors parse-receipt Edge Function response shapes (Track A).
 */

/** Major US FALCPA + sesame (mirrors core / edge function). */
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

export type NormalizedLineItem = {
  readonly id: string;
  readonly rawText: string;
  readonly guessedName: string;
  readonly quantity: number | null;
  readonly unit: UnitHint;
  readonly massG: number | null;
  readonly volumeMl: number | null;
  readonly packageSize: string | null;
  readonly unitPrice: number | null;
  readonly totalPrice: number | null;
  readonly confidence: number;
  readonly lineType: LineType;
  readonly upc: string | null;
  readonly parentLineId: string | null;
  readonly multiBuy: boolean;
  readonly weighed: boolean;
  readonly allergens: readonly Allergen[];
  readonly allergensUnknown: boolean;
};

export type ConfidenceBucket = {
  readonly high: number;
  readonly medium: number;
  readonly low: number;
};

export type ParseSummary = {
  readonly model: string;
  readonly gateModel: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly estimatedCostUsd: number;
  readonly confidence: ConfidenceBucket;
  readonly locale: string;
  readonly imageCount: number;
  readonly groceryConfidence: number;
  readonly schemaRetryUsed: boolean;
};

/** Successful parse — quota NOT charged yet. */
export type ParseSuccessResponse = {
  readonly ok: true;
  readonly attemptId: string;
  readonly status: 'parsed';
  readonly quotaCharged: false;
  readonly storeName: string | null;
  readonly receiptDate: string | null;
  readonly currency: string | null;
  readonly total: number | null;
  readonly items: readonly NormalizedLineItem[];
  readonly summary: ParseSummary;
  readonly warnings: readonly string[];
};

export type NonGroceryResponse = {
  readonly ok: false;
  readonly code: 'not_grocery';
  readonly attemptId: string;
  readonly message: string;
  readonly groceryConfidence: number;
  readonly reason: string;
  readonly estimatedCostUsd: number;
  readonly quotaCharged: false;
};

export type ParseErrorResponse = {
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
    | 'internal'
    | 'offline'
    | 'network';
  readonly message: string;
  readonly attemptId?: string;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
};

export type ParseResponse =
  | ParseSuccessResponse
  | NonGroceryResponse
  | ParseErrorResponse;

export type CommitSuccessResponse = {
  readonly ok: true;
  readonly attemptId: string;
  readonly status: 'committed';
  readonly quotaCharged: true;
  readonly committedScansThisMonth: number;
  readonly scanLimit: number;
};

export type AbandonSuccessResponse = {
  readonly ok: true;
  readonly attemptId: string;
  readonly status: 'abandoned';
  readonly quotaCharged: false;
};

export type CompressedImage = {
  readonly dataUrl: string;
  readonly mimeType: 'image/jpeg' | 'image/webp';
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
};

/** How a line is classified for the bulk-first review UI. */
export type ReviewBucket =
  | 'high-auto'
  | 'needs-review'
  | 'allergen-veto'
  | 'size-ambiguity'
  | 'unmatched'
  | 'filtered';

export type LineDisposition = 'pending' | 'accepted' | 'skipped';

export type PackageChoice = {
  readonly label: string;
  readonly netG: number;
  readonly formId: string;
  /** Human prompt fragment, e.g. "16 oz". */
  readonly displayLabel: string;
};

export type CommitResult = {
  readonly added: number;
  readonly skipped: number;
  readonly shoppingTripId: string;
  readonly tapCount: number;
  readonly message: string;
};
