import type { Dimension } from '@larder/core';
import { useState } from 'react';

import type { ProvenanceFields } from '../lib/provenance-display';
import { formatItemQuantity } from '../lib/provenance-display';
import { parseHumanQuantity } from '../lib/qty-input';
import {
  FieldInput,
  FieldLabel,
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
 * Recount — absolute target.
 * UI copy: “there is exactly this much” (snap to reality).
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
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const currentDisplay = formatItemQuantity(
    currentQtyBase,
    dim,
    provenance,
  );

  const unitHint =
    dim === 'mass' ? 'e.g. 1.5 lb or 500 g' : dim === 'volume' ? 'e.g. 2 cups or 500 ml' : 'e.g. 6 each';

  async function submit() {
    const parsed = parseHumanQuantity(text, dim);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    if (parsed.qtyBase < 0) {
      setError('Recount cannot be negative — use adjust if needed');
      return;
    }
    setError(null);
    await onConfirm(parsed.qtyBase);
    setText('');
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Recount"
      subtitle={`Set the exact amount of ${itemName} you have right now.`}
      footer={
        <>
          <PrimaryButton onClick={() => void submit()} disabled={busy}>
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
      <FieldLabel htmlFor="recount-qty">Exact amount on hand</FieldLabel>
      <FieldInput
        id="recount-qty"
        inputMode="text"
        autoComplete="off"
        placeholder={unitHint}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-invalid={error ? true : undefined}
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
