import { useMemo, useState } from 'react';

import type { LocationRow } from '../../../db/types';
import {
  getCatalogIngredient,
  searchCatalog,
  type CatalogForm,
  type CatalogIngredient,
} from '../lib/catalog';
import { parseHumanQuantity } from '../lib/qty-input';
import {
  FieldInput,
  FieldLabel,
  FieldSelect,
  PrimaryButton,
  SecondaryButton,
  Sheet,
} from './Sheet';

type AddItemSheetProps = {
  open: boolean;
  locations: readonly LocationRow[];
  onClose: () => void;
  onConfirm: (input: {
    ingredientId: string;
    formId: string;
    qtyBase: number;
    dim: CatalogForm['dim'];
    locationId: string;
    ingredientName: string;
  }) => void | Promise<void>;
  busy?: boolean;
  defaultLocationId?: string | null;
};

type Step = 'search' | 'details';

/**
 * Manual add: search seed catalog → form + qty + location → purchase txn.
 */
export function AddItemSheet({
  open,
  locations,
  onClose,
  onConfirm,
  busy,
  defaultLocationId,
}: AddItemSheetProps) {
  const [step, setStep] = useState<Step>('search');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<CatalogIngredient | null>(null);
  const [formId, setFormId] = useState('');
  const [qtyText, setQtyText] = useState('');
  const [locationId, setLocationId] = useState(defaultLocationId ?? '');
  const [error, setError] = useState<string | null>(null);

  const results = useMemo(() => searchCatalog(query, 30), [query]);

  const form: CatalogForm | undefined = picked?.forms.find((f) => f.id === formId);

  function reset() {
    setStep('search');
    setQuery('');
    setPicked(null);
    setFormId('');
    setQtyText('');
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function pickIngredient(ing: CatalogIngredient) {
    setPicked(ing);
    const def =
      ing.forms.find((f) => f.id === ing.defaultFormId) ?? ing.forms[0];
    setFormId(def?.id ?? '');
    setStep('details');
    setError(null);
    if (!locationId && locations[0]) {
      setLocationId(locations[0].id);
    }
  }

  async function submit() {
    if (!picked || !form) {
      setError('Pick a form');
      return;
    }
    if (!locationId) {
      setError('Choose a location');
      return;
    }
    const parsed = parseHumanQuantity(qtyText, form.dim);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    if (parsed.qtyBase <= 0) {
      setError('Quantity must be greater than zero');
      return;
    }
    setError(null);
    await onConfirm({
      ingredientId: picked.id,
      formId: form.id,
      qtyBase: parsed.qtyBase,
      dim: form.dim,
      locationId,
      ingredientName: picked.name,
    });
    reset();
  }

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title="Add item"
      subtitle={
        step === 'search'
          ? 'Search the ingredient catalog'
          : `Adding ${picked?.name ?? 'item'}`
      }
      footer={
        step === 'details' ? (
          <>
            <PrimaryButton onClick={() => void submit()} disabled={busy}>
              {busy ? 'Adding…' : 'Add to pantry'}
            </PrimaryButton>
            <SecondaryButton
              onClick={() => {
                setStep('search');
                setError(null);
              }}
              disabled={busy}
            >
              Back to search
            </SecondaryButton>
          </>
        ) : (
          <SecondaryButton onClick={handleClose}>Cancel</SecondaryButton>
        )
      }
    >
      {step === 'search' ? (
        <>
          <FieldLabel htmlFor="catalog-search">Ingredient</FieldLabel>
          <FieldInput
            id="catalog-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Flour, olive oil, eggs…"
            autoFocus
          />
          <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
            {results.map((ing) => (
              <li key={ing.id}>
                <button
                  type="button"
                  className="flex min-h-tap w-full items-center justify-between rounded-2xl px-3 py-2 text-left hover:bg-bg"
                  onClick={() => pickIngredient(ing)}
                >
                  <span className="font-medium text-ink">{ing.name}</span>
                  <span className="text-xs text-ink-muted">{ing.category}</span>
                </button>
              </li>
            ))}
            {results.length === 0 ? (
              <li className="px-2 py-4 text-sm text-ink-muted">
                No matches. Try another name.
              </li>
            ) : null}
          </ul>
        </>
      ) : (
        <>
          <FieldLabel htmlFor="add-form">Form</FieldLabel>
          <FieldSelect
            id="add-form"
            value={formId}
            onChange={(e) => setFormId(e.target.value)}
          >
            {(picked?.forms ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.form} ({f.dim})
              </option>
            ))}
          </FieldSelect>

          <div className="mt-4">
            <FieldLabel htmlFor="add-qty">Quantity</FieldLabel>
            <FieldInput
              id="add-qty"
              value={qtyText}
              onChange={(e) => setQtyText(e.target.value)}
              placeholder={
                form?.dim === 'mass'
                  ? 'e.g. 2 lb'
                  : form?.dim === 'volume'
                    ? 'e.g. 500 ml'
                    : 'e.g. 12 each'
              }
            />
          </div>

          <div className="mt-4">
            <FieldLabel htmlFor="add-loc">Location</FieldLabel>
            <FieldSelect
              id="add-loc"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              <option value="">Choose…</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.parentId
                    ? `↳ ${loc.name}`
                    : loc.name}
                </option>
              ))}
            </FieldSelect>
          </div>

          {error ? (
            <p className="mt-3 text-sm text-critical" role="alert">
              {error}
            </p>
          ) : (
            <p className="mt-3 text-xs text-ink-muted">
              Writes a purchase on the ledger and re-verifies stock.
            </p>
          )}
        </>
      )}
    </Sheet>
  );
}

// re-export helper for tests / edge cases
export { getCatalogIngredient };
