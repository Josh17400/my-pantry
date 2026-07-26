/**
 * Home / Overview screen — matches mockups 01–03.
 *
 * Layout (top → bottom):
 * 1. Header — greeting (+ settings). Wordmark is the boot splash only.
 * 2. Segmented control — filters the home body (or navigates for Recipes)
 * 3. At a Glance — location cards → pantry filtered by location
 * 4. Cook-now banner → cookable recipes list
 * 5. Recipe Inspiration → recipe detail / list
 * 6. Fridge Highlights / Pantry Staples → item detail / filtered pantry
 * 7. AdSlot — in-feed, free tier only
 */

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { DEFAULT_LOCATION_IDS } from '../../db/constants';
import type { SegmentOption } from '../../ui';
import {
  AdSlot,
  Card,
  cn,
  ItemTile,
  LeafIcon,
  PlaceholderThumb,
  Rail,
  SegmentedControl,
  StatusBadge,
} from '../../ui';
import { formatUseUpLine } from './cookable';
import { fullGreeting } from './greeting';
import {
  type GlanceCard,
  type HighlightItem,
  useHomeScreenData,
} from './useHomeScreenData';

type HomeSegment = 'overview' | 'recipes' | 'fridge' | 'pantry';

const OVERVIEW_SEGMENTS: SegmentOption<HomeSegment>[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'recipes', label: 'Recipes' },
  { value: 'fridge', label: 'Fridge' },
  { value: 'pantry', label: 'Pantry' },
];

function SettingsButton() {
  return (
    <Link
      to="/settings"
      aria-label="Settings"
      data-testid="home-settings"
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
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4.5 20a7.5 7.5 0 0 1 15 0" strokeLinecap="round" />
      </svg>
    </Link>
  );
}

function HomeHeader({ greeting }: { greeting: string }) {
  return (
    <header className="flex items-start justify-between gap-3 pt-safe">
      <div className="min-w-0 flex-1">
        <h1
          className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]"
          data-testid="home-greeting"
        >
          {greeting}
          <LeafIcon className="ml-1.5 inline-block h-5 w-5 align-[-0.15em] text-primary" />
        </h1>
        <p className="mt-1 max-w-sm text-sm text-ink-muted">
          Everything you have. Everything you love to make.
        </p>
      </div>
      <SettingsButton />
    </header>
  );
}

function GlanceCardView({
  card,
  onClick,
}: {
  card: GlanceCard;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`glance-${card.id}`}
      className="min-w-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Card
        tint={card.tint}
        padding="sm"
        className="flex min-h-[5.5rem] w-full flex-col justify-between transition-transform active:scale-[0.99] motion-reduce:active:scale-100"
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
    </button>
  );
}

function AtAGlance({
  cards,
  onCardClick,
}: {
  cards: GlanceCard[];
  onCardClick: (card: GlanceCard) => void;
}) {
  return (
    <section data-testid="at-a-glance">
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
          <GlanceCardView
            key={card.id}
            card={card}
            onClick={() => onCardClick(card)}
          />
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
      data-testid="cook-now-cta"
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
  onClick,
}: {
  title: string;
  useUp: string | null;
  imageUrl?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="recipe-inspiration-card"
      className="relative h-[9.5rem] w-[16.5rem] shrink-0 overflow-hidden rounded-card text-left shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
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
    </button>
  );
}

function ItemRail({
  title,
  items,
  onSeeAll,
  onItemClick,
  testId,
}: {
  title: string;
  items: HighlightItem[];
  onSeeAll?: () => void;
  onItemClick?: (item: HighlightItem) => void;
  testId?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div data-testid={testId}>
      <Rail title={title} onSeeAll={onSeeAll}>
        {items.map((item) => (
          <div key={item.key} title={item.display.provenanceLabel}>
            <ItemTile
              name={item.name}
              quantity={item.display.quantity}
              status={item.display.status}
              statusLabel={item.display.statusLabel}
              tint={item.tint}
              onClick={onItemClick ? () => onItemClick(item) : undefined}
            />
          </div>
        ))}
      </Rail>
    </div>
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

function HomeEmptyState({ onAddFirst }: { onAddFirst: () => void }) {
  return (
    <div className="flex flex-col gap-6" data-testid="home-empty">
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
          onClick={onAddFirst}
          data-testid="home-add-first"
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
              {
                name: 'Fridge',
                tint: 'sky' as const,
                location: DEFAULT_LOCATION_IDS.fridge,
              },
              {
                name: 'Pantry',
                tint: 'tan' as const,
                location: DEFAULT_LOCATION_IDS.pantry,
              },
              {
                name: 'Around the House',
                tint: 'cream' as const,
                location: DEFAULT_LOCATION_IDS.aroundHouse,
              },
              {
                name: 'Favorites',
                tint: 'sage' as const,
                location: 'favorites',
              },
            ] as const
          ).map((loc) => (
            <Link
              key={loc.name}
              to={
                loc.location === 'favorites'
                  ? '/pantry?filter=favorites'
                  : `/pantry?location=${encodeURIComponent(loc.location)}`
              }
              className="min-w-0"
            >
              <Card tint={loc.tint} padding="sm" className="min-h-[5rem]">
                <div className="text-sm font-semibold text-ink">{loc.name}</div>
                <div className="mt-1 text-xs text-ink-muted">Ready when you are</div>
              </Card>
            </Link>
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
  const navigate = useNavigate();
  const [segment, setSegment] = useState<HomeSegment>('overview');

  const greeting = useMemo(
    () => fullGreeting(data.greetingName),
    [data.greetingName],
  );

  const openPantryLocation = (locationId: string) => {
    void navigate(`/pantry?location=${encodeURIComponent(locationId)}`);
  };

  const openPantryItem = (ingredientId: string, formId: string) => {
    void navigate(
      `/pantry/${encodeURIComponent(ingredientId)}/${encodeURIComponent(formId)}`,
    );
  };

  const onGlanceClick = (card: GlanceCard) => {
    if (card.kind === 'favorites') {
      void navigate('/pantry?filter=favorites');
      return;
    }
    openPantryLocation(card.id);
  };

  const onSegmentChange = (next: HomeSegment) => {
    setSegment(next);
    // Recipes segment is a real destination; other segments filter the home body.
    if (next === 'recipes') {
      void navigate('/recipes');
    }
  };

  const showOverview = segment === 'overview';
  const showRecipes = segment === 'overview' || segment === 'recipes';
  const showFridge = segment === 'overview' || segment === 'fridge';
  const showPantry = segment === 'overview' || segment === 'pantry';

  return (
    <div
      className="mx-auto flex w-full min-w-0 max-w-lg flex-col gap-6 overflow-x-hidden px-4 pb-8"
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
        <HomeEmptyState
          onAddFirst={() => {
            void navigate('/pantry');
          }}
        />
      ) : null}

      {data.phase === 'ready' ? (
        <>
          <SegmentedControl
            options={OVERVIEW_SEGMENTS}
            value={segment}
            onChange={onSegmentChange}
            aria-label="Home sections"
            className="min-w-0 w-full max-w-full"
          />

          {showOverview ? (
            <AtAGlance cards={data.glance} onCardClick={onGlanceClick} />
          ) : null}

          {showRecipes ? (
            <CookNowBanner
              count={data.cookNow.fullyCookableCount}
              onClick={() => {
                void navigate('/recipes?filter=can-make');
              }}
            />
          ) : null}

          {showRecipes && data.cookNow.inspiration.length > 0 ? (
            <div data-testid="recipe-inspiration">
              <Rail
                title="Recipe Inspiration"
                onSeeAll={() => {
                  void navigate('/recipes');
                }}
              >
                {data.cookNow.inspiration.map((match) => (
                  <RecipeCard
                    key={match.recipe.id}
                    title={match.recipe.title}
                    useUp={formatUseUpLine(match)}
                    imageUrl={match.recipe.imageUrl}
                    onClick={() => {
                      void navigate(`/recipes/${encodeURIComponent(match.recipe.id)}`);
                    }}
                  />
                ))}
              </Rail>
            </div>
          ) : null}

          {showFridge ? (
            <ItemRail
              title="Fridge Highlights"
              testId="fridge-highlights"
              items={data.fridgeHighlights}
              onSeeAll={() => openPantryLocation(DEFAULT_LOCATION_IDS.fridge)}
              onItemClick={(item) => openPantryItem(item.ingredientId, item.formId)}
            />
          ) : null}

          {showPantry ? (
            <ItemRail
              title="Pantry Staples"
              testId="pantry-staples"
              items={data.pantryStaples}
              onSeeAll={() => openPantryLocation(DEFAULT_LOCATION_IDS.pantry)}
              onItemClick={(item) => openPantryItem(item.ingredientId, item.formId)}
            />
          ) : null}

          {/* In-feed ad — well clear of tab bar (AdMob policy). Free tier only. */}
          {showOverview ? <AdSlot className="mt-1" /> : null}

          {data.isDemo ? (
            <p className="px-1 text-center text-[0.65rem] text-ink-muted/80">
              Demo pantry · design review fixtures (dev only)
            </p>
          ) : null}

          <p className="px-1 text-center text-[0.65rem] text-ink-muted">
            Quantities marked ⚠ or ~ are estimates — open an item to re-verify
          </p>
        </>
      ) : null}
    </div>
  );
}
