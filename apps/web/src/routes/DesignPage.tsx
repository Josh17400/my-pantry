import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import {
  AdSlot,
  Card,
  Fab,
  FreshnessBar,
  ItemTile,
  LeafIcon,
  PlaceholderThumb,
  Rail,
  SegmentedControl,
  StatusBadge,
  StatusText,
  TabBar,
  Wordmark,
  colors,
  type StatusBand,
  type TabItem,
} from '../ui';

const segments = [
  { value: 'overview' as const, label: 'Overview' },
  { value: 'recipes' as const, label: 'Recipes' },
  { value: 'fridge' as const, label: 'Fridge' },
  { value: 'pantry' as const, label: 'Pantry' },
];

const tabItems: TabItem[] = [
  {
    id: 'home',
    label: 'Home',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 3.2 3.5 10.2V20a1 1 0 0 0 1 1h5v-6h5v6h5a1 1 0 0 0 1-1v-9.8L12 3.2Z" />
      </svg>
    ),
  },
  {
    id: 'recipes',
    label: 'Recipes',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path d="M6 4h9a3 3 0 0 1 3 3v13H8a2 2 0 0 0-2 2V4Z" />
        <path d="M6 4a2 2 0 0 0-2 2v14" />
        <path d="M10 8h6M10 12h6M10 16h3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="M4 10h16M9 5v14" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'me',
    label: 'Me',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <circle cx="12" cy="9" r="3.5" />
        <path d="M5.5 19.5c1.2-3 3.5-4.5 6.5-4.5s5.3 1.5 6.5 4.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-semibold text-ink sm:text-2xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

function SubLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
      {children}
    </p>
  );
}

/**
 * Design system gallery — every component in every state.
 * Review surface for architect / owner; not a product screen.
 */
export function DesignPage() {
  const [segment, setSegment] = useState<(typeof segments)[number]['value']>(
    'overview',
  );
  const [tab, setTab] = useState('home');
  const [fabClicks, setFabClicks] = useState(0);

  return (
    <div className="min-h-screen bg-bg pb-32">
      {/* Gallery chrome — not product chrome */}
      <header className="sticky top-0 z-20 border-b border-black/[0.04] bg-bg/95 px-4 py-3 backdrop-blur-sm pt-safe">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-ink-muted">
              Design system
            </p>
            <p className="truncate text-sm text-ink">/design gallery</p>
          </div>
          <Link
            to="/"
            className="min-h-tap shrink-0 rounded-pill px-3 text-sm font-medium text-primary hover:underline"
          >
            Home
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-lg space-y-10 px-4 py-6">
        {/* Wordmark lockup — narrow width check */}
        <Section title="Wordmark">
          <SubLabel>Default · with tagline · sizes (check at 320px)</SubLabel>
          <Card className="space-y-5">
            <Wordmark showTagline />
            <div className="border-t border-black/[0.04] pt-4">
              <Wordmark size="sm" />
            </div>
            <div className="border-t border-black/[0.04] pt-4">
              <Wordmark size="lg" showTagline tagline="Everything in its place. Everything delicious." />
            </div>
            {/* Explicit 320px lockup box */}
            <div className="border-t border-black/[0.04] pt-4">
              <SubLabel>Forced 320px width</SubLabel>
              <div className="w-[320px] max-w-full rounded-xl border border-dashed border-ink-muted/30 bg-surface-raised p-3">
                <div className="flex items-start justify-between gap-2">
                  <Wordmark size="sm" showTagline />
                  <button
                    type="button"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-ink-muted"
                    aria-label="Notifications"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75">
                      <path d="M6 9a6 6 0 1 1 12 0c0 3.5 1.5 5 1.5 5H4.5S6 12.5 6 9Z" strokeLinejoin="round" />
                      <path d="M10 19a2 2 0 0 0 4 0" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </Card>
        </Section>

        {/* Palette swatches */}
        <Section title="Palette">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {(
              [
                ['bg', colors.bg],
                ['surface', colors.surface],
                ['surface-raised', colors.surfaceRaised],
                ['primary', colors.primary],
                ['primary-soft', colors.primarySoft],
                ['text', colors.text],
                ['fresh', colors.fresh],
                ['low', colors.low],
                ['low-fill', colors.lowFill],
                ['critical', colors.critical],
                ['text-muted', colors.textMuted],
                ['sage', colors.sage],
                ['tan', colors.tan],
                ['sky', colors.sky],
                ['cream', colors.cream],
              ] as const
            ).map(([name, hex]) => (
              <div
                key={name}
                className="overflow-hidden rounded-xl shadow-card"
              >
                <div className="h-12" style={{ backgroundColor: hex }} />
                <div className="bg-surface px-2 py-1.5">
                  <div className="truncate text-[0.65rem] font-semibold text-ink">
                    {name}
                  </div>
                  <div className="font-mono text-[0.6rem] text-ink-muted">
                    {hex}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Typography */}
        <Section title="Typography">
          <Card className="space-y-3">
            <p className="font-display text-3xl font-semibold text-ink">
              At a Glance
            </p>
            <p className="font-display text-2xl font-semibold text-ink">
              Good morning, Alex
            </p>
            <p className="font-display text-xl text-ink">In Your Fridge</p>
            <p className="text-base text-ink">
              Body — Inter. Functional UI stays sans. The serif contrast is the design.
            </p>
            <p className="text-sm text-ink-muted">
              Muted helper copy at arm&apos;s length. 44px minimum tap targets throughout.
            </p>
          </Card>
        </Section>

        {/* Cards */}
        <Section title="Card">
          <div className="grid gap-3">
            <Card>
              <p className="text-sm font-semibold text-ink">Default surface</p>
              <p className="mt-1 text-sm text-ink-muted">
                Soft shadow, ~18px radius, generous padding.
              </p>
            </Card>
            <Card variant="raised">
              <p className="text-sm font-semibold text-ink">Raised</p>
              <p className="mt-1 text-sm text-ink-muted">Sheets / elevated cards.</p>
            </Card>
            <div className="grid grid-cols-2 gap-3">
              <Card tint="sage" padding="sm">
                <p className="text-sm font-semibold">Sage tint</p>
              </Card>
              <Card tint="tan" padding="sm">
                <p className="text-sm font-semibold">Tan tint</p>
              </Card>
              <Card tint="sky" padding="sm">
                <p className="text-sm font-semibold">Sky tint</p>
              </Card>
              <Card tint="cream" padding="sm">
                <p className="text-sm font-semibold">Cream tint</p>
              </Card>
            </div>
          </div>
        </Section>

        {/* Segmented control */}
        <Section title="SegmentedControl">
          <SegmentedControl
            options={segments}
            value={segment}
            onChange={setSegment}
            aria-label="Gallery sections"
          />
          <p className="text-sm text-ink-muted">
            Selected: <span className="font-medium text-ink">{segment}</span>
          </p>
        </Section>

        {/* Placeholder thumbs */}
        <Section title="PlaceholderThumb">
          <SubLabel>Leaf + initial — deliberate, not broken</SubLabel>
          <div className="flex flex-wrap items-end gap-3">
            <PlaceholderThumb name="Spinach" tint="sage" size="sm" />
            <PlaceholderThumb name="Olive Oil" tint="tan" size="md" />
            <PlaceholderThumb name="Parmesan" tint="cream" size="lg" />
            <PlaceholderThumb name="Eggs" tint="sky" size="md" />
            <PlaceholderThumb name="" tint="sage" size="md" />
          </div>
        </Section>

        {/* Status */}
        <Section title="StatusBadge / StatusText">
          <Card className="space-y-4">
            <div>
              <SubLabel>Badges (dot uses fill; text uses AA-safe token)</SubLabel>
              <div className="flex flex-wrap gap-4">
                <StatusBadge status="fresh" />
                <StatusBadge status="low" />
                <StatusBadge status="critical" />
                <StatusBadge status="fresh" label="Well stocked" />
                <StatusBadge status="critical" label="2 days" />
                <StatusBadge status="low" label="Getting low" showDot={false} />
              </div>
            </div>
            <div>
              <SubLabel>StatusText</SubLabel>
              <div className="flex flex-wrap gap-4">
                <StatusText status="fresh">Plenty</StatusText>
                <StatusText status="fresh">3 days left</StatusText>
                <StatusText status="low">Getting low</StatusText>
                <StatusText status="critical">Almost empty</StatusText>
                <StatusText status="critical" size="md">
                  Expires in 2 days
                </StatusText>
              </div>
            </div>
          </Card>
        </Section>

        {/* Freshness bars */}
        <Section title="FreshnessBar">
          <Card className="space-y-4">
            {(
              [
                { status: 'fresh' as StatusBand, value: 0.85, label: '5 days left' },
                { status: 'fresh' as StatusBand, value: 0.55, label: '3 days left' },
                { status: 'low' as StatusBand, value: 0.35, label: '1 week left' },
                { status: 'critical' as StatusBand, value: 0.15, label: '2 days left' },
                { status: 'critical' as StatusBand, value: 0.05, label: 'Almost empty' },
              ] as const
            ).map((row) => (
              <FreshnessBar
                key={row.label + row.status}
                status={row.status}
                value={row.value}
                label={row.label}
              />
            ))}
          </Card>
        </Section>

        {/* Item tiles */}
        <Section title="ItemTile">
          <SubLabel>Card variant (rail)</SubLabel>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
            <ItemTile
              name="Spinach"
              quantity="1 bunch"
              status="critical"
              statusLabel="2 days"
              tint="sage"
            />
            <ItemTile
              name="Penne Pasta"
              quantity="500g"
              status="fresh"
              statusLabel="Plenty"
              tint="tan"
            />
            <ItemTile
              name="Olive Oil"
              quantity="250ml"
              status="low"
              statusLabel="Getting low"
              tint="cream"
            />
            <ItemTile
              name="Very Long Ingredient Name That Truncates"
              quantity="1 jar of something elaborate"
              status="fresh"
              statusLabel="Well stocked"
              tint="sky"
            />
          </div>

          <SubLabel>Row variant · bar + badge</SubLabel>
          <div className="space-y-2">
            <ItemTile
              variant="row"
              name="Spinach"
              quantity="1 bunch"
              status="critical"
              statusLabel="3 days left"
              freshness={0.25}
              showBar
              tint="sage"
            />
            <ItemTile
              variant="row"
              name="Cherry Tomatoes"
              quantity="1 pint"
              status="fresh"
              statusLabel="5 days left"
              freshness={0.7}
              showBar
              tint="cream"
            />
            <ItemTile
              variant="row"
              name="Olive Oil"
              quantity="250ml"
              status="low"
              statusLabel="Getting low"
              tint="tan"
            />
            <ItemTile
              variant="row"
              name="Empty-state-ish short"
              tint="sky"
            />
          </div>
        </Section>

        {/* Rail */}
        <Section title="Rail">
          <Rail title="In Your Fridge" onSeeAll={() => undefined}>
            <ItemTile name="Eggs" quantity="6 left" status="fresh" statusLabel="1 week" tint="cream" />
            <ItemTile name="Basil" quantity="1 bunch" status="critical" statusLabel="2 days" tint="sage" />
            <ItemTile name="Yogurt" quantity="1 tub" status="low" statusLabel="Getting low" tint="sky" />
          </Rail>
          <div className="mt-6">
            <Rail title="Empty rail" onSeeAll={() => undefined}>
              <Card className="min-w-[12rem] text-sm text-ink-muted">
                No items yet — placeholder child.
              </Card>
            </Rail>
          </div>
        </Section>

        {/* Ad slot */}
        <Section title="AdSlot">
          <SubLabel>In-feed (free tier) · not near tab bar</SubLabel>
          <AdSlot />
          <SubLabel>Paid tier — renders nothing</SubLabel>
          <div className="rounded-xl border border-dashed border-ink-muted/20 p-3 text-center text-xs text-ink-muted">
            <AdSlot paidTier />
            (empty when paid)
          </div>
        </Section>

        {/* FAB standalone */}
        <Section title="Fab">
          <div className="flex items-center gap-4">
            <Fab onClick={() => setFabClicks((n) => n + 1)} />
            <Fab disabled />
            <p className="text-sm text-ink-muted">
              Clicks: {fabClicks}
            </p>
          </div>
        </Section>

        {/* Leaf */}
        <Section title="LeafIcon">
          <div className="flex items-center gap-4 text-primary">
            <LeafIcon className="h-6 w-6" />
            <LeafIcon className="h-10 w-10" />
            <LeafIcon className="h-8 w-8 text-fresh" title="Fresh mark" />
          </div>
        </Section>

        {/* Primary CTA sample */}
        <Section title="Primary CTA (sample)">
          <button
            type="button"
            className="flex w-full min-h-tap items-center justify-between gap-3 rounded-card bg-primary px-4 py-3.5 text-left text-white shadow-card"
          >
            <div className="min-w-0">
              <div className="font-semibold">Make something amazing</div>
              <div className="text-sm text-white/85">
                You have everything for 6 recipes
              </div>
            </div>
            <span aria-hidden className="text-xl">
              →
            </span>
          </button>
        </Section>

        {/* Color token note */}
        <Section title="Token split: low vs low-fill">
          <Card className="space-y-2 text-sm">
            <p>
              <span className="font-medium text-low">low #8F5410</span>
              {' — '}text only (AA on bg)
            </p>
            <p className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-8 rounded-full"
                style={{ backgroundColor: colors.lowFill }}
              />
              <span className="text-ink-muted">
                low-fill #C0741F — bars / dots / icons only (fails as text)
              </span>
            </p>
          </Card>
        </Section>
      </div>

      {/* Tab bar + FAB docked at bottom for review */}
      <div className="fixed bottom-0 left-0 right-0 z-30 mx-auto max-w-lg">
        <TabBar
          tabs={tabItems}
          activeId={tab}
          onChange={setTab}
          onFabClick={() => setFabClicks((n) => n + 1)}
        />
      </div>
    </div>
  );
}
