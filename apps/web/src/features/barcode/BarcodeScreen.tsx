import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import {
  DEFAULT_DEVICE_ID,
  DEFAULT_HOUSEHOLD_ID,
  DEFAULT_USER_ID,
} from '../../db/constants';
import { hasActiveRepository, usePantry } from '../../state';
import { cn } from '../../ui/cn';

import {
  OFF_ATTRIBUTION_LINE,
  OFF_ATTRIBUTION_SHORT,
} from './attribution';
import { isPlausibleBarcode, normalizeBarcode } from './cache';
import {
  labelForIngredient,
  matchFreeText,
  matchOffProduct,
  resolveFormId,
  suggestionDefaults,
} from './match-product';
import { getOffProductClient } from './off-client';
import { buildPutAway, resolveFromMapping } from './put-away';
import {
  detectFromImageSource,
  detectScannerCapability,
  scanBarcode,
} from './scanner';
import type { OffDerivedProduct } from './types';
import { searchCatalogIngredients } from '../recipes/catalog';

type Phase =
  | 'idle'
  | 'scanning'
  | 'looking-up'
  | 'confirm'
  | 'manual'
  | 'done'
  | 'error';

type ConfirmState = {
  barcode: string;
  offProduct: OffDerivedProduct | null;
  ingredientId: string;
  formId: string;
  displayName: string;
  qtyBase: number;
  fromCache: boolean;
  fromMapping: boolean;
  matchNote: string;
};

/**
 * Barcode put-away — scan UPC/EAN → OFF → match catalog → confirm purchase.
 */
export function BarcodeScreen() {
  const pantry = usePantry();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef(0);

  const [phase, setPhase] = useState<Phase>('idle');
  const [manualCode, setManualCode] = useState('');
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [webCameraOn, setWebCameraOn] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');
  const capability = detectScannerCapability();

  const stopWebCamera = useCallback(() => {
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = 0;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setWebCameraOn(false);
  }, []);

  useEffect(() => () => stopWebCamera(), [stopWebCamera]);

  const openConfirm = useCallback(
    (state: ConfirmState) => {
      setConfirm(state);
      setCatalogQuery(state.displayName);
      setPhase('confirm');
      setError(null);
    },
    [],
  );

  const resolveBarcode = useCallback(
    async (raw: string) => {
      const barcode = normalizeBarcode(raw);
      if (!isPlausibleBarcode(barcode)) {
        setError('Enter a valid UPC/EAN (8, 12, or 13 digits).');
        setPhase('error');
        return;
      }

      setPhase('looking-up');
      setError(null);

      const remembered = resolveFromMapping(barcode);
      if (remembered) {
        openConfirm({
          barcode,
          offProduct: null,
          ingredientId: remembered.ingredientId,
          formId: remembered.formId,
          displayName: remembered.displayName,
          qtyBase: 1,
          fromCache: false,
          fromMapping: true,
          matchNote: 'Remembered from a previous scan.',
        });
        return;
      }

      const client = getOffProductClient();
      const result = await client.lookup(barcode);

      if (!result.ok) {
        if (result.reason === 'not-found' || result.reason === 'network') {
          setManualCode(barcode);
          setPhase('manual');
          setError(
            result.reason === 'not-found'
              ? 'Unknown barcode — pick an ingredient manually. We will remember it next time.'
              : `${result.message} You can still enter the item manually.`,
          );
          return;
        }
        setError(result.message);
        setPhase(result.reason === 'rate-limited' ? 'error' : 'error');
        return;
      }

      const suggestion = matchOffProduct(result.product);
      const defaults = suggestionDefaults(suggestion.match);
      if (!defaults.ingredientId) {
        openConfirm({
          barcode,
          offProduct: result.product,
          ingredientId: '',
          formId: '',
          displayName: result.product.productName,
          qtyBase: 1,
          fromCache: result.fromCache,
          fromMapping: false,
          matchNote: 'No catalog match — choose an ingredient below.',
        });
        return;
      }
      const formId =
        resolveFormId(defaults.ingredientId, defaults.formId) ?? '';
      openConfirm({
        barcode,
        offProduct: result.product,
        ingredientId: defaults.ingredientId,
        formId,
        displayName: defaults.displayName ?? result.product.productName,
        qtyBase: 1,
        fromCache: result.fromCache,
        fromMapping: false,
        matchNote: defaults.autoAccept
          ? 'Matched our catalog (confirm before putting away).'
          : 'Suggested match — confirm or change.',
      });
    },
    [openConfirm],
  );

  const onNativeScan = async () => {
    setPhase('scanning');
    setError(null);
    const result = await scanBarcode();
    if (!result.ok) {
      if (result.reason === 'unavailable' && capability === 'barcode-detector') {
        setPhase('idle');
        await startWebCamera();
        return;
      }
      setError(result.message);
      setPhase('idle');
      return;
    }
    await resolveBarcode(result.barcode);
  };

  const startWebCamera = async () => {
    if (capability !== 'barcode-detector') {
      setError(
        'Live camera scanning is not supported in this browser. Enter the barcode manually.',
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      setWebCameraOn(true);
      setPhase('scanning');
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      const loop = async () => {
        const v = videoRef.current;
        if (!v || v.readyState < 2) {
          scanLoopRef.current = requestAnimationFrame(() => {
            void loop();
          });
          return;
        }
        const detected = await detectFromImageSource(v);
        if (detected.ok) {
          stopWebCamera();
          await resolveBarcode(detected.barcode);
          return;
        }
        scanLoopRef.current = requestAnimationFrame(() => {
          void loop();
        });
      };
      scanLoopRef.current = requestAnimationFrame(() => {
        void loop();
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not open camera. Enter the barcode manually.',
      );
      setPhase('idle');
    }
  };

  const onManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    void resolveBarcode(manualCode);
  };

  const onConfirmPutAway = async () => {
    if (!confirm || !confirm.ingredientId || !confirm.formId) {
      setError('Choose an ingredient from the catalog first.');
      return;
    }
    if (!hasActiveRepository()) {
      setError('Data layer not ready — cannot write pantry yet.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { txn } = buildPutAway(
        {
          barcode: confirm.barcode,
          ingredientId: confirm.ingredientId,
          formId: confirm.formId,
          displayName: confirm.displayName,
          qtyBase: confirm.qtyBase,
          offProduct: confirm.offProduct,
        },
        {
          householdId: pantry.householdId || DEFAULT_HOUSEHOLD_ID,
          deviceId: DEFAULT_DEVICE_ID,
          userId: DEFAULT_USER_ID,
        },
      );
      await pantry.appendTxn(txn);
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const catalogHits = catalogQuery.trim()
    ? searchCatalogIngredients(catalogQuery, 8)
    : [];

  const reset = () => {
    stopWebCamera();
    setPhase('idle');
    setConfirm(null);
    setError(null);
    setManualCode('');
    setCatalogQuery('');
  };

  return (
    <div className="mx-auto max-w-lg pb-28" data-testid="barcode-screen">
      <nav className="mb-3">
        <Link
          to="/pantry"
          className="inline-flex min-h-tap items-center text-sm font-medium text-primary"
        >
          ← Pantry
        </Link>
      </nav>

      <header className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          Put away
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">
          Scan barcode
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Scan as you unpack. Unknown codes can be mapped once and remembered.
        </p>
      </header>

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-card bg-critical/10 px-3 py-3 text-sm text-critical"
        >
          {error}
        </div>
      ) : null}

      {phase === 'idle' || phase === 'error' || phase === 'scanning' ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => void onNativeScan()}
            className="min-h-12 w-full rounded-pill bg-primary text-base font-semibold text-white"
            data-testid="barcode-scan-btn"
          >
            {capability === 'native' ? 'Open scanner' : 'Scan with camera'}
          </button>

          {capability === 'barcode-detector' ? (
            <button
              type="button"
              onClick={() => void startWebCamera()}
              className="min-h-12 w-full rounded-pill border border-black/[0.08] bg-surface text-base font-semibold text-ink"
            >
              Use browser camera
            </button>
          ) : null}

          {capability === 'manual-only' ? (
            <p className="text-sm text-ink-muted">
              Live scanning needs a supported browser or the native app. Enter
              digits below.
            </p>
          ) : null}

          {webCameraOn ? (
            <div className="overflow-hidden rounded-card bg-ink">
              <video
                ref={videoRef}
                className="aspect-[4/3] w-full object-cover"
                muted
                playsInline
              />
              <button
                type="button"
                onClick={stopWebCamera}
                className="min-h-tap w-full bg-surface text-sm font-semibold text-ink"
              >
                Stop camera
              </button>
            </div>
          ) : null}

          <form onSubmit={onManualSubmit} className="space-y-2">
            <label className="block text-sm font-medium text-ink">
              Or enter UPC / EAN
              <input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                placeholder="e.g. 3017620422003"
                className="mt-1 min-h-12 w-full rounded-2xl border border-black/[0.08] bg-surface px-3 text-base text-ink"
                data-testid="barcode-manual-input"
              />
            </label>
            <button
              type="submit"
              className="min-h-12 w-full rounded-pill border border-primary/30 bg-primary/10 text-base font-semibold text-primary"
              data-testid="barcode-lookup-btn"
            >
              Look up
            </button>
          </form>
        </div>
      ) : null}

      {phase === 'looking-up' ? (
        <p className="text-sm text-ink-muted" role="status">
          Looking up product…
        </p>
      ) : null}

      {phase === 'manual' ? (
        <div className="space-y-3" data-testid="barcode-manual-match">
          <p className="text-sm text-ink">
            Barcode <span className="font-mono">{manualCode}</span> — match to
            catalog:
          </p>
          <input
            value={catalogQuery}
            onChange={(e) => setCatalogQuery(e.target.value)}
            placeholder="Search ingredients…"
            className="min-h-12 w-full rounded-2xl border border-black/[0.08] bg-surface px-3 text-base"
          />
          <ul className="space-y-1">
            {catalogHits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  className="min-h-12 w-full rounded-2xl bg-surface px-3 text-left text-sm font-semibold text-ink shadow-card"
                  onClick={() =>
                    openConfirm({
                      barcode: normalizeBarcode(manualCode),
                      offProduct: null,
                      ingredientId: hit.id,
                      formId: hit.defaultFormId,
                      displayName: hit.name,
                      qtyBase: 1,
                      fromCache: false,
                      fromMapping: false,
                      matchNote: 'Manual selection — will be remembered.',
                    })
                  }
                >
                  {hit.name}
                  <span className="ml-2 text-xs font-normal text-ink-muted">
                    {hit.category}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={reset}
            className="min-h-tap text-sm font-medium text-primary"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {phase === 'confirm' && confirm ? (
        <div className="space-y-4" data-testid="barcode-confirm">
          {confirm.offProduct ? (
            <div className="rounded-card bg-surface p-4 shadow-card">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                Open Food Facts
                {confirm.fromCache ? ' · cached' : ''}
              </p>
              <p className="mt-1 font-display text-lg font-semibold text-ink">
                {confirm.offProduct.productName}
              </p>
              {confirm.offProduct.brand ? (
                <p className="text-sm text-ink-muted">{confirm.offProduct.brand}</p>
              ) : null}
              {confirm.offProduct.quantityLabel ? (
                <p className="text-sm text-ink-muted">
                  {confirm.offProduct.quantityLabel}
                </p>
              ) : null}
              <p className="mt-2 text-[11px] text-ink-muted">
                {confirm.offProduct.attributionShort}
              </p>
              <p className="mt-1 text-[10px] text-ink-muted/80">
                open-food-facts sourced · not merged into catalog seed
              </p>
            </div>
          ) : null}

          <p className="text-sm text-ink-muted">{confirm.matchNote}</p>

          <label className="block text-sm font-medium text-ink">
            Catalog ingredient
            <input
              value={catalogQuery}
              onChange={(e) => {
                setCatalogQuery(e.target.value);
                const suggestion = matchFreeText(e.target.value);
                const d = suggestionDefaults(suggestion.match);
                if (d.ingredientId && d.formId) {
                  setConfirm({
                    ...confirm,
                    ingredientId: d.ingredientId,
                    formId: d.formId,
                    displayName: d.displayName ?? e.target.value,
                  });
                }
              }}
              className="mt-1 min-h-12 w-full rounded-2xl border border-black/[0.08] bg-surface px-3 text-base"
            />
          </label>

          {catalogHits.length > 0 ? (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {catalogHits.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    className={cn(
                      'min-h-11 w-full rounded-xl px-3 text-left text-sm',
                      hit.id === confirm.ingredientId
                        ? 'bg-primary text-white'
                        : 'bg-surface text-ink shadow-card',
                    )}
                    onClick={() =>
                      setConfirm({
                        ...confirm,
                        ingredientId: hit.id,
                        formId: hit.defaultFormId,
                        displayName: hit.name,
                      })
                    }
                  >
                    {hit.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {confirm.ingredientId ? (
            <p className="text-sm text-ink">
              Putting away:{' '}
              <strong>{labelForIngredient(confirm.ingredientId)}</strong>
            </p>
          ) : null}

          <label className="block text-sm font-medium text-ink">
            Quantity (base units)
            <input
              type="number"
              min={0.01}
              step="any"
              value={confirm.qtyBase}
              onChange={(e) =>
                setConfirm({
                  ...confirm,
                  qtyBase: Number(e.target.value) || 0,
                })
              }
              className="mt-1 min-h-12 w-full rounded-2xl border border-black/[0.08] bg-surface px-3 text-base"
            />
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={reset}
              className="min-h-12 flex-1 rounded-pill border border-black/[0.08] bg-surface text-sm font-semibold text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !confirm.ingredientId}
              onClick={() => void onConfirmPutAway()}
              className="min-h-12 flex-1 rounded-pill bg-primary text-sm font-semibold text-white disabled:opacity-50"
              data-testid="barcode-confirm-btn"
            >
              {busy ? 'Saving…' : 'Add to pantry'}
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'done' ? (
        <div
          role="status"
          className="rounded-card bg-fresh/10 p-4 text-sm text-fresh"
          data-testid="barcode-done"
        >
          <p className="font-semibold">Put away logged</p>
          <p className="mt-1 text-fresh/90">
            Purchase recorded
            {confirm ? ` for ${confirm.displayName}` : ''}. Mapping saved for
            next scan.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-3 min-h-12 rounded-pill bg-primary px-5 text-sm font-semibold text-white"
          >
            Scan another
          </button>
        </div>
      ) : null}

      <footer
        className="mt-10 border-t border-black/[0.04] pt-4 text-[11px] leading-relaxed text-ink-muted"
        data-testid="off-attribution"
      >
        <p className="font-medium text-ink-muted">About product data</p>
        <p className="mt-1">{OFF_ATTRIBUTION_LINE}</p>
        <p className="mt-1">
          OFF-derived rows stay segregated and tagged; they are never merged into
          our ingredient seed. {OFF_ATTRIBUTION_SHORT}.
        </p>
      </footer>
    </div>
  );
}
