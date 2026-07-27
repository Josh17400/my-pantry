import type { Dimension } from '@larder/core';
import { useState } from 'react';

import type { PickerOutcome } from '../lib/picker-wheels';
import type { ProvenanceFields } from '../lib/provenance-display';
import { formatItemQuantity } from '../lib/provenance-display';
import { QuantityPickerWheels } from './QuantityPickerWheels';
import {
  PrimaryButton,
  SecondaryButton,
  Sheet,
} from './Sheet';

type RecountSheetProps = {
  open: boolean;
  itemName: string;
  dim: Dimension;
  currentQtyBase: number;
  provenance: ProvenanceFields;
  onClose: () => void;
  onConfirm: (targetBase: number) => void | Promise<void>;
  busy?: boolean;
};

/**
 * Recount — absolute target via two wheels (qty · unit).
 * UI copy: “there is exactly this much” (snap to reality).
 * No add/remove wheel — direction is meaningless for an absolute statement.
 */
export function RecountSheet({
  open,
  itemName,
  dim,
  currentQtyBase,
  provenance,
  onClose,
  onConfirm,
  busy,
}: RecountSheetProps) {
  const [outcome, setOutcome] = useState<PickerOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentDisplay = formatItemQuantity(
    currentQtyBase,
    dim,
    provenance,
  );

  async function submit() {
    if (!outcome || outcome.mode !== 'recount') {
      setError('Choose the exact amount on hand');
      return;
    }
    if (outcome.qtyBase < 0) {
      setError('Recount cannot be negative — use adjust if needed');
      return;
    }
    setError(null);
    await onConfirm(outcome.qtyBase);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Recount"
      subtitle={`Set the exact amount of ${itemName} you have right now.`}
      footer={
        <>
          <PrimaryButton
            onClick={() => void submit()}
            disabled={busy}
            data-testid="recount-confirm"
          >
            {busy ? 'Saving…' : 'Set exact amount'}
          </PrimaryButton>
          <SecondaryButton onClick={onClose} disabled={busy}>
            Cancel
          </SecondaryButton>
        </>
      }
    >
      <p className="mb-4 rounded-2xl bg-tint-tan/60 px-3 py-2 text-sm text-ink">
        <strong className="font-semibold">Recount</strong> says “there is{' '}
        <em>exactly</em> this much” — a snapshot of reality on the shelf. It
        replaces the previous total and re-verifies confidence. For a small
        change like “I used a bit,” use <strong className="font-semibold">Adjust</strong>.
      </p>
      <p className="mb-3 text-sm text-ink-muted">
        Currently showing: <span className="font-medium text-ink">{currentDisplay}</span>
      </p>

      <QuantityPickerWheels
        mode="recount"
        dim={dim}
        itemName={itemName}
        currentQtyBase={currentQtyBase}
        resetKey={open}
        onOutcomeChange={setOutcome}
      />

      {error ? (
        <p className="mt-2 text-sm text-critical" role="alert">
          {error}
        </p>
      ) : (
        <p className="mt-2 text-xs text-ink-muted">
          This writes an absolute ledger event, not a relative delta.
        </p>
      )}
    </Sheet>
  );
}
