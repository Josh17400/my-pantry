/**
 * Static preview for 390px screenshots — mock pantry list + item detail.
 * No repository required (web companion has no local SQLite).
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import type { PantryItemView } from '../../db/types';
import { PlaceholderThumb } from '../../ui/PlaceholderThumb';
import { StatusBadge } from '../../ui/StatusBadge';
import { StatusText } from '../../ui/StatusText';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Card } from '../../ui/Card';
import { PantryItemRow } from './components/PantryItemRow';
import { ProvenanceLine } from './components/ProvenanceLine';
import { formatItemQuantity } from './lib/provenance-display';
import { resolveStockUi } from './lib/stock-display';
import '../../index.css';

const NOW = Date.parse('2026-07-26T12:00:00.000Z');

function mockItem(
  partial: Partial<PantryItemView> &
    Pick<PantryItemView, 'ingredientId' | 'ingredientName' | 'formId' | 'qtyBase' | 'dim'>,
): PantryItemView {
  return {
    householdId: 'local-household',
    locationId: 'loc-pantry',
    parLevelBase: Math.max(partial.qtyBase * 2, 1),
    lowThresholdPct: 0.25,
    lastVerifiedAt: new Date(NOW - 2 * 86400000).toISOString(),
    unverifiedCookCount: 0,
    openedAt: null,
    expiresAt: null,
    updatedAt: new Date(NOW).toISOString(),
    watermarkCursor: null,
    lastAbsoluteCursor: null,
    isNegative: false,
    conflict: false,
    formName: 'default',
    locationName: 'Pantry',
    ...partial,
  };
}

const listItems: PantryItemView[] = [
  mockItem({
    ingredientId: 'milk',
    formId: 'milk-liquid',
    ingredientName: 'Milk',
    locationId: 'loc-fridge',
    locationName: 'Fridge',
    qtyBase: 500,
    dim: 'volume',
    parLevelBase: 1000,
    expiresAt: new Date(NOW + 2 * 86400000).toISOString(),
    lastVerifiedAt: new Date(NOW - 2 * 86400000).toISOString(),
  }),
  mockItem({
    ingredientId: 'egg',
    formId: 'egg-whole',
    ingredientName: 'Eggs',
    locationId: 'loc-fridge',
    locationName: 'Fridge',
    qtyBase: 6,
    dim: 'count',
    parLevelBase: 12,
    lastVerifiedAt: new Date(NOW - 86400000).toISOString(),
  }),
  mockItem({
    ingredientId: 'flour-ap',
    formId: 'flour-ap-bulk',
    ingredientName: 'All-Purpose Flour',
    qtyBase: 1800,
    dim: 'mass',
    parLevelBase: 2000,
    lastVerifiedAt: new Date(NOW - 5 * 86400000).toISOString(),
    unverifiedCookCount: 3,
  }),
  mockItem({
    ingredientId: 'oil-olive',
    formId: 'oil-olive-liquid',
    ingredientName: 'Olive Oil',
    qtyBase: 120,
    dim: 'volume',
    parLevelBase: 750,
    lastVerifiedAt: null,
    unverifiedCookCount: 0,
  }),
  mockItem({
    ingredientId: 'parmesan',
    formId: 'parmesan-block',
    ingredientName: 'Parmesan',
    locationId: 'loc-fridge',
    locationName: 'Fridge',
    qtyBase: 113,
    dim: 'mass',
    parLevelBase: 200,
    expiresAt: new Date(NOW + 5 * 86400000).toISOString(),
    lastVerifiedAt: new Date(NOW - 2 * 86400000).toISOString(),
  }),
];

const detail = listItems[2]!;

function PreviewList() {
  const fridge = listItems.filter((i) => i.locationName === 'Fridge');
  const pantry = listItems.filter((i) => i.locationName === 'Pantry');

  return (
    <div className="flex min-h-[100dvh] flex-col bg-bg px-4 pb-8 pt-4">
      <h1 className="font-display text-2xl font-semibold text-ink">Pantry</h1>
      <input
        readOnly
        value=""
        placeholder="Search items…"
        className="mb-3 mt-3 min-h-tap w-full rounded-2xl border border-black/[0.06] bg-surface px-3 text-base shadow-card"
      />
      <SegmentedControl
        options={[
          { value: 'all', label: 'All' },
          { value: 'low', label: 'Low' },
          { value: 'out', label: 'Out' },
          { value: 'expiring', label: 'Expiring' },
        ]}
        value="all"
        onChange={() => undefined}
      />
      <div className="mt-4 space-y-4">
        <section>
          <h2 className="mb-2 font-display text-lg font-semibold">Fridge</h2>
          <div className="space-y-2">
            {fridge.map((item) => (
              <PantryItemRow
                key={`${item.ingredientId}:${item.formId}`}
                item={item}
                nowMs={NOW}
                onSelect={() => undefined}
              />
            ))}
          </div>
        </section>
        <section>
          <h2 className="mb-2 font-display text-lg font-semibold">Pantry</h2>
          <div className="space-y-2">
            {pantry.map((item) => (
              <PantryItemRow
                key={`${item.ingredientId}:${item.formId}`}
                item={item}
                nowMs={NOW}
                onSelect={() => undefined}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function PreviewDetail() {
  const fields = {
    lastVerifiedAt: detail.lastVerifiedAt,
    unverifiedCookCount: detail.unverifiedCookCount,
  };
  const qty = formatItemQuantity(detail.qtyBase, detail.dim, fields, NOW);
  const stock = resolveStockUi(
    {
      qtyBase: detail.qtyBase,
      parLevelBase: detail.parLevelBase,
      lowThresholdPct: detail.lowThresholdPct,
      expiresAt: detail.expiresAt,
    },
    NOW,
  );

  return (
    <div className="min-h-[100dvh] bg-bg px-4 pb-8 pt-4">
      <p className="mb-2 text-sm text-ink-muted">← Pantry</p>
      <h1 className="font-display text-xl font-semibold text-ink">
        {detail.ingredientName}
      </h1>
      <Card padding="lg" className="mt-4 flex gap-4">
        <PlaceholderThumb name={detail.ingredientName} tint="tan" size="lg" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-3xl font-semibold tabular-nums">{qty}</p>
          <ProvenanceLine fields={fields} nowMs={NOW} size="md" className="mt-1" />
          <div className="mt-2">
            <StatusBadge status={stock.band} label={stock.label} />
          </div>
        </div>
      </Card>
      <p className="mt-4 text-xs text-ink-muted">
        <strong className="text-ink">Adjust</strong> = add/remove this much.{' '}
        <strong className="text-ink">Recount</strong> = there is exactly this much.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="min-h-tap rounded-pill bg-primary text-sm font-semibold text-white"
        >
          Adjust
        </button>
        <button
          type="button"
          className="min-h-tap rounded-pill bg-primary text-sm font-semibold text-white"
        >
          Recount
        </button>
        <button
          type="button"
          className="min-h-tap rounded-pill bg-surface text-sm font-semibold shadow-card"
        >
          Waste…
        </button>
        <button
          type="button"
          className="min-h-tap rounded-pill bg-surface text-sm font-semibold shadow-card"
        >
          Mark used up
        </button>
      </div>
      <div className="mt-4">
        <StatusText status="low">Getting low</StatusText>
      </div>
    </div>
  );
}

function PreviewApp() {
  return (
    <div className="mx-auto flex max-w-[390px] flex-col gap-6 bg-bg py-4">
      <div
        id="pantry-list-shot"
        className="overflow-hidden rounded-[1.5rem] border border-black/5 shadow-card"
      >
        <PreviewList />
      </div>
      <div
        id="pantry-detail-shot"
        className="overflow-hidden rounded-[1.5rem] border border-black/5 shadow-card"
      >
        <PreviewDetail />
      </div>
    </div>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <BrowserRouter>
        <PreviewApp />
      </BrowserRouter>
    </StrictMode>,
  );
}
