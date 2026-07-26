/**
 * RevenueCat purchases bridge.
 *
 * Native: @revenuecat/purchases-capacitor (lazy dynamic import).
 * Web: optional Web Billing key — otherwise graceful degrade (no broken UI).
 * Sandbox only in this track — no live payment rails.
 */

import { isNativePlatform, platformName } from '../../lib/platform';
import { RC_PRODUCTS, revenueCatApiKey } from './config';
import type { ProductOffer, PurchaseResult } from './types';

type CustomerInfoLike = unknown;

export type PurchasesBridge = {
  readonly available: boolean;
  configure(): Promise<void>;
  getOfferings(): Promise<readonly ProductOffer[]>;
  purchase(productId: string): Promise<PurchaseResult>;
  restore(): Promise<PurchaseResult & { readonly customerInfo?: CustomerInfoLike }>;
  getCustomerInfo(): Promise<CustomerInfoLike | null>;
  logIn(appUserId: string): Promise<void>;
};

type PurchasesPlugin = {
  configure(opts: { apiKey: string; appUserID?: string }): Promise<void>;
  getOfferings(): Promise<{
    current?: {
      availablePackages?: {
        identifier?: string;
        product?: {
          identifier?: string;
          title?: string;
          description?: string;
          priceString?: string;
          subscriptionPeriod?: string;
        };
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

const FALLBACK_OFFERS: readonly ProductOffer[] = [
  {
    id: RC_PRODUCTS.monthly,
    title: 'Good Pantry Pro — Monthly',
    description: 'AI chef, unlimited scans, no ads, household sharing.',
    priceString: '$4.99/mo',
    period: 'month',
  },
  {
    id: RC_PRODUCTS.annual,
    title: 'Good Pantry Pro — Annual',
    description: 'Same as monthly, billed yearly (sandbox display price).',
    priceString: '$39.99/yr',
    period: 'year',
  },
];

function periodFromSub(period: string | undefined): ProductOffer['period'] {
  if (!period) return 'unknown';
  const p = period.toUpperCase();
  if (p.includes('Y')) return 'year';
  if (p.includes('M')) return 'month';
  return 'unknown';
}

class NativePurchasesBridge implements PurchasesBridge {
  readonly available = true;
  private plugin: PurchasesPlugin | null = null;
  private configured = false;
  private packageCache = new Map<string, unknown>();
  private productCache = new Map<string, unknown>();

  private async load(): Promise<PurchasesPlugin | null> {
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
    const apiKey = revenueCatApiKey();
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

  async getOfferings(): Promise<readonly ProductOffer[]> {
    try {
      await this.configure();
      const p = await this.load();
      if (!p) return FALLBACK_OFFERS;

      const offerings = await p.getOfferings();
      const packages = offerings.current?.availablePackages ?? [];
      if (packages.length > 0) {
        const out: ProductOffer[] = [];
        for (const pkg of packages) {
          const prod = pkg.product;
          if (!prod?.identifier) continue;
          this.packageCache.set(prod.identifier, pkg);
          if (prod) this.productCache.set(prod.identifier, prod);
          out.push({
            id: prod.identifier,
            title: prod.title ?? prod.identifier,
            description: prod.description ?? '',
            priceString: prod.priceString ?? '',
            period: periodFromSub(prod.subscriptionPeriod),
          });
        }
        if (out.length > 0) return out;
      }

      const products = await p.getProducts({
        productIdentifiers: [RC_PRODUCTS.monthly, RC_PRODUCTS.annual],
      });
      const list = products.products ?? [];
      for (const prod of list) {
        this.productCache.set(prod.identifier, prod);
      }
      if (list.length === 0) return FALLBACK_OFFERS;
      return list.map((prod) => ({
        id: prod.identifier,
        title: prod.title,
        description: prod.description,
        priceString: prod.priceString,
        period: periodFromSub(prod.subscriptionPeriod),
      }));
    } catch (e) {
      console.warn('[purchases] getOfferings failed', e);
      return FALLBACK_OFFERS;
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
 * Shows catalog fallback; purchase resolves with a clear message so the
 * paywall never crashes. Web Billing can be wired via VITE_REVENUECAT_WEB_API_KEY
 * later without splitting Stripe.
 */
class WebPurchasesBridge implements PurchasesBridge {
  readonly available = false;

  async configure(): Promise<void> {
    // Web Billing SDK optional — unified entitlements still flow via webhook
    // when a web purchase completes on RevenueCat's hosted page.
  }

  async getOfferings(): Promise<readonly ProductOffer[]> {
    return FALLBACK_OFFERS;
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

/** Test injection. */
export function setPurchasesBridgeForTests(b: PurchasesBridge | null): void {
  bridge = b;
}

export function purchasesPlatformLabel(): string {
  if (!isNativePlatform()) return 'web';
  return platformName();
}
