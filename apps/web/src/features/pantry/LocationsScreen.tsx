import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import type { LocationRow } from '../../db/types';
import { hasActiveRepository, useLocations } from '../../state';
import { useSheetLifecycle, Z_CLASS } from '../../ui';
import { Card } from '../../ui/Card';
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
} from './components/AsyncState';
import {
  FieldInput,
  FieldLabel,
  FieldSelect,
  PrimaryButton,
  SecondaryButton,
  Sheet,
} from './components/Sheet';

const ICON_OPTIONS = [
  { value: 'fridge', label: 'Fridge' },
  { value: 'pantry', label: 'Pantry' },
  { value: 'home', label: 'Home' },
  { value: 'spice', label: 'Spice' },
  { value: 'mug', label: 'Mug' },
  { value: 'whisk', label: 'Baking' },
  { value: 'broom', label: 'Household' },
  { value: 'box', label: 'Box' },
  { value: 'snow', label: 'Freezer' },
  { value: 'drawer', label: 'Drawer' },
] as const;

const TINT_OPTIONS = [
  { value: '#6B8F9C', label: 'Sky blue' },
  { value: '#C4A574', label: 'Tan' },
  { value: '#8B9A7D', label: 'Sage' },
  { value: '#B85C38', label: 'Spice' },
  { value: '#6F4E37', label: 'Coffee' },
  { value: '#D4A5A5', label: 'Blush' },
  { value: '#7A8B8B', label: 'Slate' },
  { value: '#CCD4BC', label: 'Soft sage' },
  { value: '#E0D8C0', label: 'Cream tan' },
  { value: '#CCD4D4', label: 'Mist' },
] as const;

const ICON_GLYPH: Record<string, string> = {
  fridge: '🧊',
  pantry: '🫙',
  home: '🏠',
  spice: '🌶️',
  mug: '☕',
  whisk: '🥣',
  broom: '🧹',
  box: '📦',
  snow: '❄️',
  drawer: '🗄️',
};

type FormMode = { kind: 'create' } | { kind: 'edit'; loc: LocationRow } | null;

function DeleteLocationDialog({
  location,
  busy,
  onConfirm,
  onCancel,
}: {
  location: LocationRow | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const open = location != null;
  useSheetLifecycle(open);
  if (!location) return null;

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-ink/30 p-4 ${Z_CLASS.sheet}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-loc-title"
      data-testid="app-sheet"
      data-sheet="true"
    >
      <Card padding="lg" className="w-full max-w-sm">
        <h2 id="delete-loc-title" className="font-display text-lg font-semibold">
          Delete {location.name}?
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          Items keep their data; they will show as unassigned until you move
          them.
        </p>
        <div className="mt-4 flex flex-col gap-2" data-testid="sheet-footer">
          <PrimaryButton
            className="!bg-critical"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Deleting…' : 'Delete'}
          </PrimaryButton>
          <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
        </div>
      </Card>
    </div>
  );
}

/**
 * Locations CRUD — user-defined, one-level nestable, icon + tint.
 * Not an enum: Garage Freezer / Office Drawer are valid.
 */
export function LocationsScreen() {
  const {
    locations,
    loading,
    error,
    list,
    create,
    update,
    remove,
    clearError,
    householdId,
  } = useLocations();

  const [mode, setMode] = useState<FormMode>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>('box');
  const [tint, setTint] = useState<string>(TINT_OPTIONS[2]!.value);
  const [parentId, setParentId] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<LocationRow | null>(null);

  const refresh = useCallback(async () => {
    clearError();
    await list();
  }, [clearError, list]);

  useEffect(() => {
    if (!hasActiveRepository()) return;
    void refresh();
  }, [refresh]);

  const roots = useMemo(
    () =>
      locations
        .filter((l) => !l.parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [locations],
  );

  const childrenOf = useCallback(
    (id: string) =>
      locations
        .filter((l) => l.parentId === id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [locations],
  );

  function openCreate(parent?: string) {
    setMode({ kind: 'create' });
    setName('');
    setIcon('box');
    setTint(TINT_OPTIONS[2]!.value);
    setParentId(parent ?? '');
    setFormError(null);
  }

  function openEdit(loc: LocationRow) {
    setMode({ kind: 'edit', loc });
    setName(loc.name);
    setIcon(loc.icon);
    setTint(loc.tint);
    setParentId(loc.parentId ?? '');
    setFormError(null);
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError('Name is required');
      return;
    }
    // One-level nesting: parent must be a root; children cannot be parents of parents.
    if (parentId) {
      const parent = locations.find((l) => l.id === parentId);
      if (!parent) {
        setFormError('Parent location not found');
        return;
      }
      if (parent.parentId) {
        setFormError('Locations nest only one level — pick a top-level parent');
        return;
      }
    }
    if (mode?.kind === 'edit' && parentId === mode.loc.id) {
      setFormError('A location cannot be its own parent');
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      if (mode?.kind === 'create') {
        await create({
          householdId,
          name: trimmed,
          icon,
          tint,
          parentId: parentId || null,
          sortOrder: locations.length,
        });
      } else if (mode?.kind === 'edit') {
        // Prevent turning a parent-with-children into a child (would be 2 levels).
        if (parentId) {
          const kids = childrenOf(mode.loc.id);
          if (kids.length > 0) {
            setFormError(
              'Move or remove nested locations first — only one level of nesting is allowed',
            );
            setBusy(false);
            return;
          }
        }
        await update(mode.loc.id, {
          name: trimmed,
          icon,
          tint,
          parentId: parentId || null,
        });
      }
      setMode(null);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteConfirm) return;
    const kids = childrenOf(deleteConfirm.id);
    if (kids.length > 0) {
      setFormError('Remove nested locations first');
      setDeleteConfirm(null);
      return;
    }
    setBusy(true);
    try {
      await remove(deleteConfirm.id);
      setDeleteConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  function renderLocRow(loc: LocationRow, nested: boolean) {
    return (
      <Card
        key={loc.id}
        padding="sm"
        className={nested ? 'ml-4' : undefined}
        style={{ borderLeft: `4px solid ${loc.tint}` }}
      >
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg"
            style={{ backgroundColor: `${loc.tint}55` }}
            aria-hidden
          >
            {ICON_GLYPH[loc.icon] ?? '📍'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink">{loc.name}</p>
            <p className="text-xs text-ink-muted">
              {loc.icon}
              {nested ? ' · nested' : ''}
            </p>
          </div>
          <button
            type="button"
            className="min-h-tap px-2 text-sm font-medium text-primary"
            onClick={() => openEdit(loc)}
          >
            Edit
          </button>
          <button
            type="button"
            className="min-h-tap px-2 text-sm font-medium text-critical"
            onClick={() => setDeleteConfirm(loc)}
          >
            Delete
          </button>
        </div>
      </Card>
    );
  }

  if (!hasActiveRepository()) {
    return (
      <EmptyBlock
        title="Locations unavailable"
        body="The data layer is not connected on this surface yet."
        action={
          <Link to="/pantry" className="text-sm font-medium text-primary">
            Back to pantry
          </Link>
        }
      />
    );
  }

  return (
    <div className="min-h-[100dvh] bg-bg pb-[max(2rem,env(safe-area-inset-bottom))] pt-safe-t">
      <header className="flex items-center gap-2 px-3 py-3">
        <Link
          to="/pantry"
          className="flex min-h-tap min-w-tap items-center justify-center rounded-full text-ink"
          aria-label="Back to pantry"
        >
          ←
        </Link>
        <h1 className="flex-1 font-display text-xl font-semibold text-ink">
          Locations
        </h1>
        <button
          type="button"
          onClick={() => openCreate()}
          className="min-h-tap rounded-pill bg-primary px-3 text-sm font-semibold text-white"
        >
          Add
        </button>
      </header>

      <div className="space-y-2 px-4">
        <p className="mb-3 text-sm text-ink-muted">
          Your places — Fridge, Freezer, Pantry. Nest one level under a root
          (Spices, Baking, and Household live under Pantry).
        </p>

        {loading && locations.length === 0 ? (
          <LoadingBlock label="Loading locations…" />
        ) : error ? (
          <ErrorBlock message={error} onRetry={() => void refresh()} />
        ) : locations.length === 0 ? (
          <EmptyBlock
            title="No locations yet"
            body="Add Fridge, Pantry, or anything you need — locations are not a fixed list."
            action={
              <button
                type="button"
                onClick={() => openCreate()}
                className="min-h-tap w-full rounded-pill bg-primary px-4 text-sm font-semibold text-white"
              >
                Add a location
              </button>
            }
          />
        ) : (
          roots.map((root) => (
            <div key={root.id} className="space-y-2">
              {renderLocRow(root, false)}
              {childrenOf(root.id).map((child) => renderLocRow(child, true))}
              <button
                type="button"
                onClick={() => openCreate(root.id)}
                className="ml-4 min-h-tap text-left text-sm font-medium text-primary"
              >
                + Nest under {root.name}
              </button>
            </div>
          ))
        )}
      </div>

      <Sheet
        open={mode !== null}
        title={mode?.kind === 'edit' ? 'Edit location' : 'New location'}
        subtitle="Icon and tint are decorative — meaning lives in the name."
        onClose={() => setMode(null)}
        footer={
          <>
            <PrimaryButton onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </PrimaryButton>
            <SecondaryButton onClick={() => setMode(null)} disabled={busy}>
              Cancel
            </SecondaryButton>
          </>
        }
      >
        <FieldLabel htmlFor="loc-name">Name</FieldLabel>
        <FieldInput
          id="loc-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Garage Freezer"
        />

        <div className="mt-4">
          <FieldLabel htmlFor="loc-icon">Icon</FieldLabel>
          <FieldSelect
            id="loc-icon"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
          >
            {ICON_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {ICON_GLYPH[o.value]} {o.label}
              </option>
            ))}
          </FieldSelect>
        </div>

        <div className="mt-4">
          <FieldLabel htmlFor="loc-tint">Tint</FieldLabel>
          <FieldSelect
            id="loc-tint"
            value={tint}
            onChange={(e) => setTint(e.target.value)}
          >
            {TINT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </FieldSelect>
          <div
            className="mt-2 h-8 rounded-xl"
            style={{ backgroundColor: tint }}
            aria-hidden
          />
        </div>

        <div className="mt-4">
          <FieldLabel htmlFor="loc-parent">Parent (optional)</FieldLabel>
          <FieldSelect
            id="loc-parent"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">None (top-level)</option>
            {roots
              .filter((r) => mode?.kind !== 'edit' || r.id !== mode.loc.id)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </FieldSelect>
        </div>

        {formError ? (
          <p className="mt-3 text-sm text-critical" role="alert">
            {formError}
          </p>
        ) : null}
      </Sheet>

      <DeleteLocationDialog
        location={deleteConfirm}
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
