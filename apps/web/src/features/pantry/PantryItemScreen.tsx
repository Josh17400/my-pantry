import type { PantryTxn } from '@larder/core';
import { formatQuantity } from '@larder/core';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { PantryItemView } from '../../db/types';
import { getDomainRepository, hasActiveRepository } from '../../state';
import { useLocations, usePantry } from '../../state';
import { Card } from '../../ui/Card';
import { PlaceholderThumb } from '../../ui/PlaceholderThumb';
import { StatusBadge } from '../../ui/StatusBadge';
import { AdjustSheet } from './components/AdjustSheet';
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
} from './components/AsyncState';
import { ProvenanceLine } from './components/ProvenanceLine';
import { RecountSheet } from './components/RecountSheet';
import {
  FieldInput,
  FieldLabel,
  FieldSelect,
  PrimaryButton,
  SecondaryButton,
  Sheet,
} from './components/Sheet';
import { UndoToast } from './components/UndoToast';
import { useUndoStack } from './hooks/useUndoStack';
import { locationSelectOptions } from './lib/filter-group';
import {
  formatItemQuantity,
  formatRelativeAge,
} from './lib/provenance-display';
import { formatParQuantity, resolveStockUi } from './lib/stock-display';
import {
  buildAdjustTxn,
  buildMarkUsedUpTxn,
  buildRecountTxn,
  buildWasteTxn,
} from './lib/txn-builders';

type SheetKind = 'adjust' | 'recount' | 'waste' | 'edit' | null;

function reasonLabel(reason: string): string {
  switch (reason) {
    case 'purchase':
      return 'Purchase';
    case 'cook':
      return 'Cook';
    case 'quick':
      return 'Quick use';
    case 'waste':
      return 'Waste';
    case 'adjust_delta':
      return 'Adjustment';
    case 'recount':
      return 'Recount';
    default:
      return reason;
  }
}

function txnDeltaLabel(txn: PantryTxn, dim: PantryItemView['dim']): string {
  if (txn.kind === 'absolute') {
    return `set to ${formatQuantity(txn.targetBase, dim, { locale: 'us' })}`;
  }
  const sign = txn.deltaBase >= 0 ? '+' : '−';
  const abs = formatQuantity(Math.abs(txn.deltaBase), dim, { locale: 'us' });
  return `${sign}${abs}`;
}

export type PantryItemScreenProps = {
  /** Route-injected or props for preview */
  ingredientId?: string;
  formId?: string;
  nowMs?: number;
};

/**
 * Item detail — quantity + provenance, location, par, expiry, history,
 * adjust / recount / waste / mark used up / edit metadata.
 */
export function PantryItemScreen({
  ingredientId: propIngredientId,
  formId: propFormId,
  nowMs,
}: PantryItemScreenProps) {
  const params = useParams<{ ingredientId: string; formId: string }>();
  const ingredientId = propIngredientId ?? params.ingredientId ?? '';
  const formId = propFormId ?? params.formId ?? '';

  const {
    selected,
    loading,
    error,
    getOne,
    appendTxn,
    upsert,
    clearError,
    householdId,
  } = usePantry();
  const { locations, list: listLocations } = useLocations();

  const [history, setHistory] = useState<PantryTxn[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [busy, setBusy] = useState(false);
  const [wasteText, setWasteText] = useState('');
  const [wasteError, setWasteError] = useState<string | null>(null);

  // Edit form state
  const [editLocationId, setEditLocationId] = useState('');
  const [editPar, setEditPar] = useState('');
  const [editThreshold, setEditThreshold] = useState('');
  const [editExpiry, setEditExpiry] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const { undo, offerUndo, performUndo, dismiss } = useUndoStack(appendTxn);

  const loadItem = useCallback(async () => {
    if (!ingredientId || !formId || !hasActiveRepository()) return;
    clearError();
    await getOne(ingredientId, formId);
    await listLocations();
  }, [ingredientId, formId, getOne, listLocations, clearError]);

  const loadHistory = useCallback(async () => {
    if (!ingredientId || !hasActiveRepository()) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const txns = await getDomainRepository().listTxnsForIngredient(
        ingredientId,
        householdId,
      );
      const sorted = [...txns].sort(
        (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
      );
      setHistory(sorted.slice(0, 40));
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : String(err));
    } finally {
      setHistoryLoading(false);
    }
  }, [ingredientId, householdId]);

  useEffect(() => {
    void loadItem();
  }, [loadItem]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory, selected?.qtyBase, selected?.updatedAt]);

  useEffect(() => {
    if (!selected) return;
    setEditLocationId(selected.locationId ?? '');
    setEditPar(String(selected.parLevelBase));
    setEditThreshold(String(Math.round(selected.lowThresholdPct * 100)));
    setEditExpiry(
      selected.expiresAt
        ? selected.expiresAt.slice(0, 10)
        : '',
    );
  }, [selected]);

  const item = selected;

  async function runTxn(
    label: string,
    previousQty: number,
    factory: () => ReturnType<typeof buildAdjustTxn>,
  ) {
    setBusy(true);
    try {
      const txn = factory();
      await appendTxn(txn);
      offerUndo(label, {
        label,
        previousQtyBase: previousQty,
        original: txn,
      });
      setSheet(null);
      await getOne(ingredientId, formId);
      await loadHistory();
    } finally {
      setBusy(false);
    }
  }

  async function handleAdjust(deltaBase: number) {
    if (!item) return;
    await runTxn('Quantity adjusted', item.qtyBase, () =>
      buildAdjustTxn(item, deltaBase, { householdId }),
    );
  }

  async function handleRecount(targetBase: number) {
    if (!item) return;
    await runTxn('Recount saved', item.qtyBase, () =>
      buildRecountTxn(item, targetBase, { householdId }, {
        basisCursor: item.watermarkCursor ?? undefined,
      }),
    );
  }

  async function handleMarkUsedUp() {
    if (!item) return;
    await runTxn('Marked used up', item.qtyBase, () =>
      buildMarkUsedUpTxn(item, { householdId }, {
        basisCursor: item.watermarkCursor ?? undefined,
      }),
    );
  }

  async function handleWaste() {
    if (!item) return;
    const { parseHumanQuantity } = await import('./lib/qty-input');
    const parsed = parseHumanQuantity(wasteText, item.dim);
    if (!parsed.ok) {
      setWasteError(parsed.message);
      return;
    }
    if (parsed.qtyBase <= 0) {
      setWasteError('Enter how much was wasted');
      return;
    }
    setWasteError(null);
    await runTxn('Waste logged', item.qtyBase, () =>
      buildWasteTxn(item, parsed.qtyBase, { householdId }),
    );
    setWasteText('');
  }

  async function handleSaveEdit() {
    if (!item) return;
    const par = Number(editPar);
    const thrPct = Number(editThreshold);
    if (!Number.isFinite(par) || par < 0) {
      setEditError('Par level must be a non-negative number (base units)');
      return;
    }
    if (!Number.isFinite(thrPct) || thrPct <= 0 || thrPct > 100) {
      setEditError('Low threshold must be 1–100%');
      return;
    }
    setEditError(null);
    setBusy(true);
    try {
      await upsert({
        householdId: item.householdId,
        ingredientId: item.ingredientId,
        formId: item.formId,
        locationId: editLocationId || null,
        qtyBase: item.qtyBase,
        dim: item.dim,
        parLevelBase: par,
        lowThresholdPct: thrPct / 100,
        expiresAt: editExpiry
          ? new Date(`${editExpiry}T12:00:00.000Z`).toISOString()
          : null,
        lastVerifiedAt: item.lastVerifiedAt,
        unverifiedCookCount: item.unverifiedCookCount,
        openedAt: item.openedAt,
      });
      setSheet(null);
      await getOne(ingredientId, formId);
    } finally {
      setBusy(false);
    }
  }

  if (!hasActiveRepository()) {
    return (
      <EmptyBlock
        title="Item unavailable"
        body="The data layer is not connected on this surface yet."
        action={
          <Link to="/pantry" className="text-sm font-medium text-primary">
            Back to pantry
          </Link>
        }
      />
    );
  }

  if (loading && !item) {
    return <LoadingBlock label="Loading item…" />;
  }

  if (error && !item) {
    return (
      <div className="p-4">
        <ErrorBlock message={error} onRetry={() => void loadItem()} />
      </div>
    );
  }

  if (!item) {
    return (
      <EmptyBlock
        title="Item not found"
        body="This pantry row is missing — it may have never been stocked."
        action={
          <Link
            to="/pantry"
            className="inline-flex min-h-tap items-center justify-center rounded-pill bg-primary px-4 text-sm font-semibold text-white"
          >
            Back to pantry
          </Link>
        }
      />
    );
  }

  const fields = {
    lastVerifiedAt: item.lastVerifiedAt,
    unverifiedCookCount: item.unverifiedCookCount,
  };
  const qty = formatItemQuantity(item.qtyBase, item.dim, fields, nowMs);
  const stock = resolveStockUi(
    {
      qtyBase: item.qtyBase,
      parLevelBase: item.parLevelBase,
      lowThresholdPct: item.lowThresholdPct,
      expiresAt: item.expiresAt,
      isNegative: item.isNegative,
    },
    nowMs,
  );

  const purchases = history.filter(
    (t) => t.kind === 'relative' && t.reason === 'purchase',
  );

  return (
    <div className="min-h-[100dvh] bg-bg pb-[max(2rem,env(safe-area-inset-bottom))] pt-safe-t">
      <header className="flex items-center gap-2 px-3 py-3">
        <Link
          to="/pantry"
          className="flex min-h-tap min-w-tap items-center justify-center rounded-full text-ink"
          aria-label="Back to pantry"
        >
          ←
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-display text-xl font-semibold text-ink">
          {item.ingredientName}
        </h1>
      </header>

      <div className="space-y-4 px-4">
        <Card padding="lg" className="flex gap-4">
          <PlaceholderThumb name={item.ingredientName} tint="cream" size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-ink-muted">
              {item.formName ?? item.formId}
            </p>
            <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-ink">
              {qty}
            </p>
            <ProvenanceLine fields={fields} nowMs={nowMs} size="md" className="mt-1" />
            <div className="mt-2">
              <StatusBadge status={stock.band} label={stock.label} />
            </div>
            {item.conflict ? (
              <p className="mt-2 text-xs text-critical" role="status">
                Two recounts disagreed — latest kept. Open history to review.
              </p>
            ) : null}
            {item.isNegative ? (
              <p className="mt-2 text-xs text-critical" role="status">
                Stock is negative — still have some? Use Recount to snap to reality.
              </p>
            ) : null}
          </div>
        </Card>

        <Card padding="md">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Location
              </dt>
              <dd className="mt-0.5 font-medium text-ink">
                {item.locationName ?? 'Unassigned'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Par level
              </dt>
              <dd className="mt-0.5 font-medium text-ink">
                {formatParQuantity(item.parLevelBase, item.dim)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Low threshold
              </dt>
              <dd className="mt-0.5 font-medium text-ink">
                {Math.round(item.lowThresholdPct * 100)}%
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Expiry
              </dt>
              <dd className="mt-0.5 font-medium text-ink">
                {item.expiresAt
                  ? new Date(item.expiresAt).toLocaleDateString()
                  : '—'}
              </dd>
            </div>
          </dl>
          <SecondaryButton className="mt-4" onClick={() => setSheet('edit')}>
            Edit details
          </SecondaryButton>
        </Card>

        <section>
          <h2 className="mb-2 font-display text-lg font-semibold text-ink">
            Update stock
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <PrimaryButton onClick={() => setSheet('adjust')} disabled={busy}>
              Adjust
            </PrimaryButton>
            <PrimaryButton onClick={() => setSheet('recount')} disabled={busy}>
              Recount
            </PrimaryButton>
            <SecondaryButton onClick={() => setSheet('waste')} disabled={busy}>
              Waste…
            </SecondaryButton>
            <SecondaryButton
              onClick={() => void handleMarkUsedUp()}
              disabled={busy || item.qtyBase <= 0}
            >
              Mark used up
            </SecondaryButton>
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            <strong className="font-medium text-ink">Adjust</strong> = add/remove
            this much. <strong className="font-medium text-ink">Recount</strong> =
            there is exactly this much.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-semibold text-ink">
            Purchase history
          </h2>
          {historyLoading && history.length === 0 ? (
            <LoadingBlock label="Loading history…" className="min-h-[4rem] py-4" />
          ) : historyError ? (
            <ErrorBlock
              message={historyError}
              onRetry={() => void loadHistory()}
            />
          ) : purchases.length === 0 && history.length === 0 ? (
            <p className="text-sm text-ink-muted">No ledger events yet.</p>
          ) : (
            <ul className="space-y-2">
              {(purchases.length > 0 ? purchases : history).slice(0, 12).map((txn) => (
                <li key={txn.id}>
                  <Card padding="sm" className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {reasonLabel(txn.reason)}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {formatRelativeAge(txn.occurredAt, nowMs)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm tabular-nums text-ink">
                      {txnDeltaLabel(txn, item.dim)}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
          {purchases.length === 0 && history.length > 0 ? (
            <p className="mt-2 text-xs text-ink-muted">
              Showing recent ledger activity (no purchases recorded yet).
            </p>
          ) : null}
        </section>
      </div>

      <AdjustSheet
        open={sheet === 'adjust'}
        itemName={item.ingredientName}
        dim={item.dim}
        onClose={() => setSheet(null)}
        onConfirm={handleAdjust}
        busy={busy}
      />

      <RecountSheet
        open={sheet === 'recount'}
        itemName={item.ingredientName}
        dim={item.dim}
        currentQtyBase={item.qtyBase}
        provenance={fields}
        onClose={() => setSheet(null)}
        onConfirm={handleRecount}
        busy={busy}
      />

      <Sheet
        open={sheet === 'waste'}
        title="Log waste"
        subtitle={`How much of ${item.ingredientName} was thrown out?`}
        onClose={() => setSheet(null)}
        data-testid="app-sheet"
        footer={
          <>
            <PrimaryButton onClick={() => void handleWaste()} disabled={busy}>
              {busy ? 'Saving…' : 'Log waste'}
            </PrimaryButton>
            <SecondaryButton onClick={() => setSheet(null)}>Cancel</SecondaryButton>
          </>
        }
      >
        <FieldLabel htmlFor="waste-qty">Amount wasted</FieldLabel>
        <FieldInput
          id="waste-qty"
          value={wasteText}
          onChange={(e) => setWasteText(e.target.value)}
          placeholder="e.g. 100 g"
        />
        {wasteError ? (
          <p className="mt-2 text-sm text-critical">{wasteError}</p>
        ) : null}
      </Sheet>

      <Sheet
        open={sheet === 'edit'}
        title="Edit details"
        onClose={() => setSheet(null)}
        data-testid="app-sheet"
        footer={
          <>
            <PrimaryButton onClick={() => void handleSaveEdit()} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </PrimaryButton>
            <SecondaryButton onClick={() => setSheet(null)}>Cancel</SecondaryButton>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <FieldLabel htmlFor="edit-loc">Location</FieldLabel>
            <FieldSelect
              id="edit-loc"
              value={editLocationId}
              onChange={(e) => setEditLocationId(e.target.value)}
            >
              <option value="">Unassigned</option>
              {locationSelectOptions(locations).map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </FieldSelect>
          </div>
          <div>
            <FieldLabel htmlFor="edit-par">
              Par level (base units:{' '}
              {item.dim === 'mass' ? 'g' : item.dim === 'volume' ? 'ml' : 'each'})
            </FieldLabel>
            <FieldInput
              id="edit-par"
              inputMode="decimal"
              value={editPar}
              onChange={(e) => setEditPar(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="edit-thr">Low threshold (%)</FieldLabel>
            <FieldInput
              id="edit-thr"
              inputMode="numeric"
              value={editThreshold}
              onChange={(e) => setEditThreshold(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="edit-exp">Expiry date</FieldLabel>
            <FieldInput
              id="edit-exp"
              type="date"
              value={editExpiry}
              onChange={(e) => setEditExpiry(e.target.value)}
            />
          </div>
          {editError ? (
            <p className="text-sm text-critical">{editError}</p>
          ) : null}
        </div>
      </Sheet>

      {undo ? (
        <UndoToast
          message={undo.message}
          onUndo={() => void performUndo()}
          onDismiss={dismiss}
        />
      ) : null}
    </div>
  );
}
