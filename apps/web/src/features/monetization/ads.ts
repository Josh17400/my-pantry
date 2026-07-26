/**
 * AdMob + UMP + ATT wiring.
 *
 * Placement: in-feed AdSlot only (never sticky above the tab bar).
 * Consent is mandatory: Google UMP for GDPR/EEA; ATT on iOS.
 * ATT is requested when the first free-tier AdSlot mounts — not on cold start
 * (App Review wants a findable prompt; OS also swallows ATT if app not active).
 *
 * Native plugin degrades to no-ops on web. Web may load AdSense when configured.
 * Never commits real ad unit IDs — see config.ts.
 */

import { isNativePlatform, platformName } from '../../lib/platform';
import { adSenseClientId, adSenseSlotId, bannerAdUnitId, useTestAds } from './config';
import type { AdsConsentState, ConsentStatus, TrackingStatus } from './types';

type AdMobPlugin = {
  initialize(opts: Record<string, unknown>): Promise<void>;
  trackingAuthorizationStatus(): Promise<{ status: string }>;
  requestTrackingAuthorization(): Promise<{ status?: string } | void>;
  requestConsentInfo(opts: Record<string, unknown>): Promise<{
    status?: string;
    isConsentFormAvailable?: boolean;
  }>;
  showConsentForm(): Promise<{ status?: string }>;
  showBanner(opts: {
    adId: string;
    adSize: string;
    position: string;
    margin: number;
    npa: boolean;
  }): Promise<void>;
  hideBanner(): Promise<void>;
  removeBanner(): Promise<void>;
};

let admob: AdMobPlugin | null | undefined;
let consentState: AdsConsentState = {
  umpStatus: 'unknown',
  trackingStatus: 'unavailable',
  npa: true,
  ready: false,
};
let initPromise: Promise<AdsConsentState> | null = null;
/** True when we have requested ATT for this session (in-feed mount path). */
let attRequested = false;

async function loadAdMob(): Promise<AdMobPlugin | null> {
  if (admob !== undefined) return admob;
  if (!isNativePlatform()) {
    admob = null;
    return null;
  }
  try {
    const mod = await import('@capacitor-community/admob');
    admob = mod.AdMob as unknown as AdMobPlugin;
    return admob;
  } catch (e) {
    console.warn('[ads] AdMob plugin unavailable', e);
    admob = null;
    return null;
  }
}

function mapUmpStatus(raw: string | undefined): ConsentStatus {
  switch ((raw ?? '').toUpperCase()) {
    case 'NOT_REQUIRED':
      return 'not_required';
    case 'REQUIRED':
      return 'required';
    case 'OBTAINED':
      return 'obtained';
    default:
      return 'unknown';
  }
}

function mapTracking(raw: string | undefined): TrackingStatus {
  switch (raw) {
    case 'notDetermined':
    case 'restricted':
    case 'denied':
    case 'authorized':
      return raw;
    default:
      return 'unavailable';
  }
}

/**
 * Request ATT with retry (mirrors euchre shell.js).
 * Call only when an ad surface is about to appear — not at app cold start.
 */
async function ensureAtt(plugin: AdMobPlugin): Promise<TrackingStatus> {
  if (platformName() !== 'ios') return 'unavailable';
  attRequested = true;

  const maxAttempts = 6;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        await sleep(400 * (attempt + 1));
        continue;
      }
      const t = await plugin.trackingAuthorizationStatus();
      const status = mapTracking(t?.status);
      if (status !== 'notDetermined') return status;
      await plugin.requestTrackingAuthorization().catch(() => undefined);
      const t2 = await plugin.trackingAuthorizationStatus();
      const status2 = mapTracking(t2?.status);
      if (status2 !== 'notDetermined') return status2;
      await sleep(500 * (attempt + 1));
    } catch {
      return 'unavailable';
    }
  }
  return 'notDetermined';
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Full ads readiness: ATT (iOS) → initialize → UMP form if required.
 * Resolves with npa flag. Never rejects.
 */
export async function ensureAdsReady(): Promise<AdsConsentState> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const plugin = await loadAdMob();
    if (!plugin) {
      consentState = {
        umpStatus: 'not_required',
        trackingStatus: 'unavailable',
        npa: true,
        ready: true,
      };
      return consentState;
    }

    try {
      // ATT first on iOS — before SDK touches tracking-related data.
      let tracking: TrackingStatus = 'unavailable';
      if (platformName() === 'ios') {
        tracking = await ensureAtt(plugin);
      }

      await plugin.initialize({});

      let consentInfo = await plugin.requestConsentInfo({});
      if (
        consentInfo?.isConsentFormAvailable &&
        (consentInfo.status ?? '').toUpperCase() === 'REQUIRED'
      ) {
        consentInfo = await plugin.showConsentForm();
      }

      const umpStatus = mapUmpStatus(consentInfo?.status);
      // Personalized only with explicit consent or when none required.
      const npa = !(umpStatus === 'obtained' || umpStatus === 'not_required');

      consentState = {
        umpStatus,
        trackingStatus: tracking,
        npa,
        ready: true,
      };
      return consentState;
    } catch (e) {
      console.warn('[ads] init/consent failed — NPA fallback', e);
      consentState = {
        umpStatus: 'error',
        trackingStatus: attRequested ? consentState.trackingStatus : 'unavailable',
        npa: true,
        ready: true,
      };
      return consentState;
    }
  })();

  return initPromise;
}

export function getAdsConsentState(): AdsConsentState {
  return consentState;
}

/**
 * We deliberately do NOT call showBanner(BOTTOM_CENTER).
 * Sticky banners above the tab bar are an AdMob accidental-click offense.
 * In-feed placement is HTML AdSlot; native banner overlay is reserved for
 * a future non-adjacent layout. This function only ensures consent + SDK.
 */
export async function prepareInFeedAd(): Promise<AdsConsentState> {
  return ensureAdsReady();
}

/**
 * Hide any accidental native banner if a future path showed one.
 * Safe no-op when never shown.
 */
export async function hideNativeBanner(): Promise<void> {
  const plugin = await loadAdMob();
  if (!plugin) return;
  try {
    await plugin.hideBanner();
  } catch {
    /* ignore */
  }
}

export function adUnitForDebug(): string {
  return bannerAdUnitId();
}

export function isUsingTestAds(): boolean {
  return useTestAds();
}

/** Web AdSense config — empty when not configured (render nothing, no broken frame). */
export function webAdSenseConfig(): {
  client: string;
  slot: string;
} | null {
  const client = adSenseClientId();
  const slot = adSenseSlotId();
  if (!client || !slot) return null;
  if (!client.startsWith('ca-pub-')) return null;
  return { client, slot };
}

/** Reset for tests. */
export function resetAdsStateForTests(): void {
  initPromise = null;
  admob = undefined;
  attRequested = false;
  consentState = {
    umpStatus: 'unknown',
    trackingStatus: 'unavailable',
    npa: true,
    ready: false,
  };
}
