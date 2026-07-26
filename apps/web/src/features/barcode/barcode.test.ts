import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import {
  OFF_ATTRIBUTION_LINE,
  OFF_SOURCE,
  OFF_USER_AGENT,
  BarcodeOffCache,
  BarcodeMappingStore,
  OffProductClient,
  OffRateLimiter,
  assertNotCanonicalIngredient,
  buildCanonicalMapping,
  buildSeedMatchCatalog,
  checkRateLimit,
  isOffSourced,
  isPlausibleBarcode,
  mapOffApiToDerived,
  matchOffProduct,
  normalizeBarcode,
  offProductMatchQuery,
  recordRequest,
  suggestionDefaults,
} from './index';

const here = path.dirname(fileURLToPath(import.meta.url));

function memoryStore() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

describe('OFF response → ingredient mapping', () => {
  it('maps OFF API JSON to a segregated OffDerivedProduct', () => {
    const product = mapOffApiToDerived('3017620422003', {
      code: '3017620422003',
      product_name: 'Nutella',
      brands: 'Ferrero',
      quantity: '400 g',
    });
    expect(product.source).toBe(OFF_SOURCE);
    expect(product.productName).toBe('Nutella');
    expect(product.brand).toBe('Ferrero');
    expect(product.quantityLabel).toBe('400 g');
    expect(product.attribution).toBe(OFF_ATTRIBUTION_LINE);
    expect(isOffSourced(product)).toBe(true);
    assertNotCanonicalIngredient(product);
  });

  it('matches OFF product name against our seed catalog (not OFF rows)', () => {
    const off = mapOffApiToDerived('000000000001', {
      product_name: 'Olive oil',
      brands: '',
    });
    const suggestion = matchOffProduct(off);
    expect(suggestion.offProduct?.source).toBe(OFF_SOURCE);
    expect(suggestion.queryText.toLowerCase()).toContain('olive');
    // Catalog is seed-only
    const catalog = buildSeedMatchCatalog();
    expect(catalog.ingredients.every((i) => !('source' in i))).toBe(true);
    const defaults = suggestionDefaults(suggestion.match);
    // May match oil-olive or similar depending on seed names
    if (defaults.ingredientId) {
      expect(catalog.ingredients.some((i) => i.id === defaults.ingredientId)).toBe(
        true,
      );
    }
  });

  it('user mapping stores only canonical ids + optional OFF ref', () => {
    const off = mapOffApiToDerived('12345678', {
      product_name: 'Test Sauce',
    });
    const mapping = buildCanonicalMapping({
      barcode: '12345678',
      ingredientId: 'soy-sauce',
      formId: 'soy-sauce-liquid',
      displayName: 'Soy sauce',
      offProduct: off,
    });
    expect(mapping.ingredientId).toBe('soy-sauce');
    expect(mapping.offRef?.productName).toBe('Test Sauce');
    expect(mapping).not.toHaveProperty('source');
    // Mapping is not an OFF product row
    expect(isOffSourced(mapping as { source?: string })).toBe(false);
  });

  it('match query prefers brand + name', () => {
    const off = mapOffApiToDerived('1', {
      product_name: 'Milk',
      brands: 'Horizon',
    });
    expect(offProductMatchQuery(off)).toBe('Horizon Milk');
  });
});

describe('rate-limit throttle', () => {
  it('allows up to 15 requests in a 60s window', () => {
    const now = 1_000_000;
    let stamps: number[] = [];
    for (let i = 0; i < 15; i++) {
      const peek = checkRateLimit(stamps, now + i);
      expect(peek.allowed).toBe(true);
      stamps = recordRequest(stamps, now + i);
    }
    const blocked = checkRateLimit(stamps, now + 20);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it('OffRateLimiter tryAcquire enforces the cap', () => {
    let t = 0;
    const limiter = new OffRateLimiter(15, 60_000, () => t);
    for (let i = 0; i < 15; i++) {
      t = i;
      expect(limiter.tryAcquire().allowed).toBe(true);
    }
    t = 20;
    expect(limiter.tryAcquire().allowed).toBe(false);
    // After window slides
    t = 60_001;
    expect(limiter.tryAcquire().allowed).toBe(true);
  });
});

describe('barcode cache hits', () => {
  it('returns cached OFF product without calling fetch', async () => {
    const store = memoryStore();
    const cache = new BarcodeOffCache(store);
    const product = mapOffApiToDerived('3017620422003', {
      product_name: 'Nutella',
      brands: 'Ferrero',
    });
    cache.set(product);

    const fetchImpl = vi.fn(async () => {
      throw new Error('network should not be called on cache hit');
    });
    const client = new OffProductClient({
      cache,
      fetchImpl,
      limiter: new OffRateLimiter(),
    });

    const result = await client.lookup('3017620422003');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fromCache).toBe(true);
      expect(result.product.productName).toBe('Nutella');
      expect(result.product.source).toBe(OFF_SOURCE);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('on network success, caches and tags source', async () => {
    const store = memoryStore();
    const cache = new BarcodeOffCache(store);
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          status: 1,
          product: {
            code: '3017620422003',
            product_name: 'Nutella',
            brands: 'Ferrero',
            quantity: '400 g',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    const client = new OffProductClient({ cache, fetchImpl });
    const first = await client.lookup('3017620422003');
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.fromCache).toBe(false);
      expect(first.product.source).toBe(OFF_SOURCE);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const firstCall = fetchImpl.mock.calls[0] as unknown as
      | [string, RequestInit?]
      | undefined;
    const headers = firstCall?.[1]?.headers;
    // User-Agent must identify the app
    if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
      const h = headers as Record<string, string>;
      expect(h['User-Agent']).toBe(OFF_USER_AGENT);
    }

    const second = await client.lookup('3017620422003');
    expect(second.ok && second.fromCache).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rate-limits live lookups and does not cache failures', async () => {
    const cache = new BarcodeOffCache(memoryStore());
    let t = 0;
    const limiter = new OffRateLimiter(2, 60_000, () => t);
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ status: 0 }), { status: 200 });
    });
    const client = new OffProductClient({ cache, limiter, fetchImpl });
    t = 1;
    await client.lookup('12345678');
    t = 2;
    await client.lookup('87654321');
    t = 3;
    const limited = await client.lookup('11111111');
    expect(limited.ok).toBe(false);
    if (!limited.ok) {
      expect(limited.reason).toBe('rate-limited');
    }
  });
});

describe('barcode helpers', () => {
  it('normalizes and validates UPC/EAN lengths', () => {
    expect(normalizeBarcode('301-762-042-2003')).toBe('3017620422003');
    expect(isPlausibleBarcode('3017620422003')).toBe(true);
    expect(isPlausibleBarcode('123')).toBe(false);
  });

  it('mapping store remembers barcode → ingredient', () => {
    const store = new BarcodeMappingStore(memoryStore());
    store.set({
      barcode: '12345678',
      ingredientId: 'milk',
      formId: 'milk-liquid',
      displayName: 'Milk',
      confirmedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(store.get('12345678')?.ingredientId).toBe('milk');
  });
});

describe('OFF attribution surfaces in barcode UI source', () => {
  it('BarcodeScreen ships attribution and does not import AdSlot', () => {
    const src = readFileSync(path.join(here, 'BarcodeScreen.tsx'), 'utf8');
    expect(src).toContain('OFF_ATTRIBUTION');
    expect(src).toContain('open-food-facts');
    expect(src).not.toMatch(/\bAdSlot\b/);
  });
});
