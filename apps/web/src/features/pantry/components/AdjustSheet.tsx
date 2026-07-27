import type { Dimension } from '@larder/core';
import { useState } from 'react';

import type { PickerOutcome } from '../lib/picker-wheels';
import { QuantityPickerWheels } from './QuantityPickerWheels';
import {
  PrimaryButton,
  SecondaryButton,
  Sheet,
} from './Sheet';

type AdjustSheetProps = {
  open: boolean;
  itemName: string;
  dim: Dimension;
  currentQtyBase: number;
  onClose: () => void;
  onConfirm: (deltaBase: number) => void | Promise<void>;
  /** Jump to Recount when the remove wheel is at the on-hand cap. */
  onRequestRecount?: () => void;
  busy?: boolean;
};

/**
 * Adjust quantity — relative delta via three wheels (qty · unit · add/remove).
 * Copy makes the semantics clear: "add or remove this much", not "set to".
 * Remove is capped at on-hand so the ledger never goes negative from a mis-dial.
 */
export function AdjustSheet({
  open,
  itemName,
  dim,
  currentQtyBase,
  onClose,
  onConfirm,
  onRequestRecount,
  busy,
}: AdjustSheetProps) {
  const [outcome, setOutcome] = useState<PickerOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!outcome || outcome.mode !== 'adjust' || outcome.qtyBase === 0) {
      setError('Choose a non-zero amount to add or remove');
      return;
    }
    setError(null);
    await onConfirm(outcome.qtyBase);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Adjust quantity"
      subtitle={`Add or remove some ${itemName}. This does not set an exact total.`}
      footer={
        <>
          <PrimaryButton
            onClick={() => void submit()}
            disabled={busy}
            data-testid="adjust-confirm"
          >
            {busy ? 'Saving…' : 'Apply adjustment'}
          </PrimaryButton>
          <SecondaryButton onClick={onClose} disabled={busy}>
            Cancel
          </SecondaryButton>
        </>
      }
    >
      <p className="mb-4 rounded-2xl bg-tint-sage/50 px-3 py-2 text-sm text-ink">
        <strong className="font-semibold">Adjustment</strong> means “change by
        this much” — for example you used a splash, or found an extra can.
        To snap the count to what you actually see on the shelf, use{' '}
        <strong className="font-semibold">Recount</strong> instead.
      </p>

      <QuantityPickerWheels
        mode="adjust"
        dim={dim}
        itemName={itemName}
        currentQtyBase={currentQtyBase}
        resetKey={open}
        onOutcomeChange={setOutcome}
        onRequestRecount={onRequestRecount}
      />

      {error ? (
        <p className="mt-2 text-sm text-critical" role="alert">
          {error}
        </p>
      ) : (
        <p className="mt-2 text-xs text-ink-muted">
          Writes a relative ledger event (add/remove), not a set-to total.
          Remove stops at what is recorded on hand.
        </p>
      )}
    </Sheet>
  );
}
