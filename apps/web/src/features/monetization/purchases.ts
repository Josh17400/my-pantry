/**
 * RevenueCat purchases bridge.
 *
 * Native: @revenuecat/purchases-capacitor (lazy dynamic import).
 * Real store data, honest unavailable, or explicit demo — never fiction as live.
 *
 * Web: sample pricing only in DEV for design review; otherwise unavailable.
 */

import { isNativePlatform, platformName } from '../../lib/platform';
import { RC_PRODUCTS, revenueCatApiKey } from './config';
import type {
  OfferingsResult,
  OfferingsUnavailableReason,
  ProductOffer,
  PurchaseResult,
} from './types';

type CustomerInfoLike = unknown;

export type PurchasesBridge = {
  readonly available: boolean;
  configure(): Promise<void>;
  getOfferings(): Promise<OfferingsResult>;
  purchase(productId: string): Promise<PurchaseResult>;
  restore(): Promise<PurchaseResult & { readonly customerInfo?: CustomerInfoLike }>;
  getCustomerInfo(): Promise<CustomerInfoLike | null>;
  logIn(appUserId: string): Promise<void>;
};

type StoreProductLike = {
  identifier?: string;
  title?: string;
  description?: string;
  priceString?: string;
  subscriptionPeriod?: string;
};

type PurchasesPlugin = {
  configure(opts: { apiKey: string; appUserID?: string }): Promise<void>;
  getOfferings(): Promise<{
    current?: {
      availablePackages?: {
        identifier?: string;
        product?: StoreProductLike;
      }[];
    };
  }>;
  getProducts(opts: {
    productIdentifiers: string[];
  }): Promise<{
    products?: {
      identifier: string;
      title: string;
      description: string;
      priceString: string;
      subscriptionPeriod?: string;
    }[];
  }>;
  purchaseStoreProduct(opts: {
    product: unknown;
  }): Promise<{ customerInfo?: CustomerInfoLike }>;
  purchasePackage(opts: {
    aPackage: unknown;
  }): Promise<{ customerInfo?: CustomerInfoLike }>;
  restorePurchases(): Promise<{ customerInfo?: CustomerInfoLike }>;
  getCustomerInfo(): Promise<{ customerInfo?: CustomerInfoLike } | CustomerInfoLike>;
  logIn(opts: { appUserID: string }): Promise<void>;
};

/**
 * Demo / design-review fixtures only.
 * Never returned on native. Prices are sample labels, not chargeable amounts.
 */
export const SAMPLE_OFFERS: readonly ProductOffer[] = [
  {
    id: RC_PRODUCTS.monthly,
    title: 'Good Pantry Pro — Monthly (sample)',
    description: 'Sample pricing for design review — not a store price.',
    priceString: '$4.99/mo',
    period: 'month',
  },
  {
    id: RC_PRODUCTS.annual,
    title: 'Good Pantry Pro — Annual (sample)',
    description: 'Sample pricing for design review — not a store price.',
    priceString: '$39.99/yr',
    period: 'year',
  },
];

/** @deprecated Use SAMPLE_OFFERS — kept only so tests can assert fixtures are gone from native. */
export const FALLBACK_OFFERS = SAMPLE_OFFERS;

export function sampleOfferingsResult(): OfferingsResult {
  return {
    status: 'ready',
    offers: SAMPLE_OFFERS,
    isSamplePricing: true,
  };
}

export function readyOfferings(
  offers: readonly ProductOffer[],
): OfferingsResult {
  return {
    status: 'ready',
    offers,
    isSamplePricing: false,
  };
}

export function unavailableOfferings(
  reason: OfferingsUnavailableReason,
  detail?: string,
): OfferingsResult {
  return {
    status: 'unavailable',
    reason,
    message: offeringsUnavailableMessage(reason, detail),
  };
}

export function offeringsUnavailableMessage(
  reason: OfferingsUnavailableReason,
  detail?: string,
): string {
  const base: Record<OfferingsUnavailableReason, string> = {
    not_configured:
      'Subscriptions are not configured on this device (missing RevenueCat API key).',
    plugin_unavailable:
      'In-app purchases are unavailable on this device (billing plugin failed to load).',
    no_products:
      'No subscription products are available from the store right now.',
    network:
      'Could not reach the App Store / Play Store to load subscription prices.',
    error: 'Could not load subscription plans.',
  };
  const msg = base[reason];
  if (detail && detail.trim().length > 0) {
    return `${msg} (${detail.trim()})`;
  }
  return msg;
}

export function classifyOfferingsError(e: unknown): OfferingsUnavailableReason {
  const msg = e instanceof Error ? e.message : String(e);
  if (/not configured|API key|REPLACE|VITE_REVENUECAT/i.test(msg)) {
    return 'not_configured';
  }
  if (/plugin not available|plugin unavailable/i.test(msg)) {
    return 'plugin_unavailable';
  }
  if (
    /network|fetch|timeout|offline|ECONN|ENOTFOUND|failed to fetch|timed out/i.test(
      msg,
    )
  ) {
    return 'network';
  }
  return 'error';
}

export function periodFromSub(
  period: string | undefined,
): ProductOffer['period'] {
  if (!period) return 'unknown';
  const p = period.toUpperCase();
  if (p.includes('Y')) return 'year';
  if (p.includes('M')) return 'month';
  return 'unknown';
}

/** Map a store product to a ProductOffer — priceString comes only from the store. */
export function productToOffer(prod: {
  identifier: string;
  title?: string;
  description?: string;
  priceString?: string;
  subscriptionPeriod?: string;
}): ProductOffer {
  return {
    id: prod.identifier,
    title: prod.title ?? prod.identifier,
    description: prod.description ?? '',
    priceString: prod.priceString ?? '',
    period: periodFromSub(prod.subscriptionPeriod),
  };
}

/**
 * Build ready offerings from store product list (order preserved).
 * Empty list → unavailable no_products (caller decides logging).
 */
export function offeringsFromStoreProducts(
  products: readonly {
    identifier: string;
    title?: string;
    description?: string;
    priceString?: string;
    subscriptionPeriod?: string;
  }[],
): OfferingsResult {
  if (products.length === 0) {
    return unavailableOfferings('no_products');
  }
  return readyOfferings(products.map(productToOffer));
}

type NativeBridgeOptions = {
  loadPlugin?: () => Promise<PurchasesPlugin | null>;
  resolveApiKey?: () => string | undefined;
};

class NativePurchasesBridge implements PurchasesBridge {
  readonly available = true;
  private plugin: PurchasesPlugin | null = null;
  private configured = false;
  private packageCache = new Map<string, unknown>();
  private productCache = new Map<string, unknown>();

  constructor(private readonly options: NativeBridgeOptions = {}) {}

  private async load(): Promise<PurchasesPlugin | null> {
    if (this.options.loadPlugin) {
      return this.options.loadPlugin();
    }
    if (this.plugin) return this.plugin;
    if (!isNativePlatform()) return null;
    try {
      const mod = await import('@revenuecat/purchases-capacitor');
      this.plugin = mod.Purchases as unknown as PurchasesPlugin;
      return this.plugin;
    } catch (e) {
      console.warn('[purchases] plugin unavailable', e);
      return null;
    }
  }

  async configure(): Promise<void> {
    if (this.configured) return;
    const apiKey = this.options.resolveApiKey?.() ?? revenueCatApiKey();
    if (!apiKey || apiKey.startsWith('REPLACE')) {
      throw new Error(
        'RevenueCat API key not configured (VITE_REVENUECAT_*_API_KEY). Sandbox only.',
      );
    }
    const p = await this.load();
    if (!p) throw new Error('Purchases plugin not available on this platform');
    await p.configure({ apiKey });
    this.configured = true;
  }

  async getOfferings(): Promise<OfferingsResult> {
    try {
      const apiKey = this.options.resolveApiKey?.() ?? revenueCatApiKey();
      if (!apiKey || apiKey.startsWith('REPLACE')) {
        console.warn(
          '[purchases] getOfferings: RevenueCat API key missing or placeholder — showing unavailable state (not sample pricing)',
        );
        return unavailableOfferings(
          'not_configured',
          'RevenueCat API key not configured (VITE_REVENUECAT_*_API_KEY).',
        );
      }

      const p = await this.load();
      if (!p) {
        console.warn(
          '[purchases] getOfferings: plugin unavailable — showing unavailable state (not sample pricing)',
        );
        return unavailableOfferings('plugin_unavailable');
      }

      // Configure only after plugin + key are present so misconfig is explicit.
      await this.configure();

      const offerings = await p.getOfferings();
      const packages = offerings.current?.availablePackages ?? [];
      if (packages.length > 0) {
        const out: ProductOffer[] = [];
        for (const pkg of packages) {
          const prod = pkg.product;
          if (!prod?.identifier) continue;
          this.packageCache.set(prod.identifier, pkg);
          this.productCache.set(prod.identifier, prod);
          out.push(
            productToOffer({
              identifier: prod.identifier,
              title: prod.title,
              description: prod.description,
              priceString: prod.priceString,
              subscriptionPeriod: prod.subscriptionPeriod,
            }),
          );
        }
        if (out.length > 0) {
          return readyOfferings(out);
        }
      }

      // Request known product ids; store returns only those that exist.
      // Monthly-only catalogs are valid — do not invent annual.
      const products = await p.getProducts({
        productIdentifiers: [RC_PRODUCTS.monthly, RC_PRODUCTS.annual],
      });
      const list = products.products ?? [];
      for (const prod of list) {
        this.productCache.set(prod.identifier, prod);
      }
      if (list.length === 0) {
        console.warn(
          '[purchases] getOfferings: RevenueCat returned zero products — showing unavailable state (not sample pricing)',
        );
        return unavailableOfferings('no_products');
      }
      return offeringsFromStoreProducts(list);
    } catch (e) {
      const reason = classifyOfferingsError(e);
      const detail = e instanceof Error ? e.message : String(e);
      console.warn(
        `[purchases] getOfferings failed (${reason}) — showing unavailable state (not sample pricing):`,
        detail,
      );
      return unavailableOfferings(reason, detail);
    }
  }

  async purchase(productId: string): Promise<PurchaseResult> {
    try {
      await this.configure();
      const p = await this.load();
      if (!p) return { ok: false, error: 'Purchases unavailable' };

      const pkg = this.packageCache.get(productId);
      if (pkg && typeof p.purchasePackage === 'function') {
        await p.purchasePackage({ aPackage: pkg });
        return { ok: true };
      }

      let product = this.productCache.get(productId);
      if (!product) {
        await this.getOfferings();
        product = this.productCache.get(productId);
      }
      if (!product) {
        return { ok: false, error: `Unknown product: ${productId}` };
      }
      await p.purchaseStoreProduct({ product });
      return { ok: true };
    } catch (e) {
      const err = e as { message?: string; code?: string | number; userCancelled?: boolean };
      const msg = err?.message ?? String(e);
      const cancelled =
        err?.userCancelled === true ||
        err?.code === '1' ||
        err?.code === 1 ||
        /cancel/i.test(msg);
      return cancelled
        ? { ok: false, cancelled: true, error: msg }
        : { ok: false, error: msg };
    }
  }

  async restore(): Promise<
    PurchaseResult & { readonly customerInfo?: CustomerInfoLike }
  > {
    try {
      await this.configure();
      const p = await this.load();
      if (!p) return { ok: false, error: 'Purchases unavailable' };
      const res = await p.restorePurchases();
      const customerInfo =
        res && typeof res === 'object' && 'customerInfo' in res
          ? (res as { customerInfo?: CustomerInfoLike }).customerInfo
          : res;
      return { ok: true, customerInfo };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  async getCustomerInfo(): Promise<CustomerInfoLike | null> {
    try {
      await this.configure();
      const p = await this.load();
      if (!p) return null;
      const res = await p.getCustomerInfo();
      if (res && typeof res === 'object' && 'customerInfo' in res) {
        return (res as { customerInfo?: CustomerInfoLike }).customerInfo ?? null;
      }
      return res ?? null;
    } catch {
      return null;
    }
  }

  async logIn(appUserId: string): Promise<void> {
    try {
      await this.configure();
      const p = await this.load();
      if (!p) return;
      await p.logIn({ appUserID: appUserId });
    } catch (e) {
      console.warn('[purchases] logIn failed', e);
    }
  }
}

/**
 * Web / browser bridge — no native IAP.
 * DEV: sample pricing for design review (explicitly labelled).
 * Production web: honest unavailable (subscriptions complete in app stores).
 */
class WebPurchasesBridge implements PurchasesBridge {
  readonly available = false;

  async configure(): Promise<void> {
    // Web Billing SDK optional — unified entitlements still flow via webhook
    // when a web purchase completes on RevenueCat's hosted page.
  }

  async getOfferings(): Promise<OfferingsResult> {
    if (import.meta.env.DEV) {
      return sampleOfferingsResult();
    }
    return unavailableOfferings(
      'not_configured',
      'Subscriptions are completed in the App Store or Play Store.',
    );
  }

  async purchase(_productId: string): Promise<PurchaseResult> {
    void _productId;
    // Never touch live rails. Sandbox note for reviewers.
    if (import.meta.env.DEV) {
      return {
        ok: false,
        error:
          'Web sandbox: use Restore or Settings → Subscription to simulate paid via local override, or purchase on iOS/Android (StoreKit / Play Billing sandbox).',
      };
    }
    return {
      ok: false,
      error:
        'Subscriptions are completed in the App Store or Play Store. On web, open Settings after purchasing on your phone, or use Restore Purchases.',
    };
  }

  async restore(): Promise<
    PurchaseResult & { readonly customerInfo?: CustomerInfoLike }
  > {
    return {
      ok: false,
      error: 'Restore is available in the iOS and Android apps.',
    };
  }

  async getCustomerInfo(): Promise<CustomerInfoLike | null> {
    return null;
  }

  async logIn(_appUserId: string): Promise<void> {
    void _appUserId;
  }
}

let bridge: PurchasesBridge | null = null;

export function getPurchasesBridge(): PurchasesBridge {
  if (!bridge) {
    bridge = isNativePlatform()
      ? new NativePurchasesBridge()
      : new WebPurchasesBridge();
  }
  return bridge;
}

/** Test injection for the process-wide bridge. */
export function setPurchasesBridgeForTests(b: PurchasesBridge | null): void {
  bridge = b;
}

/**
 * Build a native purchases bridge with injectable plugin / API key (tests only).
 * Production code uses getPurchasesBridge().
 */
export function createNativePurchasesBridgeForTests(
  options: NativeBridgeOptions & {
    plugin?: PurchasesPlugin | null;
  } = {},
): PurchasesBridge {
  const { plugin, ...rest } = options;
  if (plugin !== undefined) {
    return new NativePurchasesBridge({
      ...rest,
      loadPlugin: async () => plugin,
      resolveApiKey: rest.resolveApiKey ?? (() => 'test_rc_api_key'),
    });
  }
  return new NativePurchasesBridge({
    ...rest,
    resolveApiKey: rest.resolveApiKey ?? (() => 'test_rc_api_key'),
  });
}

/** Build a web purchases bridge (tests). */
export function createWebPurchasesBridgeForTests(): PurchasesBridge {
  return new WebPurchasesBridge();
}

export function purchasesPlatformLabel(): string {
  if (!isNativePlatform()) return 'web';
  return platformName();
}
