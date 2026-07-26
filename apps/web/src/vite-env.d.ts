/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string | undefined;
  readonly VITE_SUPABASE_ANON_KEY: string | undefined;
  /** Dev UI entitlement override (never trusted by Edge Functions). */
  readonly VITE_CHEF_PAID: string | undefined;
  /** When "false", use production AdMob unit IDs from env. Default: test ads. */
  readonly VITE_ADMOB_USE_TEST_ADS: string | undefined;
  readonly VITE_ADMOB_BANNER_ANDROID: string | undefined;
  readonly VITE_ADMOB_BANNER_IOS: string | undefined;
  readonly VITE_ADSENSE_CLIENT: string | undefined;
  readonly VITE_ADSENSE_SLOT: string | undefined;
  readonly VITE_REVENUECAT_IOS_API_KEY: string | undefined;
  readonly VITE_REVENUECAT_ANDROID_API_KEY: string | undefined;
  readonly VITE_REVENUECAT_WEB_API_KEY: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
