/**
 * Honest paywall — free is a real pantry app.
 * No fake urgency, no disguised dismiss.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Card, cn } from '../../ui';
import { PAYWALL_FEATURES } from './entitlements';
import { useEntitlementStore } from './entitlement-store';
import { getPurchasesBridge } from './purchases';
import type { ProductOffer } from './types';

export type PaywallScreenProps = {
  /** Called after successful purchase / restore that lands paid. */
  onUnlocked?: () => void;
};

export function PaywallScreen({ onUnlocked }: PaywallScreenProps) {
  const snapshot = useEntitlementStore((s) => s.snapshot);
  const refresh = useEntitlementStore((s) => s.refresh);
  const setLocalTier = useEntitlementStore((s) => s.setLocalTier);

  const [offers, setOffers] = useState<readonly ProductOffer[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
    void getPurchasesBridge()
      .getOfferings()
      .then(setOffers)
      .catch(() => setOffers([]));
  }, [refresh]);

  const afterUnlock = useCallback(async () => {
    await refresh();
    onUnlocked?.();
  }, [onUnlocked, refresh]);

  const onPurchase = async (productId: string) => {
    setBusy(productId);
    setMessage(null);
    const result = await getPurchasesBridge().purchase(productId);
    setBusy(null);
    if (result.ok) {
      setMessage('Thank you — unlocking Pro features…');
      await afterUnlock();
      return;
    }
    if (result.cancelled) {
      setMessage('Purchase cancelled.');
      return;
    }
    setMessage(result.error);
  };

  const onRestore = async () => {
    setBusy('restore');
    setMessage(null);
    const result = await getPurchasesBridge().restore();
    setBusy(null);
    if (result.ok) {
      setMessage('Purchases restored.');
      await afterUnlock();
      return;
    }
    setMessage(result.error);
  };

  if (snapshot.tier === 'paid') {
    return (
      <div className="flex flex-col gap-4 px-4 py-6" data-paywall="unlocked">
        <h1 className="font-display text-2xl font-semibold text-ink">
          You&apos;re on Pro
        </h1>
        <p className="text-sm text-ink-muted">
          AI chef, unlimited receipt scans, no ads, household sharing, and cost
          analytics are unlocked. Manage billing in your App Store or Play
          Store subscriptions.
        </p>
        <Link
          to="/settings"
          className="text-sm font-semibold text-primary underline-offset-2 hover:underline"
        >
          Back to settings
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 px-4 py-6 pb-12" data-paywall="locked">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          Good Pantry Pro
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink">
          Keep the free pantry. Unlock the chef.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Free is a full pantry app — unlimited inventory, recipes, cook-to-deduct,
          and community browsing. Pro adds the AI chef, unlimited receipt scans,
          no ads, household sharing, and cost analytics. No countdown timers.
          No dark patterns.
        </p>
      </header>

      <Card padding="md" className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ink-muted/15 text-xs uppercase tracking-wide text-ink-muted">
              <th className="pb-2 font-semibold">Feature</th>
              <th className="pb-2 font-semibold">Free</th>
              <th className="pb-2 font-semibold">Pro</th>
            </tr>
          </thead>
          <tbody>
            {PAYWALL_FEATURES.map((f) => (
              <tr key={f.id} className="border-b border-ink-muted/10 last:border-0">
                <td className="py-2.5 pr-2 text-ink">{f.label}</td>
                <td className="py-2.5 text-center text-ink-muted">
                  {f.free ? '✓' : '—'}
                </td>
                <td className="py-2.5 text-center font-semibold text-primary">
                  {f.paid ? '✓' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="flex flex-col gap-3">
        {offers.map((offer) => (
          <button
            key={offer.id}
            type="button"
            disabled={busy !== null}
            onClick={() => void onPurchase(offer.id)}
            className={cn(
              'flex min-h-tap flex-col items-start rounded-card bg-primary px-4 py-3 text-left text-white shadow-card',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              'disabled:opacity-60',
            )}
          >
            <span className="text-sm font-semibold">
              {busy === offer.id ? 'Working…' : offer.title}
            </span>
            <span className="mt-0.5 text-xs text-white/85">
              {offer.priceString}
              {offer.description ? ` · ${offer.description}` : ''}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void onRestore()}
          className="min-h-tap rounded-pill border border-ink-muted/25 bg-surface px-4 text-sm font-semibold text-ink"
        >
          {busy === 'restore' ? 'Restoring…' : 'Restore purchases'}
        </button>
        <Link
          to="/"
          className="min-h-tap inline-flex items-center justify-center rounded-pill px-4 text-sm font-medium text-ink-muted hover:text-ink"
        >
          Not now — continue with free
        </Link>
      </div>

      {import.meta.env.DEV ? (
        <Card padding="sm" className="border border-dashed border-ink-muted/30">
          <p className="text-xs text-ink-muted">
            Dev sandbox: flip local UI entitlement (does not grant server
            chef/receipt quotas — webhook/session still required).
          </p>
          <button
            type="button"
            className="mt-2 text-xs font-semibold text-primary"
            onClick={() => {
              setLocalTier('paid');
              setMessage('Local UI set to paid (dev only).');
              onUnlocked?.();
            }}
          >
            Simulate Pro (UI only)
          </button>
        </Card>
      ) : null}

      {message ? (
        <p
          className="text-sm text-ink-muted"
          role="status"
          data-paywall-message
        >
          {message}
        </p>
      ) : null}

      <p className="text-xs text-ink-muted">
        Subscriptions renew unless cancelled in your store account. See{' '}
        <Link to="/privacy" className="underline underline-offset-2">
          Privacy
        </Link>
        . Sandbox purchases only during development.
      </p>
    </div>
  );
}
