import type { Dimension } from '@larder/core';
import { useState } from 'react';

import { parseHumanDelta } from '../lib/qty-input';
import {
  FieldInput,
  FieldLabel,
  PrimaryButton,
  SecondaryButton,
  Sheet,
} from './Sheet';

type AdjustSheetProps = {
  open: boolean;
  itemName: string;
  dim: Dimension;
  onClose: () => void;
  onConfirm: (deltaBase: number) => void | Promise<void>;
  busy?: boolean;
};

/**
 * Adjust quantity — relative delta.
 * Copy makes the semantics clear: "add or remove this much", not "set to".
 */
export function AdjustSheet({
  open,
  itemName,
  dim,
  onClose,
  onConfirm,
  busy,
}: AdjustSheetProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const unitHint =
    dim === 'mass' ? 'e.g. +2 oz or −100 g' : dim === 'volume' ? 'e.g. +1 cup or −50 ml' : 'e.g. +2 or −1 each';

  async function submit() {
    const parsed = parseHumanDelta(text, dim);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    if (parsed.qtyBase === 0) {
      setError('Enter a non-zero amount');
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
      title="Adjust quantity"
      subtitle={`Add or remove some ${itemName}. This does not set an exact total.`}
      footer={
        <>
          <PrimaryButton onClick={() => void submit()} disabled={busy}>
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
      <FieldLabel htmlFor="adjust-qty">Amount to add (+) or remove (−)</FieldLabel>
      <FieldInput
        id="adjust-qty"
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
        <p className="mt-2 text-xs text-ink-muted">Unit must match this item ({dim}).</p>
      )}
    </Sheet>
  );
}
