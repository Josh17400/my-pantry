/**
 * Monetization domain types — ads, subscriptions, privacy.
 * No `any`. Client never treats local flags as server authority.
 */

/** Server + client plan strings (app_metadata.plan). */
export type PlanId = 'free' | 'paid' | 'pro' | 'unlimited';

/** UI-facing entitlement after resolving session / RC / overrides. */
export type EntitlementTier = 'free' | 'paid';

export type EntitlementSource =
  | 'default'
  | 'session'
  | 'revenuecat'
  | 'dev_override'
  | 'webhook_mirror';

export type EntitlementSnapshot = {
  readonly tier: EntitlementTier;
  readonly plan: PlanId;
  readonly source: EntitlementSource;
  /** ISO timestamp of last successful refresh, if any. */
  readonly refreshedAt: string | null;
  /** Human product / entitlement id when known (e.g. good_pantry_pro). */
  readonly activeEntitlementId: string | null;
};

export type ConsentStatus =
  | 'unknown'
  | 'not_required'
  | 'required'
  | 'obtained'
  | 'denied'
  | 'error';

export type TrackingStatus =
  | 'notDetermined'
  | 'restricted'
  | 'denied'
  | 'authorized'
  | 'unavailable';

export type AdsConsentState = {
  readonly umpStatus: ConsentStatus;
  readonly trackingStatus: TrackingStatus;
  /** True → request non-personalized ads only. */
  readonly npa: boolean;
  readonly ready: boolean;
};

export type PurchaseResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly cancelled?: boolean; readonly error: string };

export type ProductOffer = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly priceString: string;
  /** Monthly vs annual for display only. */
  readonly period: 'month' | 'year' | 'lifetime' | 'unknown';
};

export type PaywallFeature = {
  readonly id: string;
  readonly label: string;
  readonly free: boolean;
  readonly paid: boolean;
};

/** JSON export shape — versioned for forward compatibility. */
export type DataExportV1 = {
  readonly schemaVersion: 1;
  readonly exportedAt: string;
  readonly app: 'the-good-pantry';
  readonly householdId: string;
  readonly pantry: readonly DataExportPantryItem[];
  readonly recipes: readonly DataExportRecipe[];
  readonly history: readonly DataExportHistoryEvent[];
};

export type DataExportPantryItem = {
  readonly ingredientId: string;
  readonly ingredientName: string;
  readonly formId: string;
  readonly formName: string | null;
  readonly locationId: string | null;
  readonly locationName: string | null;
  readonly qtyBase: number;
  readonly dim: string;
  readonly parLevelBase: number;
  readonly lowThresholdPct: number;
  readonly lastVerifiedAt: string | null;
  readonly expiresAt: string | null;
  readonly updatedAt: string;
};

export type DataExportRecipe = {
  readonly id: string;
  readonly title: string;
  readonly servings: number;
  readonly prepMin: number | null;
  readonly cookMin: number | null;
  readonly tags: readonly string[];
  readonly visibility: string;
  readonly ingredients: readonly {
    readonly rawText: string;
    readonly qty: number | null;
    readonly unit: string | null;
    readonly optional: boolean;
    readonly ingredientId: string | null;
  }[];
  readonly steps: readonly {
    readonly text: string;
    readonly durationSec: number | null;
  }[];
};

export type DataExportHistoryEvent = {
  readonly id: string;
  readonly kind: string;
  readonly reason: string;
  readonly ingredientId: string;
  readonly formId: string;
  readonly deltaBase: number | null;
  readonly targetBase: number | null;
  readonly occurredAt: string;
  readonly refId: string | null;
};

export type NotificationPrefs = {
  readonly dailyShoppingBrief: boolean;
  /** Local hour 0–23 inclusive when quiet hours start. */
  readonly quietHoursStart: number;
  /** Local hour 0–23 inclusive when quiet hours end (may wrap midnight). */
  readonly quietHoursEnd: number;
};

export type UnitsDisplayPref = 'us_retail' | 'metric';

export type DietarySettings = {
  readonly avoidAllergens: readonly string[];
  readonly avoidDietaryFlags: readonly string[];
  readonly notes: string;
};

export const PAID_PLANS: ReadonlySet<string> = new Set([
  'paid',
  'pro',
  'unlimited',
]);

export const ENTITLEMENT_ID_PRO = 'good_pantry_pro';

export const FREE_RECEIPT_SCANS_PER_MONTH = 15;
