/**
 * Community browse — search, fork, report, author profile.
 * Mobile-first; pure logic in sibling modules.
 */

import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { DEFAULT_HOUSEHOLD_ID } from '../../db/constants';
import { newId } from '../../db/id';
import type { RecipeDetail } from '../../db/types';
import {
  hasActiveRepository,
  useRecipes,
  useRecipesStore,
} from '../../state';
import { Card } from '../../ui/Card';
import { cn } from '../../ui/cn';
import { authorDisplayLabel, buildAuthorProfile } from './author-profile';
import { buildForkedRecipe } from './fork';
import {
  canReport,
  createMemoryReportStore,
  createReport,
  REPORT_REASONS,
  type ReportStore,
} from './report';
import {
  filterPublicRecipes,
  recipeDetailToCard,
  searchCommunityRecipes,
} from './search';
import type { CommunityRecipeCard, ReportReason } from './types';

// Module-level report store for the session (tests inject via prop).
const defaultReportStore = createMemoryReportStore();

type CommunityScreenProps = {
  /** Injected public recipes (demo / tests). When empty, uses store public filter. */
  readonly seedPublic?: readonly RecipeDetail[];
  readonly reportStore?: ReportStore;
  readonly householdId?: string;
  readonly userId?: string | null;
};

export function CommunityScreen({
  seedPublic = [],
  reportStore = defaultReportStore,
  householdId = DEFAULT_HOUSEHOLD_ID,
  userId = 'local-user',
}: CommunityScreenProps) {
  const { loading, error } = useRecipes();
  const [query, setQuery] = useState('');
  const [ingredient, setIngredient] = useState('');
  const [tag, setTag] = useState('');
  const [maxMin, setMaxMin] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>('spam');
  const [reportDetails, setReportDetails] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [authorId, setAuthorId] = useState<string | null>(null);

  const publicDetails = useMemo(() => {
    // Prefer seed for offline community catalog; merge with any public from store.
    const fromStore = filterPublicRecipes(
      // store current is single; seed is the main community set offline
      [],
    );
    const byId = new Map<string, RecipeDetail>();
    for (const d of seedPublic) byId.set(d.id, d);
    for (const d of fromStore) byId.set(d.id, d);
    return [...byId.values()];
  }, [seedPublic]);

  const cards: CommunityRecipeCard[] = useMemo(
    () => publicDetails.map((d) => recipeDetailToCard(d)),
    [publicDetails],
  );

  const detailsById = useMemo(() => {
    const m = new Map<string, RecipeDetail>();
    for (const d of publicDetails) m.set(d.id, d);
    return m;
  }, [publicDetails]);

  const filtered = useMemo(() => {
    const maxTotalMin = maxMin.trim() ? Number(maxMin) : null;
    return searchCommunityRecipes(
      cards,
      {
        query,
        ingredient: ingredient || undefined,
        tags: tag.trim() ? [tag.trim()] : undefined,
        maxTotalMin:
          maxTotalMin != null && Number.isFinite(maxTotalMin)
            ? maxTotalMin
            : null,
      },
      detailsById,
    );
  }, [cards, query, ingredient, tag, maxMin, detailsById]);

  const selected = selectedId ? detailsById.get(selectedId) : null;

  const authorProfile = useMemo(() => {
    if (!authorId) return null;
    return buildAuthorProfile(authorId, publicDetails);
  }, [authorId, publicDetails]);

  const onFork = useCallback(async () => {
    if (!selected) return;
    if (!hasActiveRepository()) {
      // Offline pure fork preview
      const fork = buildForkedRecipe({
        source: selected,
        newId: newId('recipe'),
        householdId,
        authorId: userId,
      });
      setStatusMsg(`Forked “${fork.title}” (local draft — save when online).`);
      return;
    }
    setBusy(true);
    setStatusMsg(null);
    try {
      const fork = buildForkedRecipe({
        source: selected,
        newId: newId('recipe'),
        householdId,
        authorId: userId,
      });
      const created = await useRecipesStore.getState().create(fork);
      if (created) {
        setStatusMsg(`Saved fork “${created.title}” to your book.`);
      } else {
        setStatusMsg('Could not save fork.');
      }
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [selected, householdId, userId]);

  const onReport = useCallback(() => {
    if (!selected || !userId) return;
    const gate = canReport(reportStore.list(), selected.id, userId);
    if (!gate.ok) {
      setStatusMsg(gate.message);
      return;
    }
    const report = createReport({
      recipeId: selected.id,
      reporterId: userId,
      reason: reportReason,
      details: reportDetails,
    });
    reportStore.add(report);
    setReportOpen(false);
    setReportDetails('');
    setStatusMsg('Report submitted. Thank you — moderators will review.');
  }, [selected, userId, reportReason, reportDetails, reportStore]);

  return (
    <div className="px-4 pb-8 pt-5">
      <header className="mb-5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h1 className="font-display text-2xl font-semibold text-ink">
            Community
          </h1>
          <Link
            to="/import"
            className="text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            Import URL
          </Link>
        </div>
        <p className="text-sm text-ink-muted">
          Browse public recipes · fork into your book · report problems
        </p>
      </header>

      {error ? (
        <p className="mb-3 rounded-xl bg-critical/10 px-3 py-2 text-sm text-critical">
          {error}
        </p>
      ) : null}
      {statusMsg ? (
        <p
          className="mb-3 rounded-xl bg-fresh/10 px-3 py-2 text-sm text-fresh"
          role="status"
          data-testid="community-status"
        >
          {statusMsg}
        </p>
      ) : null}

      <div className="mb-4 space-y-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, tag, ingredient…"
          className={inputClass}
          aria-label="Search community recipes"
          data-testid="community-search"
        />
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={ingredient}
            onChange={(e) => setIngredient(e.target.value)}
            placeholder="Ingredient"
            className={cn(inputClass, 'min-w-0 flex-1')}
            aria-label="Filter by ingredient"
          />
          <input
            type="text"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="Tag"
            className={cn(inputClass, 'w-28')}
            aria-label="Filter by tag"
          />
          <input
            type="number"
            inputMode="numeric"
            value={maxMin}
            onChange={(e) => setMaxMin(e.target.value)}
            placeholder="Max min"
            className={cn(inputClass, 'w-24')}
            aria-label="Max total minutes"
            min={0}
          />
        </div>
      </div>

      {authorProfile ? (
        <Card className="mb-4" padding="md" data-testid="author-profile">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">
                {authorProfile.displayName}
              </h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                {authorProfile.publicRecipeCount} public recipe
                {authorProfile.publicRecipeCount === 1 ? '' : 's'}
                {authorProfile.memberSince
                  ? ` · since ${authorProfile.memberSince.slice(0, 10)}`
                  : ''}
              </p>
            </div>
            <button
              type="button"
              className="text-sm text-ink-muted"
              onClick={() => setAuthorId(null)}
            >
              Close
            </button>
          </div>
        </Card>
      ) : null}

      {loading && cards.length === 0 ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : null}

      {filtered.length === 0 ? (
        <Card padding="md">
          <p className="text-sm text-ink-muted">
            No public recipes match. Try clearing filters, or{' '}
            <Link to="/import" className="font-medium text-primary">
              import a URL
            </Link>{' '}
            into your own book.
          </p>
        </Card>
      ) : (
        <ul className="space-y-3" data-testid="community-list">
          {filtered.map((card) => (
            <li key={card.id}>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(card.id);
                  setReportOpen(false);
                }}
                className={cn(
                  'w-full rounded-card border border-black/[0.06] bg-surface p-3 text-left shadow-card',
                  'min-h-tap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  selectedId === card.id && 'ring-2 ring-primary/40',
                )}
              >
                <div className="font-display text-base font-semibold text-ink">
                  {card.title}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-muted">
                  {card.totalMin != null ? <span>{card.totalMin} min</span> : null}
                  <span>{card.servings} servings</span>
                  {card.hasUnknownAllergens ? (
                    <span className="text-low">Unknown allergens</span>
                  ) : null}
                </div>
                {card.tags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {card.tags.slice(0, 4).map((t) => (
                      <span
                        key={t}
                        className="rounded-pill bg-black/[0.04] px-2 py-0.5 text-[10px] text-ink-muted"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) : null}
                <button
                  type="button"
                  className="mt-2 text-xs font-medium text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (card.authorId) setAuthorId(card.authorId);
                  }}
                >
                  {authorDisplayLabel(card.authorId, card.authorDisplayName)}
                </button>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected ? (
        <Card className="mt-5" padding="md" data-testid="community-detail">
          <h2 className="font-display text-xl font-semibold text-ink">
            {selected.title}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {selected.ingredients.length} ingredients · {selected.steps.length}{' '}
            steps
          </p>
          {selected.ingredients.some((l) => l.unknownAllergens) ? (
            <p className="mt-2 text-xs text-low">
              Some lines have unknown allergens — treat as unsafe until resolved.
            </p>
          ) : null}
          <ul className="mt-3 space-y-1 text-sm text-ink">
            {selected.ingredients.slice(0, 8).map((line) => (
              <li key={line.id ?? line.rawText}>· {line.rawText}</li>
            ))}
            {selected.ingredients.length > 8 ? (
              <li className="text-ink-muted">
                +{selected.ingredients.length - 8} more
              </li>
            ) : null}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onFork()}
              className={primaryBtn}
              data-testid="fork-btn"
            >
              Fork to my book
            </button>
            <button
              type="button"
              onClick={() => setReportOpen((v) => !v)}
              className={secondaryBtn}
              data-testid="report-btn"
            >
              Report
            </button>
          </div>

          {reportOpen ? (
            <div className="mt-4 border-t border-black/[0.06] pt-3" data-testid="report-form">
              <label className="block text-xs font-medium text-ink-muted">
                Reason
                <select
                  value={reportReason}
                  onChange={(e) =>
                    setReportReason(e.target.value as ReportReason)
                  }
                  className={cn(inputClass, 'mt-1')}
                >
                  {REPORT_REASONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-2 block text-xs font-medium text-ink-muted">
                Details (optional)
                <textarea
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  rows={3}
                  className={cn(inputClass, 'mt-1 resize-y')}
                />
              </label>
              <button
                type="button"
                onClick={onReport}
                className={cn(primaryBtn, 'mt-3')}
                data-testid="submit-report"
              >
                Submit report
              </button>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

const inputClass = cn(
  'min-h-tap w-full rounded-xl border border-black/[0.08] bg-surface-raised px-3 text-sm text-ink',
  'placeholder:text-ink-muted',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
);

const primaryBtn = cn(
  'inline-flex min-h-tap items-center justify-center rounded-pill bg-primary px-4 text-sm font-semibold text-white',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
  'disabled:opacity-50',
);

const secondaryBtn = cn(
  'inline-flex min-h-tap items-center justify-center rounded-pill border border-black/[0.1] bg-surface px-4 text-sm font-medium text-ink',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
);
