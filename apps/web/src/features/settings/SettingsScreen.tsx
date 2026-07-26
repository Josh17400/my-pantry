/**
 * Settings — dietary, household, notifications, units, subscription, privacy.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { DEFAULT_HOUSEHOLD_ID } from '../../db/constants';
import { hasActiveRepository, getDomainRepository } from '../../state/repo-context';
import { usePantryStore } from '../../state/pantry-store';
import { Card, cn } from '../../ui';
import {
  collectExportFromRepository,
  downloadExportJson,
  requestAccountDeletion,
  useEntitlementStore,
} from '../monetization';
import type { DietarySettings, NotificationPrefs, UnitsDisplayPref } from '../monetization/types';
import {
  ALLERGEN_OPTIONS,
  DIETARY_FLAG_OPTIONS,
  loadDietarySettings,
  loadNotificationPrefs,
  loadUnitsDisplay,
  saveDietarySettings,
  saveNotificationPrefs,
  saveUnitsDisplay,
} from './prefs';

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function ToggleChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-tap rounded-pill px-3 py-1.5 text-xs font-semibold transition-colors',
        selected
          ? 'bg-primary text-white'
          : 'bg-surface text-ink-muted ring-1 ring-ink-muted/20',
      )}
    >
      {label.replace(/_/g, ' ')}
    </button>
  );
}

export function SettingsScreen() {
  const householdId = usePantryStore((s) => s.householdId);
  const snapshot = useEntitlementStore((s) => s.snapshot);
  const refresh = useEntitlementStore((s) => s.refresh);

  const [dietary, setDietary] = useState<DietarySettings>(() =>
    loadDietarySettings(),
  );
  const [notifications, setNotifications] = useState<NotificationPrefs>(() =>
    loadNotificationPrefs(),
  );
  const [units, setUnits] = useState<UnitsDisplayPref>(() => loadUnitsDisplay());
  const [status, setStatus] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const persistDietary = useCallback((next: DietarySettings) => {
    setDietary(next);
    saveDietarySettings(next);
  }, []);

  const persistNotifications = useCallback((next: NotificationPrefs) => {
    setNotifications(next);
    saveNotificationPrefs(next);
  }, []);

  const onExport = async () => {
    setBusy(true);
    setStatus(null);
    try {
      if (!hasActiveRepository()) {
        setStatus(
          'No local pantry database active — export needs the native app or dev driver.',
        );
        return;
      }
      const domain = getDomainRepository();
      const data = await collectExportFromRepository(
        domain,
        householdId || DEFAULT_HOUSEHOLD_ID,
      );
      downloadExportJson(data);
      setStatus(
        `Exported ${data.pantry.length} pantry items, ${data.recipes.length} recipes, ${data.history.length} history events.`,
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    setBusy(true);
    setStatus(null);
    const result = await requestAccountDeletion();
    setBusy(false);
    if (result.ok) {
      setStatus('Account deleted. You have been signed out.');
      setDeleteConfirm(false);
    } else {
      setStatus(result.error);
    }
  };

  const toggleAllergen = (a: string) => {
    const set = new Set(dietary.avoidAllergens);
    if (set.has(a)) set.delete(a);
    else set.add(a);
    persistDietary({ ...dietary, avoidAllergens: [...set] });
  };

  const toggleFlag = (f: string) => {
    const set = new Set(dietary.avoidDietaryFlags);
    if (set.has(f)) set.delete(f);
    else set.add(f);
    persistDietary({ ...dietary, avoidDietaryFlags: [...set] });
  };

  return (
    <div className="flex flex-col gap-8 px-4 py-6 pb-16" data-settings>
      <header>
        <h1 className="font-display text-2xl font-semibold text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Dietary profile, household, notifications, and privacy.
        </p>
      </header>

      <Section title="Subscription">
        <Card padding="md">
          <p className="text-sm text-ink">
            Status:{' '}
            <span className="font-semibold">
              {snapshot.tier === 'paid' ? 'Good Pantry Pro' : 'Free'}
            </span>
            {snapshot.source !== 'default' ? (
              <span className="text-ink-muted"> · via {snapshot.source}</span>
            ) : null}
          </p>
          {snapshot.tier === 'free' ? (
            <Link
              to="/paywall"
              className="mt-3 inline-flex min-h-tap items-center rounded-pill bg-primary px-4 text-sm font-semibold text-white"
            >
              See Pro features
            </Link>
          ) : (
            <p className="mt-2 text-xs text-ink-muted">
              Manage billing in App Store or Google Play subscriptions.
            </p>
          )}
        </Card>
      </Section>

      <Section title="Dietary profile">
        <p className="text-xs text-ink-muted">
          Allergens and dietary flags used by the AI chef safety gate. Matches
          the same local keys as the chef.
        </p>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Avoid allergens
          </p>
          <div className="flex flex-wrap gap-2">
            {ALLERGEN_OPTIONS.map((a) => (
              <ToggleChip
                key={a}
                label={a}
                selected={dietary.avoidAllergens.includes(a)}
                onClick={() => toggleAllergen(a)}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Avoid dietary flags
          </p>
          <div className="flex flex-wrap gap-2">
            {DIETARY_FLAG_OPTIONS.map((f) => (
              <ToggleChip
                key={f}
                label={f}
                selected={dietary.avoidDietaryFlags.includes(f)}
                onClick={() => toggleFlag(f)}
              />
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-semibold text-ink-muted">Notes</span>
          <textarea
            className="min-h-[4rem] rounded-card border border-ink-muted/20 bg-surface px-3 py-2 text-ink"
            value={dietary.notes}
            onChange={(e) =>
              persistDietary({ ...dietary, notes: e.target.value })
            }
            placeholder="e.g. prefer low sodium"
          />
        </label>
      </Section>

      <Section title="Household">
        <Card padding="md">
          <p className="text-sm text-ink">
            Active household id:{' '}
            <code className="text-xs text-ink-muted">
              {householdId || DEFAULT_HOUSEHOLD_ID}
            </code>
          </p>
          <p className="mt-2 text-xs text-ink-muted">
            Multi-user household sharing is a Pro feature. Invites and member
            roles sync via Supabase when signed in.
          </p>
          {snapshot.tier === 'free' ? (
            <Link
              to="/paywall"
              className="mt-2 inline-block text-sm font-semibold text-primary"
            >
              Unlock household sharing
            </Link>
          ) : null}
        </Card>
      </Section>

      <Section title="Notifications">
        <label className="flex min-h-tap items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={notifications.dailyShoppingBrief}
            onChange={(e) =>
              persistNotifications({
                ...notifications,
                dailyShoppingBrief: e.target.checked,
              })
            }
          />
          Daily shopping brief
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-semibold text-ink-muted">
              Quiet hours start
            </span>
            <input
              type="number"
              min={0}
              max={23}
              className="rounded-card border border-ink-muted/20 bg-surface px-3 py-2"
              value={notifications.quietHoursStart}
              onChange={(e) =>
                persistNotifications({
                  ...notifications,
                  quietHoursStart: Number(e.target.value),
                })
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-semibold text-ink-muted">
              Quiet hours end
            </span>
            <input
              type="number"
              min={0}
              max={23}
              className="rounded-card border border-ink-muted/20 bg-surface px-3 py-2"
              value={notifications.quietHoursEnd}
              onChange={(e) =>
                persistNotifications({
                  ...notifications,
                  quietHoursEnd: Number(e.target.value),
                })
              }
            />
          </label>
        </div>
        <p className="text-xs text-ink-muted">
          Hours are local 0–23. Default 21→8 (wraps midnight).
        </p>
      </Section>

      <Section title="Units display">
        <div className="flex gap-2">
          {(
            [
              ['us_retail', 'US retail'],
              ['metric', 'Metric'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setUnits(id);
                saveUnitsDisplay(id);
              }}
              className={cn(
                'min-h-tap flex-1 rounded-pill text-sm font-semibold',
                units === id
                  ? 'bg-primary text-white'
                  : 'bg-surface text-ink-muted ring-1 ring-ink-muted/20',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-ink-muted">
          Display preference only — base storage remains metric (g / ml / each).
        </p>
      </Section>

      <Section title="Privacy & data">
        <div className="flex flex-col gap-2">
          <Link
            to="/privacy"
            className="min-h-tap inline-flex items-center rounded-card bg-surface px-4 text-sm font-semibold text-ink shadow-card"
          >
            Privacy policy
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onExport()}
            className="min-h-tap rounded-card bg-surface px-4 text-left text-sm font-semibold text-ink shadow-card disabled:opacity-60"
          >
            Export my data (JSON)
          </button>
          {!deleteConfirm ? (
            <button
              type="button"
              onClick={() => setDeleteConfirm(true)}
              className="min-h-tap rounded-card bg-surface px-4 text-left text-sm font-semibold text-red-700 shadow-card"
            >
              Delete account…
            </button>
          ) : (
            <Card padding="md" className="border border-red-200 bg-red-50/50">
              <p className="text-sm text-ink">
                This permanently deletes your cloud account and household
                membership. Local device data may remain until you clear app
                storage.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onDelete()}
                  className="min-h-tap rounded-pill bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy ? 'Deleting…' : 'Yes, delete my account'}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(false)}
                  className="min-h-tap rounded-pill px-4 text-sm font-medium text-ink-muted"
                >
                  Cancel
                </button>
              </div>
            </Card>
          )}
        </div>
      </Section>

      {status ? (
        <p className="text-sm text-ink-muted" role="status" data-settings-status>
          {status}
        </p>
      ) : null}
    </div>
  );
}
