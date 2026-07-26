/**
 * Stable device id for fold total-order tie-break (device_id).
 * Persisted in app_meta; never a secret.
 */

import type { SyncLocalPort } from './ports';
import { SYNC_META } from './types';

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function getOrCreateDeviceId(local: SyncLocalPort): Promise<string> {
  const existing = await local.getMeta(SYNC_META.deviceId);
  if (existing && existing.length > 0) return existing;
  const id = randomId();
  await local.setMeta(SYNC_META.deviceId, id);
  return id;
}
