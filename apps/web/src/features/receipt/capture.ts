/**
 * Receipt image capture: Capacitor Camera on native when available,
 * otherwise `<input type="file" capture>` / gallery on web.
 *
 * `@capacitor/camera` is optional — not yet a workspace dependency.
 * Native path uses a runtime global probe so typecheck stays clean.
 */

import { isNativePlatform } from '../../lib/platform';
import { compressImage, type CompressOptions } from './image-compress';
import type { CompressedImage } from './types';

export type CaptureResult =
  | { readonly ok: true; readonly image: CompressedImage }
  | { readonly ok: false; readonly reason: 'cancelled' | 'error'; readonly message: string };

type CapacitorCameraPlugin = {
  getPhoto: (opts: {
    quality: number;
    resultType: string;
    source: string;
    correctOrientation: boolean;
  }) => Promise<{
    dataUrl?: string;
    base64String?: string;
    format?: string;
  }>;
};

/**
 * Open a hidden file input (camera preferred on mobile via `capture`).
 * Injectable for tests.
 */
export function pickImageFromFileInput(
  options: {
    capture?: boolean;
    accept?: string;
    /** Injected file chooser for tests. */
    pickFile?: () => Promise<File | null>;
  } = {},
): Promise<File | null> {
  if (options.pickFile) {
    return options.pickFile();
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = options.accept ?? 'image/*';
    if (options.capture !== false) {
      input.setAttribute('capture', 'environment');
    }
    input.style.display = 'none';
    const cleanup = () => {
      input.remove();
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0] ?? null;
      cleanup();
      resolve(file);
    });
    // User cancel: focus returns without change on most browsers after a tick.
    window.addEventListener(
      'focus',
      () => {
        setTimeout(() => {
          if (!input.files?.length) {
            cleanup();
            resolve(null);
          }
        }, 400);
      },
      { once: true },
    );
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Probe for a Capacitor Camera plugin registered at runtime.
 * Avoids a hard dependency on `@capacitor/camera` until native track adds it.
 */
async function tryCapacitorCamera(): Promise<string | null> {
  if (!isNativePlatform()) return null;
  try {
    const w = globalThis as typeof globalThis & {
      Capacitor?: {
        Plugins?: { Camera?: CapacitorCameraPlugin };
      };
    };
    const camera = w.Capacitor?.Plugins?.Camera;
    if (!camera) return null;
    const photo = await camera.getPhoto({
      quality: 85,
      resultType: 'dataUrl',
      source: 'PROMPT',
      correctOrientation: true,
    });
    if (photo.dataUrl) return photo.dataUrl;
    if (photo.base64String) {
      const fmt = (photo.format ?? 'jpeg').toLowerCase();
      const mime = fmt === 'png' ? 'image/png' : 'image/jpeg';
      return `data:${mime};base64,${photo.base64String}`;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Capture one receipt photo, compress client-side, return data URL payload.
 */
export async function captureReceiptImage(
  options: {
    preferCamera?: boolean;
    compress?: CompressOptions;
    pickFile?: () => Promise<File | null>;
  } = {},
): Promise<CaptureResult> {
  try {
    let dataUrl: string | null = null;

    if (options.preferCamera !== false) {
      dataUrl = await tryCapacitorCamera();
    }

    if (!dataUrl) {
      const file = await pickImageFromFileInput({
        capture: options.preferCamera !== false,
        pickFile: options.pickFile,
      });
      if (!file) {
        return { ok: false, reason: 'cancelled', message: 'No photo selected' };
      }
      const compressed = await compressImage(file, options.compress);
      return { ok: true, image: compressed };
    }

    const compressed = await compressImage(dataUrl, options.compress);
    return { ok: true, image: compressed };
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
