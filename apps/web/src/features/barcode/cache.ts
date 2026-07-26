/**
 * Local barcode → OFF product cache.
 * Repeat scans cost no network request (and do not burn rate-limit budget).
 */

import { isOffSourced } from './segregation';
import type { OffDerivedProduct } from './types';

export const BARCODE_CACHE_STORAGE_KEY = 'tgp.off-barcode-cache.v1' as const;

export type CacheStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

function memoryStore(): CacheStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

function defaultStore(): CacheStore {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch {
    /* private mode / SSR */
  }
  return memoryStore();
}

type CacheFile = {
  readonly version: 1;
  readonly byBarcode: Record<string, OffDerivedProduct>;
};

function emptyFile(): CacheFile {
  return { version: 1, byBarcode: {} };
}

function readFile(store: CacheStore): CacheFile {
  try {
    const raw = store.getItem(BARCODE_CACHE_STORAGE_KEY);
    if (!raw) return emptyFile();
    const parsed = JSON.parse(raw) as CacheFile;
    if (parsed.version !== 1 || typeof parsed.byBarcode !== 'object') {
      return emptyFile();
    }
    return parsed;
  } catch {
    return emptyFile();
  }
}

function writeFile(store: CacheStore, file: CacheFile): void {
  store.setItem(BARCODE_CACHE_STORAGE_KEY, JSON.stringify(file));
}

export class BarcodeOffCache {
  constructor(private readonly store: CacheStore = defaultStore()) {}

  get(barcode: string): OffDerivedProduct | null {
    const key = normalizeBarcode(barcode);
    if (!key) return null;
    const file = readFile(this.store);
    const hit = file.byBarcode[key];
    if (!hit || !isOffSourced(hit)) return null;
    return hit;
  }

  set(product: OffDerivedProduct): void {
    if (!isOffSourced(product)) {
      throw new Error('Only OFF-sourced products may enter the OFF cache');
    }
    const key = normalizeBarcode(product.barcode);
    if (!key) return;
    const file = readFile(this.store);
    writeFile(this.store, {
      version: 1,
      byBarcode: { ...file.byBarcode, [key]: product },
    });
  }

  has(barcode: string): boolean {
    return this.get(barcode) !== null;
  }

  clear(): void {
    this.store.removeItem?.(BARCODE_CACHE_STORAGE_KEY);
    if (!this.store.removeItem) {
      writeFile(this.store, emptyFile());
    }
  }
}

export function normalizeBarcode(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** True for UPC-A (12), EAN-13 (13), EAN-8 (8), UPC-E (8) digit lengths. */
export function isPlausibleBarcode(raw: string): boolean {
  const digits = normalizeBarcode(raw);
  return digits.length === 8 || digits.length === 12 || digits.length === 13;
}
