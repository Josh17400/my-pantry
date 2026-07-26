/**
 * Screen keep-awake for cooking mode.
 * Uses @capacitor/keep-awake when native plugin is present; no-ops on web.
 */

import { registerPlugin } from '@capacitor/core';

import { isNativePlatform } from '../../lib/platform';

type KeepAwakePlugin = {
  keepAwake(): Promise<void>;
  allowSleep(): Promise<void>;
};

const KeepAwake = registerPlugin<KeepAwakePlugin>('KeepAwake');

let held = false;

/**
 * Request that the device stay awake. Safe on web (no-op / catch).
 */
export async function requestKeepAwake(): Promise<boolean> {
  if (!isNativePlatform()) {
    // Web: try Screen Wake Lock API when available (Chrome etc.)
    return tryBrowserWakeLock();
  }
  try {
    await KeepAwake.keepAwake();
    held = true;
    return true;
  } catch {
    return false;
  }
}

export async function releaseKeepAwake(): Promise<void> {
  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch {
      /* ignore */
    }
    wakeLockSentinel = null;
  }
  if (!isNativePlatform() || !held) {
    held = false;
    return;
  }
  try {
    await KeepAwake.allowSleep();
  } catch {
    /* ignore */
  }
  held = false;
}

type WakeLockSentinelLike = {
  release(): Promise<void>;
};

let wakeLockSentinel: WakeLockSentinelLike | null = null;

async function tryBrowserWakeLock(): Promise<boolean> {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: {
        request(type: 'screen'): Promise<WakeLockSentinelLike>;
      };
    };
    if (!nav.wakeLock) return false;
    wakeLockSentinel = await nav.wakeLock.request('screen');
    return true;
  } catch {
    return false;
  }
}

/** Test helper. */
export function isKeepAwakeHeld(): boolean {
  return held || wakeLockSentinel != null;
}
