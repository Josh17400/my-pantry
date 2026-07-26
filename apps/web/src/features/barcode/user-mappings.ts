/**
 * Remember barcode → canonical ingredient after user confirmation.
 * These are *our* mappings, not OFF rows.
 */

import type { BarcodeCanonicalMapping } from './types';
import { normalizeBarcode } from './cache';

export const MAPPING_STORAGE_KEY = 'tgp.barcode-canonical-map.v1' as const;

type MappingFile = {
  readonly version: 1;
  readonly byBarcode: Record<string, BarcodeCanonicalMapping>;
};

function emptyFile(): MappingFile {
  return { version: 1, byBarcode: {} };
}

export type MappingStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

function memoryStore(): MappingStore {
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

function defaultStore(): MappingStore {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* ignore */
  }
  return memoryStore();
}

function readFile(store: MappingStore): MappingFile {
  try {
    const raw = store.getItem(MAPPING_STORAGE_KEY);
    if (!raw) return emptyFile();
    const parsed = JSON.parse(raw) as MappingFile;
    if (parsed.version !== 1 || typeof parsed.byBarcode !== 'object') {
      return emptyFile();
    }
    return parsed;
  } catch {
    return emptyFile();
  }
}

export class BarcodeMappingStore {
  constructor(private readonly store: MappingStore = defaultStore()) {}

  get(barcode: string): BarcodeCanonicalMapping | null {
    const key = normalizeBarcode(barcode);
    if (!key) return null;
    return readFile(this.store).byBarcode[key] ?? null;
  }

  set(mapping: BarcodeCanonicalMapping): void {
    const key = normalizeBarcode(mapping.barcode);
    if (!key) return;
    const file = readFile(this.store);
    this.store.setItem(
      MAPPING_STORAGE_KEY,
      JSON.stringify({
        version: 1 as const,
        byBarcode: { ...file.byBarcode, [key]: { ...mapping, barcode: key } },
      }),
    );
  }

  clear(): void {
    this.store.removeItem?.(MAPPING_STORAGE_KEY);
    if (!this.store.removeItem) {
      this.store.setItem(MAPPING_STORAGE_KEY, JSON.stringify(emptyFile()));
    }
  }
}
