import { useMemo, useState } from 'react';

import { cn } from '../../ui/cn';
import { searchCatalogIngredients } from './catalog';
import { AllergenUnknownBadge } from './AllergenUnknownBadge';

export type EditableIngredientLine = {
  key: string;
  rawText: string;
  ingredientId?: string;
  formId?: string;
  qty: string;
  unit: string;
  optional: boolean;
  nonQuantified: boolean;
  unknownAllergens: boolean;
};

type IngredientLineEditorProps = {
  line: EditableIngredientLine;
  onChange: (next: EditableIngredientLine) => void;
  onRemove: () => void;
};

export function IngredientLineEditor({
  line,
  onChange,
  onRemove,
}: IngredientLineEditorProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const hits = useMemo(
    () => (open ? searchCatalogIngredients(query || line.rawText, 8) : []),
    [open, query, line.rawText],
  );

  const pickCatalog = (id: string, name: string, defaultFormId: string) => {
    onChange({
      ...line,
      ingredientId: id,
      formId: defaultFormId,
      rawText: line.rawText.trim() || name,
      unknownAllergens: false,
    });
    setOpen(false);
    setQuery('');
  };

  const markFreeText = (rawText: string) => {
    // Free-text that doesn't resolve → unknown allergens (unsafe).
    onChange({
      ...line,
      rawText,
      ingredientId: undefined,
      formId: undefined,
      unknownAllergens: true,
    });
  };

  return (
    <div className="rounded-card border border-black/[0.06] bg-surface p-3 shadow-card">
      <div className="mb-2 flex items-start justify-between gap-2">
        <label className="flex-1 text-xs font-medium text-ink-muted">
          Ingredient
          <input
            type="text"
            value={line.rawText}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              setOpen(true);
              if (line.ingredientId) {
                onChange({ ...line, rawText: v });
              } else {
                markFreeText(v);
              }
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              // Delay so pick can register
              window.setTimeout(() => setOpen(false), 150);
              if (!line.ingredientId && line.rawText.trim()) {
                markFreeText(line.rawText);
              }
            }}
            placeholder="Search catalog or type free text"
            className={cn(
              'mt-1 min-h-tap w-full rounded-xl border border-black/[0.08] bg-surface-raised px-3 text-sm text-ink',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
            )}
          />
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="min-h-tap min-w-tap text-sm text-critical"
          aria-label="Remove ingredient"
        >
          ✕
        </button>
      </div>

      {open && hits.length > 0 ? (
        <ul className="mb-2 max-h-40 overflow-y-auto rounded-xl border border-black/[0.06] bg-surface-raised">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="flex min-h-tap w-full items-center px-3 text-left text-sm text-ink hover:bg-bg"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickCatalog(h.id, h.name, h.defaultFormId)}
              >
                <span className="font-medium">{h.name}</span>
                <span className="ml-2 text-xs text-ink-muted">{h.category}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {line.unknownAllergens || !line.ingredientId ? (
        <div className="mb-2">
          <AllergenUnknownBadge compact />
        </div>
      ) : (
        <p className="mb-2 text-xs text-fresh">Linked to catalog</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-medium text-ink-muted">
          Qty
          <input
            type="text"
            inputMode="decimal"
            value={line.qty}
            disabled={line.nonQuantified}
            onChange={(e) => onChange({ ...line, qty: e.target.value })}
            className={cn(
              'mt-1 min-h-tap w-full rounded-xl border border-black/[0.08] bg-surface-raised px-3 text-sm',
              'disabled:opacity-50',
            )}
          />
        </label>
        <label className="text-xs font-medium text-ink-muted">
          Unit
          <input
            type="text"
            value={line.unit}
            disabled={line.nonQuantified}
            onChange={(e) => onChange({ ...line, unit: e.target.value })}
            placeholder="g, ml, each…"
            className={cn(
              'mt-1 min-h-tap w-full rounded-xl border border-black/[0.08] bg-surface-raised px-3 text-sm',
              'disabled:opacity-50',
            )}
          />
        </label>
      </div>

      <div className="mt-2 flex flex-wrap gap-4">
        <label className="flex min-h-tap items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={line.optional}
            onChange={(e) => onChange({ ...line, optional: e.target.checked })}
            className="h-5 w-5 accent-primary"
          />
          Optional
        </label>
        <label className="flex min-h-tap items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={line.nonQuantified}
            onChange={(e) =>
              onChange({
                ...line,
                nonQuantified: e.target.checked,
                qty: e.target.checked ? '' : line.qty,
                unit: e.target.checked ? '' : line.unit,
              })
            }
            className="h-5 w-5 accent-primary"
          />
          To taste / non-quantified
        </label>
      </div>
    </div>
  );
}

export function emptyIngredientLine(key: string): EditableIngredientLine {
  return {
    key,
    rawText: '',
    qty: '',
    unit: '',
    optional: false,
    nonQuantified: false,
    unknownAllergens: true,
  };
}
