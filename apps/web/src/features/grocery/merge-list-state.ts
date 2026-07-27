/**
 * Preserve user intent across grocery list rebuilds.
 * Stock-driven rebuilds must not clobber check-off or wipe manual adds.
 */

export type CheckableLine = {
  ingredientId?: string | null;
  formId?: string | null;
  name: string;
  checked?: boolean;
};

/** Stable key for matching lines across rebuilds (catalog id preferred). */
export function lineMatchKey(line: CheckableLine): string {
  return `${line.ingredientId ?? line.name}|${line.formId ?? ''}`;
}

/**
 * Merge checked flags from in-memory rows and persisted list rows.
 * Later sources win only when true (once checked, stays checked unless both false).
 */
export function mergeCheckedMap(
  ...sources: readonly (readonly CheckableLine[])[]
): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const rows of sources) {
    for (const row of rows) {
      if (!row.checked) continue;
      map.set(lineMatchKey(row), true);
    }
  }
  return map;
}

/** Apply a checked map onto built inputs (by match key). */
export function applyCheckedToInputs<
  T extends {
    ingredientId?: string | null;
    formId?: string | null;
    name: string;
    checked?: boolean;
  },
>(inputs: readonly T[], checked: ReadonlyMap<string, boolean>): T[] {
  return inputs.map((input) => {
    const key = lineMatchKey(input);
    return { ...input, checked: checked.get(key) === true };
  });
}

/**
 * Max rebuilds expected for a single stock write when the grocery screen is live.
 * Mount refresh + revision-driven refresh + optional focus = well under this.
 * Used by tests to assert rebuilds do not recurse.
 */
export const MAX_REBUILDS_PER_STOCK_CHANGE = 3;
