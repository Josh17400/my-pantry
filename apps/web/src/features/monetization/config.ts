/**
 * Monetization config — env-driven, never commits real ad unit IDs or secrets.
 *
 * Google official TEST ad unit IDs are hard-coded for dev (safe to click).
 * Production unit IDs must come from VITE_ADMOB_* env vars only.
 */

import { isNativePlatform, platformName } from '../../lib/platform';

/** Google's official always-fill test banner units. Safe for development. */
export const GOOGLE_TEST_BANNER_IDS = {
  android: 'ca-app-pub-3940256099942544/6300978111',
  ios: 'ca-app-pub-3940256099942544/2934735716',
} as const;

/** Google official test app ids (manifests / Info.plist). */
export const GOOGLE_TEST_APP_IDS = {
  android: 'ca-app-pub-3940256099942544~3347511713',
  ios: 'ca-app-pub-3940256099942544~1458002511',
} as const;

function envString(key: string): string | undefined {
  const v = import.meta.env[key] as string | undefined;
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

/**
 * Use Google test ads unless explicitly told not to.
 * Production builds should set VITE_ADMOB_USE_TEST_ADS=false and real unit IDs.
 */
export function useTestAds(): boolean {
  const flag = envString('VITE_ADMOB_USE_TEST_ADS');
  if (flag === 'false' || flag === '0') return false;
  if (flag === 'true' || flag === '1') return true;
  // Default: test ads in non-production, or when no real unit id is configured.
  if (import.meta.env.PROD && envString('VITE_ADMOB_BANNER_ANDROID')) {
    return false;
  }
  return true;
}

export function bannerAdUnitId(): string {
  const plat = platformName();
  if (useTestAds()) {
    return plat === 'ios'
      ? GOOGLE_TEST_BANNER_IDS.ios
      : GOOGLE_TEST_BANNER_IDS.android;
  }
  if (plat === 'ios') {
    return (
      envString('VITE_ADMOB_BANNER_IOS') ?? GOOGLE_TEST_BANNER_IDS.ios
    );
  }
  return (
    envString('VITE_ADMOB_BANNER_ANDROID') ?? GOOGLE_TEST_BANNER_IDS.android
  );
}

/** Optional AdSense client for web companion (ca-pub-…). Never required. */
export function adSenseClientId(): string | undefined {
  return envString('VITE_ADSENSE_CLIENT');
}

export function adSenseSlotId(): string | undefined {
  return envString('VITE_ADSENSE_SLOT');
}

export function revenueCatApiKey(): string | undefined {
  if (!isNativePlatform()) {
    // Web Billing public key (optional). Sandbox / placeholder OK.
    return envString('VITE_REVENUECAT_WEB_API_KEY');
  }
  const plat = platformName();
  if (plat === 'ios') {
    return envString('VITE_REVENUECAT_IOS_API_KEY');
  }
  if (plat === 'android') {
    return envString('VITE_REVENUECAT_ANDROID_API_KEY');
  }
  return envString('VITE_REVENUECAT_WEB_API_KEY');
}

/** Offering package ids — must match RevenueCat dashboard (sandbox). */
export const RC_PRODUCTS = {
  monthly: 'good_pantry_pro_monthly',
  annual: 'good_pantry_pro_annual',
  entitlement: 'good_pantry_pro',
} as const;

/**
 * Dev-only entitlement override (mirrors chef VITE_CHEF_PAID / tgp.plan).
 * Never trusted by Edge Functions.
 */
export function devPlanOverride(): 'free' | 'paid' | null {
  if (envString('VITE_CHEF_PAID') === 'true') return 'paid';
  try {
    const v = localStorage.getItem('tgp.plan');
    if (v === 'paid' || v === 'free') return v;
  } catch {
    /* SSR / private mode */
  }
  return null;
}
