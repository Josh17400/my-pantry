/**
 * Barcode scan adapters — native Capacitor / web BarcodeDetector / manual.
 * Never hard-crashes when plugins or APIs are missing.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

import { isNativePlatform } from '../../lib/platform';

export type ScanResult =
  | { readonly ok: true; readonly barcode: string; readonly format?: string }
  | { readonly ok: false; readonly reason: 'cancelled' | 'unavailable' | 'error'; readonly message: string };

/** Minimal plugin surface — works with community / ML Kit style plugins. */
type BarcodeScannerPlugin = {
  startScan?: () => Promise<{ hasContent?: boolean; content?: string }>;
  stopScan?: () => Promise<void>;
  checkPermission?: (opts?: {
    force?: boolean;
  }) => Promise<{ granted?: boolean; neverAsked?: boolean }>;
  requestPermissions?: () => Promise<{ camera?: string }>;
  isSupported?: () => Promise<{ supported: boolean }>;
  scan?: () => Promise<{ barcodes?: { rawValue?: string; displayValue?: string }[] }>;
};

const NativeScanner = registerPlugin<BarcodeScannerPlugin>('BarcodeScanner');

export type ScannerCapability =
  | 'native'
  | 'barcode-detector'
  | 'manual-only';

export function detectScannerCapability(): ScannerCapability {
  if (isNativePlatform()) return 'native';
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    return 'barcode-detector';
  }
  return 'manual-only';
}

/**
 * Attempt a native scan. On web or missing plugin, returns unavailable.
 */
export async function scanWithNative(): Promise<ScanResult> {
  if (!isNativePlatform()) {
    return {
      ok: false,
      reason: 'unavailable',
      message: 'Native scanner only runs in the iOS/Android app.',
    };
  }
  try {
    if (typeof NativeScanner.checkPermission === 'function') {
      const perm = await NativeScanner.checkPermission({ force: true });
      if (perm.granted === false) {
        return {
          ok: false,
          reason: 'error',
          message: 'Camera permission is required to scan barcodes.',
        };
      }
    }
    // ML Kit style
    if (typeof NativeScanner.scan === 'function') {
      const result = await NativeScanner.scan();
      const first = result.barcodes?.[0];
      const value = first?.rawValue ?? first?.displayValue;
      if (value) return { ok: true, barcode: value };
      return { ok: false, reason: 'cancelled', message: 'No barcode detected.' };
    }
    // Community barcode-scanner style
    if (typeof NativeScanner.startScan === 'function') {
      const result = await NativeScanner.startScan();
      if (result.hasContent && result.content) {
        return { ok: true, barcode: result.content };
      }
      return { ok: false, reason: 'cancelled', message: 'Scan cancelled.' };
    }
    return {
      ok: false,
      reason: 'unavailable',
      message: 'Barcode scanner plugin is not installed on this build.',
    };
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      message: err instanceof Error ? err.message : 'Scanner failed.',
    };
  }
}

/** Web BarcodeDetector types (not in all TS libs). */
type BarcodeDetectorLike = {
  detect(image: ImageBitmapSource): Promise<{ rawValue: string }[]>;
};

type BarcodeDetectorCtor = new (opts?: {
  formats?: string[];
}) => BarcodeDetectorLike;

/**
 * Detect barcodes in a video frame / canvas via BarcodeDetector when available.
 */
export async function detectFromImageSource(
  source: ImageBitmapSource,
): Promise<ScanResult> {
  const Ctor = (typeof window !== 'undefined'
    ? (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
        .BarcodeDetector
    : undefined);
  if (!Ctor) {
    return {
      ok: false,
      reason: 'unavailable',
      message: 'BarcodeDetector is not supported in this browser.',
    };
  }
  try {
    const detector = new Ctor({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'],
    });
    const codes = await detector.detect(source);
    const value = codes[0]?.rawValue;
    if (value) return { ok: true, barcode: value };
    return {
      ok: false,
      reason: 'cancelled',
      message: 'No barcode found in frame.',
    };
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      message: err instanceof Error ? err.message : 'Detection failed.',
    };
  }
}

/**
 * High-level scan entry: native when available, else signals UI to use
 * camera+BarcodeDetector or manual entry.
 */
export async function scanBarcode(): Promise<ScanResult> {
  const cap = detectScannerCapability();
  if (cap === 'native') return scanWithNative();
  return {
    ok: false,
    reason: 'unavailable',
    message:
      cap === 'barcode-detector'
        ? 'Use the on-page camera scanner or enter the barcode manually.'
        : 'Camera barcode scanning is not available here — enter the code manually.',
  };
}

export function platformLabel(): string {
  return Capacitor.getPlatform();
}
