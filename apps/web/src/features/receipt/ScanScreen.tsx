/**
 * Receipt capture screen — photo → compress → duplicate-aware parse → review.
 */

import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Card, cn } from '../../ui';
import { DEFAULT_HOUSEHOLD_ID } from '../../db/constants';
import { captureReceiptImage } from './capture';
import {
  checkDuplicateReceipt,
  type FingerprintStore,
  localFingerprintStore,
} from './fingerprint-store';
import { buildMatchCatalog } from './match-catalog';
import { localAliasStore } from './alias-store';
import {
  createMemoryOfflineQueue,
  isOnline,
  localOfflineQueue,
  type OfflineQueue,
} from './offline-queue';
import { liveParseClient, type ParseClient } from './parse-client';
import { buildReviewState } from './review-model';
import { stashParseResult, stashReviewState } from './session';
import { buildSynthetic40Parse } from './synthetic-40';
import type { CompressedImage, ParseSuccessResponse } from './types';

export type ScanScreenProps = {
  readonly parseClient?: ParseClient;
  readonly fingerprintStore?: FingerprintStore;
  readonly offlineQueue?: OfflineQueue;
  readonly householdId?: string;
};

type Phase =
  | 'idle'
  | 'capturing'
  | 'ready'
  | 'checking'
  | 'parsing'
  | 'blocked'
  | 'warn'
  | 'error'
  | 'queued';

export function ScanScreen({
  parseClient = liveParseClient,
  fingerprintStore = localFingerprintStore,
  offlineQueue = localOfflineQueue,
  householdId = DEFAULT_HOUSEHOLD_ID,
}: ScanScreenProps) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('idle');
  const [images, setImages] = useState<CompressedImage[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [nearOverride, setNearOverride] = useState(false);
  const [pendingParse, setPendingParse] = useState<ParseSuccessResponse | null>(
    null,
  );
  const filePickRef = useRef<(() => Promise<File | null>) | undefined>(
    undefined,
  );

  const addPhoto = useCallback(async () => {
    setPhase('capturing');
    setMessage(null);
    const result = await captureReceiptImage({
      pickFile: filePickRef.current,
    });
    if (!result.ok) {
      setPhase(images.length > 0 ? 'ready' : 'idle');
      if (result.reason === 'error') setMessage(result.message);
      return;
    }
    setImages((prev) => [...prev, result.image]);
    setPhase('ready');
  }, [images.length]);

  const removeLast = useCallback(() => {
    setImages((prev) => prev.slice(0, -1));
    setPhase((p) => (images.length <= 1 ? 'idle' : p));
  }, [images.length]);

  const goToReview = useCallback(
    (parse: ParseSuccessResponse) => {
      const aliases = localAliasStore.list(householdId);
      const catalog = buildMatchCatalog(aliases, { householdId });
      const review = buildReviewState(parse, catalog, { householdId });
      stashParseResult(parse);
      stashReviewState(review);
      navigate('/receipt/review');
    },
    [householdId, navigate],
  );

  const runParse = useCallback(async () => {
    if (images.length === 0) return;

    if (!isOnline()) {
      offlineQueue.enqueue(images);
      setPhase('queued');
      setMessage(
        'You are offline. Photo queued — we will scan when you are back online.',
      );
      return;
    }

    setPhase('parsing');
    setMessage(null);

    const res = await parseClient.parse({
      images,
      householdId,
      locale: 'en-US',
    });

    if (!res.ok) {
      if (res.code === 'not_grocery') {
        setPhase('error');
        setMessage(
          res.message ||
            'This does not look like a grocery receipt. No scan was used.',
        );
        return;
      }
      if (res.code === 'unreadable' || res.code === 'schema_violation') {
        setPhase('error');
        setMessage(
          `${res.message} Try retaking the photo — this did not use a scan.`,
        );
        return;
      }
      if (res.code === 'offline' || res.code === 'network') {
        offlineQueue.enqueue(images);
        setPhase('queued');
        setMessage(
          'Could not reach the server. Photo queued for when you are online.',
        );
        return;
      }
      setPhase('error');
      setMessage(res.message);
      return;
    }

    // Duplicate guard after parse (fingerprint needs store/date/total/lines)
    const store = res.storeName ?? 'unknown';
    const date = res.receiptDate ?? new Date().toISOString().slice(0, 10);
    const total = res.total ?? 0;
    const lineCount = res.items.length;
    const dup = checkDuplicateReceipt(
      { store, date, total, lineCount },
      fingerprintStore,
    );

    if (dup.kind === 'block') {
      setPhase('blocked');
      setPendingParse(res);
      setMessage(
        `This receipt looks identical to one already scanned (${dup.prior.store}, ${dup.prior.date}, $${dup.prior.total.toFixed(2)}). Scanning again would double-count the pantry.`,
      );
      return;
    }

    if (dup.kind === 'warn' && !nearOverride) {
      setPhase('warn');
      setPendingParse(res);
      setMessage(
        `A similar receipt was scanned ${dup.dayDiff} day${dup.dayDiff === 1 ? '' : 's'} ago at ${dup.prior.store} ($${dup.prior.total.toFixed(2)}). Same trip? Override only if this is a different purchase.`,
      );
      return;
    }

    goToReview(res);
  }, [
    fingerprintStore,
    goToReview,
    householdId,
    images,
    nearOverride,
    offlineQueue,
    parseClient,
  ]);

  const loadDemo = useCallback(() => {
    const parse = buildSynthetic40Parse();
    goToReview(parse);
  }, [goToReview]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col pb-safe">
      <header className="border-b border-black/[0.04] px-4 pb-3 pt-safe">
        <div className="pt-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Scan receipt
          </h1>
          <p className="mt-0.5 text-xs text-ink-muted">
            Photograph your receipt. We match items before anything enters the
            pantry.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-4 px-4 py-4">
        <Card padding="md" className="flex flex-col gap-3">
          <p className="text-sm text-ink">
            {images.length === 0
              ? 'Take a clear photo of the full receipt. Long receipts: add a second photo.'
              : `${images.length} photo${images.length === 1 ? '' : 's'} ready · compressed on device`}
          </p>

          {images.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {images.map((img, i) => (
                <li
                  key={`${img.byteLength}-${i}`}
                  className="rounded-xl bg-tint-sage/40 px-3 py-2 text-xs text-ink"
                >
                  Photo {i + 1} · {Math.round(img.byteLength / 1024)} KB ·{' '}
                  {img.width}×{img.height}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void addPhoto()}
              disabled={phase === 'capturing' || phase === 'parsing'}
              className={cn(
                'min-h-tap min-w-tap rounded-pill bg-primary px-5 text-sm font-semibold text-white',
                'disabled:opacity-50',
              )}
            >
              {images.length === 0 ? 'Take photo' : 'Add another photo'}
            </button>
            {images.length > 0 ? (
              <button
                type="button"
                onClick={removeLast}
                className="min-h-tap rounded-pill bg-surface px-4 text-sm font-semibold text-ink shadow-card"
              >
                Remove last
              </button>
            ) : null}
          </div>
        </Card>

        {message ? (
          <div
            className={cn(
              'rounded-xl px-3 py-3 text-sm',
              phase === 'blocked' || phase === 'error'
                ? 'bg-critical/10 text-critical'
                : phase === 'warn'
                  ? 'bg-low/10 text-low'
                  : phase === 'queued'
                    ? 'bg-tint-sky/50 text-ink'
                    : 'bg-surface text-ink',
            )}
            role="status"
          >
            {message}
          </div>
        ) : null}

        {phase === 'blocked' ? (
          <p className="text-xs text-ink-muted">
            Exact duplicate blocked. No scan was charged. If this was a mistake,
            retake a different receipt.
          </p>
        ) : null}

        {phase === 'warn' && pendingParse ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setNearOverride(true);
                goToReview(pendingParse);
              }}
              className="min-h-tap rounded-pill bg-primary px-5 text-sm font-semibold text-white"
            >
              Scan anyway
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase('ready');
                setPendingParse(null);
                setMessage(null);
              }}
              className="min-h-tap rounded-pill bg-surface px-4 text-sm font-semibold text-ink shadow-card"
            >
              Cancel
            </button>
          </div>
        ) : null}

        {phase === 'error' ? (
          <button
            type="button"
            onClick={() => {
              setImages([]);
              setPhase('idle');
              setMessage(null);
            }}
            className="min-h-tap self-start rounded-pill bg-primary px-5 text-sm font-semibold text-white"
          >
            Retake
          </button>
        ) : null}

        {images.length > 0 &&
        phase !== 'blocked' &&
        phase !== 'warn' &&
        phase !== 'queued' ? (
          <button
            type="button"
            onClick={() => void runParse()}
            disabled={phase === 'parsing' || phase === 'capturing'}
            className={cn(
              'min-h-tap w-full rounded-pill bg-primary text-sm font-semibold text-white',
              'disabled:opacity-50',
            )}
          >
            {phase === 'parsing' ? 'Reading receipt…' : 'Scan receipt'}
          </button>
        ) : null}

        {import.meta.env.DEV ? (
          <button
            type="button"
            onClick={loadDemo}
            className="min-h-tap text-left text-xs font-medium text-ink-muted underline"
          >
            Dev: open synthetic 40-line review
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Test helper — avoid unused import warning for memory queue factory. */
export { createMemoryOfflineQueue };
