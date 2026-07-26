import { useEffect, useState } from 'react';

import {
  prepareInFeedAd,
  shouldShowAd,
  useEntitlementStore,
  webAdSenseConfig,
} from '../features/monetization';
import { cn } from './cn';

type AdSlotProps = {
  /**
   * Paid tier hides ads entirely.
   * When omitted, entitlement store decides (free shows, paid hides).
   * Explicit true/false still respected for gallery / tests.
   */
  paidTier?: boolean;
  className?: string;
  /** For gallery / review — force visible even if paid */
  forceShow?: boolean;
};

/**
 * In-feed ad reservation — NOT pinned above the tab bar.
 *
 * AdMob forbids banners adjacent to navigation / interactive controls
 * (accidental-click policy). This slot is a home-feed card, well clear
 * of the bottom tab bar + FAB. Sized for a standard medium rectangle /
 * large banner feel (~320×100–120 logical px on phone).
 *
 * Free tier only. On first mount we run UMP + ATT (not cold start).
 * Web: AdSense when configured, else a quiet placeholder — never a broken frame.
 * Renders nothing when subscribed (or paidTier).
 */
export function AdSlot({
  paidTier,
  className,
  forceShow = false,
}: AdSlotProps) {
  const isPaid = useEntitlementStore((s) => s.snapshot.tier === 'paid');
  const [consentReady, setConsentReady] = useState(false);
  const [consentError, setConsentError] = useState(false);

  const show = shouldShowAd({
    paidTier,
    isPaid,
    forceShow,
  });

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    void prepareInFeedAd()
      .then(() => {
        if (!cancelled) setConsentReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setConsentError(true);
          setConsentReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [show]);

  if (!show) {
    return null;
  }

  const adsense = webAdSenseConfig();

  return (
    <aside
      className={cn(
        'w-full overflow-hidden rounded-card border border-dashed border-ink-muted/25 bg-surface',
        className,
      )}
      aria-label="Advertisement"
      data-ad-slot="in-feed"
      data-ad-consent={consentReady ? 'ready' : 'pending'}
      data-ad-npa={consentError ? 'fallback' : undefined}
    >
      {adsense ? (
        <WebAdSenseFrame client={adsense.client} slot={adsense.slot} />
      ) : (
        <div className="flex min-h-[100px] flex-col items-center justify-center gap-1 px-4 py-5 text-center">
          <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-ink-muted/70">
            Ad
          </span>
          <span className="max-w-[14rem] text-xs text-ink-muted">
            Sponsored placement · free tier · in-feed only
          </span>
          {!consentReady ? (
            <span className="text-[0.65rem] text-ink-muted/60">
              Preparing ads…
            </span>
          ) : null}
        </div>
      )}
    </aside>
  );
}

/**
 * AdSense embed — only when client + slot env are set.
 * Loads script once; never throws into the tree.
 */
function WebAdSenseFrame({
  client,
  slot,
}: {
  client: string;
  slot: string;
}) {
  useEffect(() => {
    try {
      const id = 'tgp-adsense';
      if (!document.getElementById(id)) {
        const s = document.createElement('script');
        s.id = id;
        s.async = true;
        s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
        s.crossOrigin = 'anonymous';
        document.head.appendChild(s);
      }
      // Push after tick so the ins node exists.
      const t = window.setTimeout(() => {
        try {
          const w = window as unknown as {
            adsbygoogle?: unknown[];
          };
          w.adsbygoogle = w.adsbygoogle ?? [];
          w.adsbygoogle.push({});
        } catch {
          /* unfilled / blocked — leave empty frame, not broken UI */
        }
      }, 50);
      return () => window.clearTimeout(t);
    } catch {
      return undefined;
    }
  }, [client]);

  return (
    <div className="min-h-[100px] w-full px-2 py-2">
      <ins
        className="adsbygoogle"
        style={{ display: 'block', minHeight: 100 }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="horizontal"
        data-full-width-responsive="false"
      />
    </div>
  );
}
