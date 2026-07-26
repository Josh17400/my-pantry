import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { newId } from '../db/id';
import type { RecipeLineInput, RecipeStepInput, RecipeWrite } from '../db/types';
import {
  type EditableIngredientLine,
  emptyIngredientLine,
  ErrorBlock,
  IngredientLineEditor,
  LoadingBlock,
} from '../features/recipes';
import { hasActiveRepository, useRecipes } from '../state';
import { cn } from '../ui/cn';

/**
 * Create / edit recipe — catalog search or free text (unknown allergens flagged).
 */
export function RecipeEditPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { current, loading, error, get, create, update, clearError } =
    useRecipes();

  const [title, setTitle] = useState('');
  const [servings, setServings] = useState(4);
  const [prepMin, setPrepMin] = useState('');
  const [cookMin, setCookMin] = useState('');
  const [lines, setLines] = useState<EditableIngredientLine[]>([
    emptyIngredientLine(newId('line')),
  ]);
  const [steps, setSteps] = useState<string[]>(['']);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (isNew || !id || !hasActiveRepository()) return;
    const d = await get(id);
    if (!d) return;
    setTitle(d.title);
    setServings(d.servings);
    setPrepMin(d.prepMin != null ? String(d.prepMin) : '');
    setCookMin(d.cookMin != null ? String(d.cookMin) : '');
    setLines(
      d.ingredients.length > 0
        ? d.ingredients.map((ing) => ({
            key: ing.id,
            rawText: ing.rawText,
            ingredientId: ing.ingredientId,
            formId: ing.formId,
            qty: ing.qty != null ? String(ing.qty) : '',
            unit: ing.unit ?? '',
            optional: Boolean(ing.optional),
            nonQuantified: Boolean(ing.nonQuantified),
            unknownAllergens:
              Boolean(ing.unknownAllergens) || !ing.ingredientId,
          }))
        : [emptyIngredientLine(newId('line'))],
    );
    setSteps(
      d.steps.length > 0 ? d.steps.map((s) => s.text) : [''],
    );
  }, [id, isNew, get]);

  useEffect(() => {
    void load();
  }, [load]);

  const toWrite = (): RecipeWrite | null => {
    const t = title.trim();
    if (!t) {
      setFormError('Title is required.');
      return null;
    }
    if (!Number.isFinite(servings) || servings <= 0) {
      setFormError('Servings must be greater than zero.');
      return null;
    }

    const ingredients: RecipeLineInput[] = lines
      .filter((l) => l.rawText.trim())
      .map((l) => {
        const resolved = Boolean(l.ingredientId);
        const nonQuantified = l.nonQuantified || (!l.qty && !l.unit);
        const qtyNum =
          nonQuantified || l.qty === '' ? null : Number(l.qty);
        return {
          ingredientId: l.ingredientId,
          formId: l.formId,
          rawText: l.rawText.trim(),
          qty: qtyNum !== null && Number.isFinite(qtyNum) ? qtyNum : null,
          unit: nonQuantified ? null : l.unit.trim() || null,
          optional: l.optional,
          nonQuantified,
          // Safety: free-text / unresolved → unknown allergens, never "clear"
          unknownAllergens: !resolved || l.unknownAllergens,
        };
      });

    if (ingredients.length === 0) {
      setFormError('Add at least one ingredient.');
      return null;
    }

    const stepInputs: RecipeStepInput[] = steps
      .map((s) => s.trim())
      .filter(Boolean)
      .map((text) => ({ text }));

    if (stepInputs.length === 0) {
      setFormError('Add at least one step.');
      return null;
    }

    return {
      title: t,
      servings,
      prepMin: prepMin === '' ? null : Number(prepMin),
      cookMin: cookMin === '' ? null : Number(cookMin),
      ingredients,
      steps: stepInputs,
      visibility: 'private',
    };
  };

  const onSave = async () => {
    setFormError(null);
    const write = toWrite();
    if (!write) return;
    if (!hasActiveRepository()) {
      setFormError('Data layer not ready.');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = await create(write);
        if (created) void navigate(`/recipes/${created.id}`, { replace: true });
        else setFormError('Failed to create recipe.');
      } else if (id) {
        const updated = await update(id, write);
        if (updated) void navigate(`/recipes/${updated.id}`, { replace: true });
        else setFormError('Failed to update recipe.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (!hasActiveRepository()) {
    return (
      <div className="mx-auto max-w-lg pb-24">
        <ErrorBlock message="Data layer not ready." />
      </div>
    );
  }

  if (!isNew && loading && current?.id !== id) {
    return (
      <div className="mx-auto max-w-lg pb-24">
        <LoadingBlock label="Loading recipe…" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg pb-28">
      <nav className="mb-3">
        <Link
          to={isNew ? '/recipes' : `/recipes/${id}`}
          className="inline-flex min-h-tap items-center text-sm font-medium text-primary"
        >
          ← Cancel
        </Link>
      </nav>

      <h1 className="mb-5 font-display text-2xl font-semibold text-ink">
        {isNew ? 'New recipe' : 'Edit recipe'}
      </h1>

      {error ? (
        <div className="mb-4">
          <ErrorBlock message={error} onRetry={() => clearError()} />
        </div>
      ) : null}
      {formError ? (
        <p role="alert" className="mb-4 text-sm text-critical">
          {formError}
        </p>
      ) : null}

      <label className="mb-4 block text-xs font-medium text-ink-muted">
        Title
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 min-h-tap w-full rounded-xl border border-black/[0.08] bg-surface px-3 text-sm text-ink shadow-card"
        />
      </label>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <label className="text-xs font-medium text-ink-muted">
          Servings
          <input
            type="number"
            min={1}
            value={servings}
            onChange={(e) => setServings(Number(e.target.value) || 1)}
            className="mt-1 min-h-tap w-full rounded-xl border border-black/[0.08] bg-surface px-3 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-ink-muted">
          Prep (min)
          <input
            type="number"
            min={0}
            value={prepMin}
            onChange={(e) => setPrepMin(e.target.value)}
            className="mt-1 min-h-tap w-full rounded-xl border border-black/[0.08] bg-surface px-3 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-ink-muted">
          Cook (min)
          <input
            type="number"
            min={0}
            value={cookMin}
            onChange={(e) => setCookMin(e.target.value)}
            className="mt-1 min-h-tap w-full rounded-xl border border-black/[0.08] bg-surface px-3 text-sm"
          />
        </label>
      </div>

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">
            Ingredients
          </h2>
          <button
            type="button"
            className="min-h-tap text-sm font-medium text-primary"
            onClick={() =>
              setLines((prev) => [...prev, emptyIngredientLine(newId('line'))])
            }
          >
            + Add
          </button>
        </div>
        <div className="space-y-3">
          {lines.map((line, i) => (
            <IngredientLineEditor
              key={line.key}
              line={line}
              onChange={(next) =>
                setLines((prev) => prev.map((l, j) => (j === i ? next : l)))
              }
              onRemove={() =>
                setLines((prev) =>
                  prev.length <= 1
                    ? prev
                    : prev.filter((_, j) => j !== i),
                )
              }
            />
          ))}
        </div>
      </section>

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">Steps</h2>
          <button
            type="button"
            className="min-h-tap text-sm font-medium text-primary"
            onClick={() => setSteps((prev) => [...prev, ''])}
          >
            + Add
          </button>
        </div>
        <div className="space-y-2">
          {steps.map((step, i) => (
            <div key={i} className="flex gap-2">
              <span className="mt-3 text-sm font-medium text-ink-muted">
                {i + 1}.
              </span>
              <textarea
                value={step}
                onChange={(e) =>
                  setSteps((prev) =>
                    prev.map((s, j) => (j === i ? e.target.value : s)),
                  )
                }
                rows={2}
                className="min-h-tap w-full rounded-xl border border-black/[0.08] bg-surface px-3 py-2 text-sm text-ink shadow-card"
              />
            </div>
          ))}
        </div>
      </section>

      <div className="fixed bottom-0 left-0 right-0 border-t border-black/[0.04] bg-surface-raised/95 px-4 py-3 pb-safe backdrop-blur">
        <div className="mx-auto max-w-lg">
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave()}
            className={cn(
              'min-h-tap w-full rounded-pill bg-primary text-sm font-semibold text-white',
              'disabled:opacity-50',
            )}
          >
            {saving ? 'Saving…' : isNew ? 'Create recipe' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
