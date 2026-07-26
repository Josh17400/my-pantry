/**
 * Client-side downscale + JPEG compress before upload.
 * Resolution costs money per scan and does not improve parse accuracy.
 */

export type CompressOptions = {
  /** Longest edge in CSS pixels. Default 1600. */
  readonly maxEdge?: number;
  /** JPEG quality 0–1. Default 0.72. */
  readonly quality?: number;
  readonly mimeType?: 'image/jpeg' | 'image/webp';
};

const DEFAULT_MAX_EDGE = 1600;
const DEFAULT_QUALITY = 0.72;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = src;
  });
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('FileReader did not return a data URL'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}

/**
 * Downscale so the longest edge ≤ maxEdge, encode as JPEG/WebP.
 * Returns a data URL suitable for the parse-receipt `images[].data` field.
 */
export async function compressImage(
  source: Blob | string,
  options: CompressOptions = {},
): Promise<{
  dataUrl: string;
  mimeType: 'image/jpeg' | 'image/webp';
  width: number;
  height: number;
  byteLength: number;
}> {
  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const mimeType = options.mimeType ?? 'image/jpeg';

  const dataUrlIn =
    typeof source === 'string' ? source : await readFileAsDataUrl(source);

  // Node / test environments without canvas: pass through (tests inject fixtures).
  if (typeof document === 'undefined') {
    const approxBytes = Math.ceil((dataUrlIn.length * 3) / 4);
    return {
      dataUrl: dataUrlIn,
      mimeType,
      width: maxEdge,
      height: maxEdge,
      byteLength: approxBytes,
    };
  }

  const img = await loadImage(dataUrlIn);
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }
  ctx.drawImage(img, 0, 0, width, height);

  const dataUrl = canvas.toDataURL(mimeType, quality);
  // strip data URL prefix for byte estimate
  const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1]! : dataUrl;
  const byteLength = Math.ceil((b64.length * 3) / 4);

  return { dataUrl, mimeType, width, height, byteLength };
}

/** Extract raw base64 (no data: prefix) for API payloads that prefer bare base64. */
export function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}
