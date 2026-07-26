/**
 * URL / paste recipe import — JSON-LD first, manual fallback.
 * Review matches + locale before save. Never auto-publishes.
 */

import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { DEFAULT_HOUSEHOLD_ID } from '../../db/constants';
import { newId } from '../../db/id';
import { hasActiveRepository, useRecipesStore } from '../../state';
import { Card } from '../../ui/Card';
import { cn } from '../../ui/cn';
import { buildCommunityMatchCatalog } from '../community/match-catalog';
import { COPYRIGHT_IMPORT_COPY } from './copyright';
import {
  extractedFromManualPaste,
  extractRecipeFromHtml,
} from './extract';
import {
  localeAmbiguityMessage,
  localeChoiceNote,
} from './locale';
import {
  buildImportReview,
  canSaveImport,
  matchSummary,
  reviewToRecipeWrite,
  setLocaleChoice,
} from './match-import';
import type { ImportReviewState, LocaleChoice } from './types';

type Phase = 'input' | 'review' | 'manual';

export function ImportRecipeScreen() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('input');
  const [url, setUrl] = useState('');
  const [htmlPaste, setHtmlPaste] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<ImportReviewState | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Manual fields
  const [manualName, setManualName] = useState('');
  const [manualIngredients, setManualIngredients] = useState('');
  const [manualSteps, setManualSteps] = useState('');
  const [manualServings, setManualServings] = useState('4');

  const runExtract = useCallback(() => {
    setError(null);
    setStatus(null);
    const sourceUrl = url.trim() || null;
    const result = extractRecipeFromHtml(htmlPaste, sourceUrl);
    if (!result.ok) {
      setError(result.message);
      if (result.code === 'no_structured_data') {
        setPhase('manual');
      }
      return;
    }
    const catalog = buildCommunityMatchCatalog();
    const state = buildImportReview(result.recipe, catalog, {
      source: result.source,
      sourceUrl,
    });
    setReview(state);
    setPhase('review');
  }, [htmlPaste, url]);

  const runManual = useCallback(() => {
    setError(null);
    const extracted = extractedFromManualPaste({
      name: manualName,
      servings: Number(manualServings) || 4,
      ingredientsText: manualIngredients,
      stepsText: manualSteps,
      sourceUrl: url.trim() || null,
    });
    if (extracted.ingredients.length === 0) {
      setError('Add at least one ingredient line.');
      return;
    }
    const catalog = buildCommunityMatchCatalog();
    const state = buildImportReview(extracted, catalog, {
      source: 'manual',
      sourceUrl: url.trim() || null,
    });
    setReview(state);
    setPhase('review');
  }, [manualName, manualIngredients, manualSteps, manualServings, url]);

  const onLocale = (choice: LocaleChoice) => {
    if (!review) return;
    setReview(setLocaleChoice(review, choice));
  };

  const onSave = async () => {
    if (!review) return;
    const gate = canSaveImport(review);
    if (gate.blocked) {
      setError(gate.message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const write = reviewToRecipeWrite(review, {
        id: newId('recipe'),
        householdId: DEFAULT_HOUSEHOLD_ID,
      });
      if (!hasActiveRepository()) {
        setStatus(
          `Ready to save “${write.title}” (${write.ingredients.length} ingredients) — data layer not ready.`,
        );
        return;
      }
      const created = await useRecipesStore.getState().create(write);
      if (created) {
        setStatus(`Saved “${created.title}” to your private book.`);
        void navigate(`/recipes/${created.id}`);
      } else {
        setError('Could not save recipe.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 pb-8 pt-5">
      <header className="mb-5">
        <div className="mb-1 flex items-center gap-2 text-sm text-ink-muted">
          <Link to="/community" className="text-primary">
            Community
          </Link>
          <span>/</span>
          <span>Import</span>
        </div>
        <h1 className="font-display text-2xl font-semibold text-ink">
          Import recipe
        </h1>
        <p className="mt-1 text-sm text-ink-muted">{COPYRIGHT_IMPORT_COPY}</p>
      </header>

      {error ? (
        <p
          className="mb-3 rounded-xl bg-critical/10 px-3 py-2 text-sm text-critical"
          role="alert"
          data-testid="import-error"
        >
          {error}
        </p>
      ) : null}
      {status ? (
        <p
          className="mb-3 rounded-xl bg-fresh/10 px-3 py-2 text-sm text-fresh"
          role="status"
        >
          {status}
        </p>
      ) : null}

      {phase === 'input' ? (
        <Card padding="md" className="space-y-3">
          <label className="block text-xs font-medium text-ink-muted">
            Recipe URL (optional — used for locale hints)
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className={cn(inputClass, 'mt-1')}
              data-testid="import-url"
            />
          </label>
          <label className="block text-xs font-medium text-ink-muted">
            Paste page HTML or JSON-LD
            <textarea
              value={htmlPaste}
              onChange={(e) => setHtmlPaste(e.target.value)}
              rows={8}
              placeholder="Paste the page source, or a script type=application/ld+json block…"
              className={cn(inputClass, 'mt-1 resize-y font-mono text-xs')}
              data-testid="import-html"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={runExtract}
              className={primaryBtn}
              data-testid="import-parse"
            >
              Parse structured data
            </button>
            <button
              type="button"
              onClick={() => setPhase('manual')}
              className={secondaryBtn}
              data-testid="import-manual"
            >
              Enter manually
            </button>
          </div>
        </Card>
      ) : null}

      {phase === 'manual' ? (
        <Card padding="md" className="space-y-3">
          <p className="text-sm text-ink-muted">
            No structured data required — paste ingredients and steps yourself.
          </p>
          <label className="block text-xs font-medium text-ink-muted">
            Title
            <input
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              className={cn(inputClass, 'mt-1')}
              data-testid="manual-name"
            />
          </label>
          <label className="block text-xs font-medium text-ink-muted">
            Servings
            <input
              value={manualServings}
              onChange={(e) => setManualServings(e.target.value)}
              className={cn(inputClass, 'mt-1 w-24')}
              inputMode="numeric"
            />
          </label>
          <label className="block text-xs font-medium text-ink-muted">
            Ingredients (one per line)
            <textarea
              value={manualIngredients}
              onChange={(e) => setManualIngredients(e.target.value)}
              rows={6}
              className={cn(inputClass, 'mt-1 resize-y')}
              data-testid="manual-ingredients"
            />
          </label>
          <label className="block text-xs font-medium text-ink-muted">
            Steps (one per line)
            <textarea
              value={manualSteps}
              onChange={(e) => setManualSteps(e.target.value)}
              rows={6}
              className={cn(inputClass, 'mt-1 resize-y')}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={runManual} className={primaryBtn}>
              Review matches
            </button>
            <button
              type="button"
              onClick={() => setPhase('input')}
              className={secondaryBtn}
            >
              Back
            </button>
          </div>
        </Card>
      ) : null}

      {phase === 'review' && review ? (
        <div className="space-y-4">
          <Card padding="md">
            <h2 className="font-display text-lg font-semibold text-ink">
              {review.extracted.name}
            </h2>
            <p className="mt-1 text-xs text-ink-muted">
              Source: {review.source}
              {review.sourceUrl ? ` · ${review.sourceUrl}` : ''}
            </p>
            <p className="mt-2 text-sm text-ink" data-testid="match-summary">
              {matchSummary(review).label}
            </p>
          </Card>

          {review.ambiguousLines.length > 0 ? (
            <Card
              padding="md"
              className="border border-low/30"
              data-testid="locale-prompt"
            >
              <h3 className="text-sm font-semibold text-ink">
                Locale ambiguity
              </h3>
              <p className="mt-1 text-sm text-ink-muted">
                {localeAmbiguityMessage(
                  review.ambiguousLines,
                  review.localeDetection,
                )}
              </p>
              {review.localeDetection.signals.length > 0 ? (
                <ul className="mt-2 list-inside list-disc text-xs text-ink-muted">
                  {review.localeDetection.signals.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onLocale('us')}
                  className={cn(
                    secondaryBtn,
                    review.localeChoice === 'us' && 'ring-2 ring-primary',
                  )}
                  data-testid="locale-us"
                >
                  US customary
                </button>
                <button
                  type="button"
                  onClick={() => onLocale('imperial')}
                  className={cn(
                    secondaryBtn,
                    review.localeChoice === 'imperial' && 'ring-2 ring-primary',
                  )}
                  data-testid="locale-imperial"
                >
                  Imperial (UK)
                </button>
              </div>
              {review.localeChoice ? (
                <p className="mt-2 text-xs text-ink-muted">
                  {localeChoiceNote(review.localeChoice)}
                </p>
              ) : null}
              <ul className="mt-2 space-y-1 text-xs text-low">
                {review.ambiguousLines.map((a) => (
                  <li key={`${a.lineIndex}-${a.unit}`}>
                    Line {a.lineIndex + 1}: “{a.rawLine}” ({a.unit})
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card padding="md">
            <h3 className="mb-2 text-sm font-semibold text-ink">Ingredients</h3>
            <ul className="space-y-2" data-testid="import-lines">
              {review.lines.map((line, i) => (
                <li
                  key={`${i}-${line.rawText}`}
                  className="rounded-xl border border-black/[0.06] px-3 py-2 text-sm"
                >
                  <div className="text-ink">{line.rawText}</div>
                  <div className="mt-0.5 text-xs text-ink-muted">
                    {line.matched
                      ? `Matched · ${line.ingredientId}`
                      : 'Unresolved · unknown allergens'}
                    {line.ambiguousLocale ? ' · ambiguous unit' : ''}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onSave()}
              className={primaryBtn}
              data-testid="import-save"
            >
              Save to my book
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase('input');
                setReview(null);
              }}
              className={secondaryBtn}
            >
              Start over
            </button>
          </div>
          <p className="text-xs text-ink-muted">
            Saved as private. Publishing to the community is blocked until you
            rewrite imported steps in your own words.
          </p>
        </div>
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
  'disabled:opacity-50',
);

const secondaryBtn = cn(
  'inline-flex min-h-tap items-center justify-center rounded-pill border border-black/[0.1] bg-surface px-4 text-sm font-medium text-ink',
);
