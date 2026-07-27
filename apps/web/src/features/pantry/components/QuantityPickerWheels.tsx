/**
 * Multi-column quantity picker for Adjust / Recount / Waste / Add-item.
 *
 * Adjust → 3 wheels (qty · unit · add/remove)
 * Recount / Waste / Add → 2 wheels (qty · unit); waste direction fixed remove.
 *
 * Remove / Waste clamp the quantity wheel to on-hand stock (in the selected
 * unit). Cook flow is intentionally not clamped — that path lives elsewhere.
 */

import type { Dimension } from '@larder/core';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { cn } from '../../../ui/cn';
import { WheelColumn } from '../../../ui/WheelColumn';
import {
  canRemoveStock,
  clampSelectionForRemoval,
  formatAvailableAmount,
  formatPickerPreview,
  formatStepLabel,
  isAtRemoveCap,
  isRemovalSelection,
  onHandInUnit,
  type PickerDirection,
  type PickerMode,
  type PickerOutcome,
  type PickerSelection,
  quantityStepsForRemoval,
  quantityStepsForUnit,
  rescaleQuantityForUnitChange,
  resolvePickerOutcome,
  seedPickerSelection,
  unitLabel,
  unitsForDimension,
  wheelCountForMode,
} from '../lib/picker-wheels';
import { parseHumanDelta, parseHumanQuantity } from '../lib/qty-input';

export type QuantityPickerWheelsProps = {
  mode: PickerMode;
  dim: Dimension;
  itemName: string;
  /** Current stock in base units (preview + recount seed + remove cap). */
  currentQtyBase?: number;
  preferredUnit?: string;
  /** Called whenever the selection produces a valid outcome. */
  onOutcomeChange?: (outcome: PickerOutcome | null) => void;
  /**
   * Open Recount from the cap hint (“used more than we tracked?”).
   * Parent typically closes Adjust and opens the recount sheet.
   */
  onRequestRecount?: () => void;
  className?: string;
  /** Reset key — change when sheet re-opens to re-seed. */
  resetKey?: string | number | boolean;
};

export function QuantityPickerWheels({
  mode,
  dim,
  itemName,
  currentQtyBase = 0,
  preferredUnit,
  onOutcomeChange,
  onRequestRecount,
  className,
  resetKey,
}: QuantityPickerWheelsProps) {
  const [selection, setSelection] = useState<PickerSelection>(() =>
    seedPickerSelection(mode, dim, currentQtyBase, preferredUnit),
  );
  const [typeMode, setTypeMode] = useState(false);
  const [typeText, setTypeText] = useState('');
  const [typeError, setTypeError] = useState<string | null>(null);

  // Re-seed when sheet opens or item changes
  useEffect(() => {
    setSelection(seedPickerSelection(mode, dim, currentQtyBase, preferredUnit));
    setTypeMode(false);
    setTypeText('');
    setTypeError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetKey drives intentional reseed
  }, [resetKey, mode, dim, preferredUnit]);

  const unitOptions = useMemo(
    () =>
      unitsForDimension(dim).map((u) => ({
        value: u,
        label: unitLabel(u),
      })),
    [dim],
  );

  const isRemoval = isRemovalSelection(mode, selection.direction);
  const stockEmpty = !canRemoveStock(currentQtyBase);
  const removeBlocked = isRemoval && stockEmpty;

  const maxDisplayQty = useMemo(
    () => (isRemoval ? onHandInUnit(currentQtyBase, dim, selection.unit) : null),
    [isRemoval, currentQtyBase, dim, selection.unit],
  );

  const qtyOptions = useMemo(() => {
    const steps =
      isRemoval && maxDisplayQty !== null
        ? quantityStepsForRemoval(selection.unit, maxDisplayQty)
        : quantityStepsForUnit(selection.unit);
    return steps.map((s) => ({
      value: String(s),
      label: formatStepLabel(s, selection.unit),
    }));
  }, [selection.unit, isRemoval, maxDisplayQty]);

  const directionOptions = useMemo(() => {
    const opts: { value: PickerDirection; label: string }[] = [
      { value: 'add', label: 'Add' },
    ];
    // At zero stock Remove is unavailable — do not offer a wheel that only
    // dials zero as if a real removal were possible.
    if (canRemoveStock(currentQtyBase)) {
      opts.push({ value: 'remove', label: 'Remove' });
    }
    return opts;
  }, [currentQtyBase]);

  const wheelCount = wheelCountForMode(mode);
  const showDirection = mode === 'adjust';

  const emitOutcome = useCallback(
    (sel: PickerSelection) => {
      if (!onOutcomeChange) return;
      if (
        isRemovalSelection(mode, sel.direction) &&
        !canRemoveStock(currentQtyBase)
      ) {
        onOutcomeChange(null);
        return;
      }
      const resolved = resolvePickerOutcome(sel, mode, currentQtyBase);
      onOutcomeChange(resolved.ok ? resolved.outcome : null);
    },
    [currentQtyBase, mode, onOutcomeChange],
  );

  useEffect(() => {
    emitOutcome(selection);
  }, [selection, emitOutcome]);

  // If stock drops to zero while on Remove, drop direction back to Add.
  useEffect(() => {
    if (mode !== 'adjust') return;
    if (canRemoveStock(currentQtyBase)) return;
    setSelection((prev) =>
      prev.direction === 'remove'
        ? { ...prev, direction: 'add', qty: 0 }
        : prev,
    );
  }, [currentQtyBase, mode]);

  // Keep qty inside the removal cap when unit / direction / stock changes.
  useEffect(() => {
    setSelection((prev) =>
      clampSelectionForRemoval(prev, mode, currentQtyBase, dim),
    );
  }, [mode, currentQtyBase, dim, selection.unit, selection.direction]);

  const preview = formatPickerPreview(
    itemName,
    mode,
    dim,
    selection,
    currentQtyBase,
  );

  const availableLabel =
    isRemoval && !stockEmpty
      ? formatAvailableAmount(currentQtyBase, dim, selection.unit)
      : null;

  const atCap =
    !stockEmpty && isAtRemoveCap(selection, mode, currentQtyBase, dim);

  function setQtyFromString(raw: string) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    setSelection((prev) =>
      clampSelectionForRemoval(
        { ...prev, qty: n },
        mode,
        currentQtyBase,
        dim,
      ),
    );
  }

  function setUnit(nextUnit: string) {
    setSelection((prev) => {
      if (prev.unit === nextUnit) return prev;
      const rescaled = rescaleQuantityForUnitChange(
        prev.qty,
        prev.unit,
        nextUnit,
      );
      return clampSelectionForRemoval(
        {
          ...prev,
          unit: nextUnit,
          qty: rescaled.qty,
        },
        mode,
        currentQtyBase,
        dim,
      );
    });
  }

  function setDirection(dir: string) {
    if (dir !== 'add' && dir !== 'remove') return;
    if (dir === 'remove' && !canRemoveStock(currentQtyBase)) return;
    setSelection((prev) =>
      clampSelectionForRemoval(
        {
          ...prev,
          direction: dir as PickerDirection,
        },
        mode,
        currentQtyBase,
        dim,
      ),
    );
  }

  function applyTypedValue() {
    if (mode === 'adjust') {
      const parsed = parseHumanDelta(typeText, dim);
      if (!parsed.ok) {
        setTypeError(parsed.message);
        return;
      }
      if (parsed.qtyBase === 0) {
        setTypeError('Enter a non-zero amount');
        return;
      }
      setTypeError(null);
      const abs = Math.abs(parsed.rawQty);
      const unit = parsed.displayUnit;
      const dir: PickerDirection = parsed.qtyBase < 0 ? 'remove' : 'add';
      if (dir === 'remove' && !canRemoveStock(currentQtyBase)) {
        setTypeError('Nothing on hand to remove');
        return;
      }
      const nextUnit = unitOptions.some((u) => u.value === unit)
        ? unit
        : selection.unit;
      const rescaled =
        nextUnit === unit
          ? abs
          : rescaleQuantityForUnitChange(abs, unit, nextUnit).qty;
      const next = clampSelectionForRemoval(
        {
          qty: rescaled,
          unit: nextUnit,
          direction: dir,
        },
        mode,
        currentQtyBase,
        dim,
      );
      setSelection(next);
      setTypeMode(false);
      return;
    }

    const parsed = parseHumanQuantity(typeText, dim);
    if (!parsed.ok) {
      setTypeError(parsed.message);
      return;
    }
    if (parsed.qtyBase < 0) {
      setTypeError('Amount cannot be negative');
      return;
    }
    setTypeError(null);
    const unit = parsed.displayUnit;
    const nextUnit = unitOptions.some((u) => u.value === unit)
      ? unit
      : selection.unit;
    const qty =
      nextUnit === unit
        ? parsed.rawQty
        : rescaleQuantityForUnitChange(parsed.rawQty, unit, nextUnit).qty;
    const next = clampSelectionForRemoval(
      {
        ...selection,
        qty,
        unit: nextUnit,
        direction: mode === 'waste' ? 'remove' : selection.direction,
      },
      mode,
      currentQtyBase,
      dim,
    );
    setSelection(next);
    setTypeMode(false);
  }

  return (
    <div
      className={cn('w-full', className)}
      data-testid="quantity-picker-wheels"
      data-picker-mode={mode}
      data-wheel-count={wheelCount}
      data-removal-clamped={isRemoval ? 'true' : 'false'}
    >
      {!typeMode ? (
        <>
          {removeBlocked ? (
            <div
              className="rounded-2xl border border-black/[0.06] bg-surface-raised px-4 py-6 text-center"
              data-testid="picker-remove-empty"
            >
              <p className="text-sm font-medium text-ink">
                Nothing on hand to remove
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Stock is already at zero. Add more, or use{' '}
                {onRequestRecount ? (
                  <button
                    type="button"
                    className="font-semibold text-primary underline-offset-2 hover:underline"
                    data-testid="picker-recount-link"
                    onClick={onRequestRecount}
                  >
                    Recount
                  </button>
                ) : (
                  <strong className="font-semibold text-ink">Recount</strong>
                )}{' '}
                if the record is wrong.
              </p>
            </div>
          ) : (
            <div
              className="flex gap-1 rounded-2xl border border-black/[0.06] bg-surface-raised px-1 py-1"
              data-testid="picker-wheels-row"
            >
              <WheelColumn
                data-testid="picker-wheel-quantity"
                aria-label="Quantity"
                options={qtyOptions}
                value={String(selection.qty)}
                onChange={setQtyFromString}
              />
              <WheelColumn
                data-testid="picker-wheel-unit"
                aria-label="Unit"
                options={unitOptions}
                value={selection.unit}
                onChange={setUnit}
              />
              {showDirection ? (
                <WheelColumn
                  data-testid="picker-wheel-direction"
                  aria-label="Add or remove"
                  options={directionOptions}
                  value={selection.direction}
                  onChange={setDirection}
                />
              ) : null}
            </div>
          )}

          {availableLabel && !removeBlocked ? (
            <p
              className="mt-2 text-center text-xs font-medium text-ink-muted"
              data-testid="picker-available"
            >
              {availableLabel}
            </p>
          ) : null}

          <p
            className="mt-3 text-center text-sm font-medium text-ink"
            data-testid="picker-preview"
            aria-live="polite"
          >
            {removeBlocked ? `${itemName}: nothing to remove` : preview}
          </p>

          {atCap && !removeBlocked ? (
            <p
              className="mt-2 text-center text-xs text-ink-muted"
              data-testid="picker-cap-hint"
            >
              That&apos;s everything recorded. Have more than we tracked? Use{' '}
              {onRequestRecount ? (
                <button
                  type="button"
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                  data-testid="picker-recount-link"
                  onClick={onRequestRecount}
                >
                  Recount
                </button>
              ) : (
                <strong className="font-semibold text-ink">Recount</strong>
              )}{' '}
              instead.
            </p>
          ) : null}

          {!removeBlocked ? (
            <button
              type="button"
              className="mt-3 min-h-tap w-full text-center text-sm font-semibold text-primary underline-offset-2 hover:underline"
              data-testid="picker-type-toggle"
              onClick={() => {
                setTypeMode(true);
                setTypeError(null);
                setTypeText('');
              }}
            >
              Type a value
            </button>
          ) : null}
        </>
      ) : (
        <div data-testid="picker-type-mode">
          <label
            htmlFor="picker-type-input"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-muted"
          >
            {mode === 'adjust'
              ? 'Amount to add (+) or remove (−)'
              : mode === 'waste'
                ? 'Amount wasted'
                : 'Exact amount'}
          </label>
          <input
            id="picker-type-input"
            data-testid="picker-type-input"
            inputMode="text"
            autoComplete="off"
            className={cn(
              'min-h-tap w-full rounded-2xl border border-black/[0.06] bg-surface px-3 text-base text-ink',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
            )}
            placeholder={
              dim === 'mass'
                ? mode === 'adjust'
                  ? 'e.g. +2 oz or −100 g'
                  : 'e.g. 1.5 lb or 500 g'
                : dim === 'volume'
                  ? mode === 'adjust'
                    ? 'e.g. +1 cup or −50 ml'
                    : 'e.g. 2 cups or 500 ml'
                  : mode === 'adjust'
                    ? 'e.g. +2 or −1 each'
                    : 'e.g. 6 each'
            }
            value={typeText}
            onChange={(e) => setTypeText(e.target.value)}
          />
          {typeError ? (
            <p className="mt-2 text-sm text-critical" role="alert">
              {typeError}
            </p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="min-h-tap flex-1 rounded-pill bg-primary px-4 text-sm font-semibold text-white"
              onClick={applyTypedValue}
            >
              Use this value
            </button>
            <button
              type="button"
              className="min-h-tap flex-1 rounded-pill bg-bg px-4 text-sm font-semibold text-ink"
              data-testid="picker-type-cancel"
              onClick={() => {
                setTypeMode(false);
                setTypeError(null);
              }}
            >
              Back to wheels
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export type { PickerMode, PickerOutcome, PickerSelection };
