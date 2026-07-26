/**
 * Home / Overview screen — matches mockups 01–03.
 *
 * Layout (top → bottom):
 * 1. Header — Wordmark + greeting + search
 * 2. At a Glance — location cards
 * 3. Cook-now banner — findCookableRecipes count
 * 4. Recipe Inspiration — use-up prioritised rail
 * 5. Fridge Highlights / Pantry Staples — ItemTiles with provenance
 * 6. AdSlot — in-feed, free tier only
 */

import { useMemo, useState } from 'react';

import {
  AdSlot,
  Card,
  ItemTile,
  LeafIcon,
  PlaceholderThumb,
  Rail,
  SegmentedControl,
  StatusBadge,
  Wordmark,
  cn,
} from '../../ui';
import type { SegmentOption } from '../../ui';

import { formatUseUpLine } from './cookable';
import { fullGreeting } from './greeting';
import { useHomeScreenData, type GlanceCard, type HighlightItem } from './useHomeScreenData';

const OVERVIEW_SEGMENTS: SegmentOption<'overview' | 'recipes' | 'fridge' | 'pantry'>[] =
  [
    { value: 'overview', label: 'Overview' },
    { value: 'recipes', label: 'Recipes' },
    { value: 'fridge', label: 'Fridge' },
    { value: 'pantry', label: 'Pantry' },
  ];

function SearchButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Search"
      className="flex h-11 w-11 min-h-tap min-w-tap shrink-0 items-center justify-center rounded-full bg-surface shadow-card transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 text-ink"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        aria-hidden
      >
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4 4" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function HomeHeader({ greeting }: { greeting: string }) {
  return (
    <header className="flex items-start justify-between gap-3 pt-safe">
      <div className="min-w-0 flex-1">
        <Wordmark size="sm" showTagline tagline="Everything in its place." />
        <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
          {greeting}
          <LeafIcon className="ml-1.5 inline-block h-5 w-5 align-[-0.15em] text-primary" />
        </h1>
        <p className="mt-1 max-w-sm text-sm text-ink-muted">
          Everything you have. Everything you love to make.
        </p>
      </div>
      <SearchButton />
    </header>
  );
}

function GlanceCardView({ card }: { card: GlanceCard }) {
  return (
    <Card
      tint={card.tint}
      padding="sm"
      className="flex min-h-[5.5rem] flex-col justify-between"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">
            {card.name}
          </div>
          <div className="mt-0.5 text-xs text-ink-muted">
            {card.count === 0
              ? 'No items'
              : `${card.count} item${card.count === 1 ? '' : 's'}`}
          </div>
        </div>
        {card.kind === 'favorites' ? (
          <span className="text-primary" aria-hidden>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M12 21s-6.5-4.35-9.3-8.2C.8 10.2 1.2 6.8 4 5.2c2.1-1.2 4.4-.5 5.7 1.1L12 8.2l2.3-1.9c1.3-1.6 3.6-2.3 5.7-1.1 2.8 1.6 3.2 5 1.3 7.6C18.5 16.65 12 21 12 21z" />
            </svg>
          </span>
        ) : (
          <LeafIcon className="h-5 w-5 shrink-0 text-primary/40" />
        )}
      </div>
      <div className="mt-2">
        <StatusBadge status={card.status} label={card.statusWord} showDot />
      </div>
    </Card>
  );
}

function AtAGlance({ cards }: { cards: GlanceCard[] }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          At a Glance
        </h2>
        <span className="text-sm font-medium text-ink-muted">
          {cards.filter((c) => c.kind === 'location').length} locations
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {cards.map((card) => (
          <GlanceCardView key={card.id} card={card} />
        ))}
      </div>
    </section>
  );
}

function CookNowBanner({
  count,
  onClick,
}: {
  count: number;
  onClick?: () => void;
}) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full min-h-tap items-center gap-3 rounded-card bg-primary px-4 py-3.5 text-left text-white shadow-card',
        'transition-transform active:scale-[0.99]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'motion-reduce:transition-none motion-reduce:active:scale-100',
      )}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15"
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <path
            d="M9 18c0 1.5 1.5 3 3 3s3-1.5 3-3M12 2v1M8 4.5 7 3.5M16 4.5l1-1"
            strokeLinecap="round"
          />
          <path
            d="M8 10a4 4 0 0 1 8 0c0 2-1.5 3-2.5 4H10.5C9.5 13 8 12 8 10Z"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">
          Make something amazing
        </span>
        <span className="block text-xs text-white/85">
          You have everything for {count} recipe{count === 1 ? '' : 's'}
        </span>
      </span>
      <span className="shrink-0 text-white/90" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}

function RecipeCard({
  title,
  useUp,
  imageUrl,
}: {
  title: string;
  useUp: string | null;
  imageUrl?: string;
}) {
  return (
    <article className="relative h-[9.5rem] w-[16.5rem] shrink-0 overflow-hidden rounded-card shadow-card">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/90 via-primary to-primary-soft">
          <div className="absolute inset-0 flex items-center justify-center opacity-20">
            <PlaceholderThumb name={title} tint="cream" size="lg" />
          </div>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
      <div className="relative flex h-full flex-col justify-end p-3.5">
        <h3 className="font-display text-lg font-semibold leading-tight text-white">
          {title}
        </h3>
        {useUp ? (
          <p className="mt-1 text-xs font-medium text-white/90">{useUp}</p>
        ) : (
          <p className="mt-1 text-xs text-white/75">Ready to cook</p>
        )}
      </div>
      <span
        className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-primary shadow-sm"
        aria-hidden
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.25">
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </article>
  );
}

function ItemRail({
  title,
  items,
}: {
  title: string;
  items: HighlightItem[];
}) {
  if (items.length === 0) return null;
  return (
    <Rail title={title} onSeeAll={() => undefined}>
      {items.map((item) => (
        <div key={item.key} title={item.display.provenanceLabel}>
          <ItemTile
            name={item.name}
            quantity={item.display.quantity}
            status={item.display.status}
            statusLabel={item.display.statusLabel}
            tint={item.tint}
          />
        </div>
      ))}
    </Rail>
  );
}

function HomeLoading() {
  return (
    <div
      className="flex flex-col gap-4 py-8"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="h-8 w-48 animate-pulse rounded-lg bg-surface" />
      <div className="h-4 w-64 animate-pulse rounded bg-surface" />
      <div className="mt-4 grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-card bg-surface shadow-card"
          />
        ))}
      </div>
      <div className="mt-2 h-16 animate-pulse rounded-card bg-surface" />
      <p className="text-center text-sm text-ink-muted">Loading your pantry…</p>
    </div>
  );
}

function HomeError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card className="mt-6 text-center" padding="lg">
      <p className="font-display text-xl font-semibold text-ink">
        Couldn&apos;t load your kitchen
      </p>
      <p className="mt-2 text-sm text-ink-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex min-h-tap items-center justify-center rounded-pill bg-primary px-5 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Try again
      </button>
    </Card>
  );
}

function HomeEmptyState() {
  return (
    <div className="flex flex-col gap-6">
      <Card tint="sage" padding="lg" className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface-raised shadow-card">
          <LeafIcon className="h-7 w-7 text-primary" />
        </div>
        <h2 className="font-display text-2xl font-semibold text-ink">
          Your pantry is waiting
        </h2>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">
          Add what you have — milk, pasta, that half jar of tahini — and we&apos;ll
          show recipes you can cook tonight.
        </p>
        <button
          type="button"
          className="mt-5 inline-flex min-h-tap items-center justify-center rounded-pill bg-primary px-6 text-sm font-semibold text-white shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Add your first item
        </button>
      </Card>

      <section>
        <h2 className="mb-3 px-1 font-display text-xl font-semibold text-ink">
          At a Glance
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              { name: 'Fridge', tint: 'sky' as const },
              { name: 'Pantry', tint: 'tan' as const },
              { name: 'Around the House', tint: 'cream' as const },
              { name: 'Favorites', tint: 'sage' as const },
            ] as const
          ).map((loc) => (
            <Card key={loc.name} tint={loc.tint} padding="sm" className="min-h-[5rem]">
              <div className="text-sm font-semibold text-ink">{loc.name}</div>
              <div className="mt-1 text-xs text-ink-muted">Ready when you are</div>
            </Card>
          ))}
        </div>
      </section>

      <Card padding="md" className="border border-dashed border-ink-muted/20">
        <p className="text-sm font-medium text-ink">
          Tip: photograph a receipt later — your pantry fills itself.
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          For now, a quick add is enough to unlock cook-now matching.
        </p>
      </Card>
    </div>
  );
}

/**
 * Full home / overview product screen.
 */
export function HomeScreen() {
  const data = useHomeScreenData();
  const [segment, setSegment] = useState<'overview' | 'recipes' | 'fridge' | 'pantry'>(
    'overview',
  );

  const greeting = useMemo(
    () => fullGreeting(data.greetingName),
    [data.greetingName],
  );

  return (
    <div
      className="mx-auto flex w-full max-w-lg flex-col gap-6 pb-8"
      data-home-screen
      data-demo={data.isDemo ? 'true' : 'false'}
      data-phase={data.phase}
    >
      <HomeHeader greeting={greeting} />

      {data.phase === 'loading' ? <HomeLoading /> : null}

      {data.phase === 'error' && data.error ? (
        <HomeError message={data.error} onRetry={data.reload} />
      ) : null}

      {data.phase === 'empty' ? (
        <>
          <SegmentedControl
            options={OVERVIEW_SEGMENTS}
            value={segment}
            onChange={setSegment}
            aria-label="Home sections"
          />
          <HomeEmptyState />
        </>
      ) : null}

      {data.phase === 'ready' ? (
        <>
          <SegmentedControl
            options={OVERVIEW_SEGMENTS}
            value={segment}
            onChange={setSegment}
            aria-label="Home sections"
          />

          <AtAGlance cards={data.glance} />

          <CookNowBanner count={data.cookNow.fullyCookableCount} />

          {data.cookNow.inspiration.length > 0 ? (
            <Rail title="Recipe Inspiration" onSeeAll={() => undefined}>
              {data.cookNow.inspiration.map((match) => (
                <RecipeCard
                  key={match.recipe.id}
                  title={match.recipe.title}
                  useUp={formatUseUpLine(match)}
                  imageUrl={match.recipe.imageUrl}
                />
              ))}
            </Rail>
          ) : null}

          <ItemRail title="Fridge Highlights" items={data.fridgeHighlights} />
          <ItemRail title="Pantry Staples" items={data.pantryStaples} />

          {/* In-feed ad — well clear of tab bar (AdMob policy). Free tier only. */}
          {/* paidTier omitted — AdSlot reads entitlement store (free shows, Pro hides) */}
          <AdSlot className="mt-1" />

          {data.isDemo ? (
            <p className="px-1 text-center text-[0.65rem] text-ink-muted/80">
              Demo pantry (track G fixtures) · web has no local SQLite
            </p>
          ) : null}

          {/* Provenance legend for drifted tiles — trust layer */}
          <p className="px-1 text-center text-[0.65rem] text-ink-muted">
            Quantities marked ⚠ or ~ are estimates — open an item to re-verify
          </p>
        </>
      ) : null}
    </div>
  );
}
