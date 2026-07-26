/**
 * Learned user aliases — store-string → ingredient so next scan auto-resolves.
 * Household-scoped; never auto-promoted to global (core promote rules).
 */

import type { IngredientAlias } from './core-imports';

const STORAGE_KEY = 'tgp.receipt.user-aliases.v1';

export type AliasStore = {
  list(householdId: string): IngredientAlias[];
  learn(input: {
    alias: string;
    ingredientId: string;
    householdId: string;
  }): IngredientAlias;
  clear(): void;
};

type StoredAlias = {
  alias: string;
  ingredientId: string;
  householdId: string;
};

function readAll(): StoredAlias[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is StoredAlias =>
        typeof v === 'object' &&
        v !== null &&
        typeof (v as StoredAlias).alias === 'string' &&
        typeof (v as StoredAlias).ingredientId === 'string' &&
        typeof (v as StoredAlias).householdId === 'string',
    );
  } catch {
    return [];
  }
}

function writeAll(rows: readonly StoredAlias[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // ignore
  }
}

function toAlias(row: StoredAlias): IngredientAlias {
  return {
    alias: row.alias,
    ingredientId: row.ingredientId,
    scope: 'user',
    householdId: row.householdId,
  };
}

export const localAliasStore: AliasStore = {
  list: (householdId) =>
    readAll()
      .filter((r) => r.householdId === householdId)
      .map(toAlias),
  learn: ({ alias, ingredientId, householdId }) => {
    const key = alias.trim().toLowerCase();
    const rest = readAll().filter(
      (r) =>
        !(
          r.householdId === householdId &&
          r.alias.trim().toLowerCase() === key
        ),
    );
    const row: StoredAlias = {
      alias: alias.trim(),
      ingredientId,
      householdId,
    };
    writeAll([...rest, row]);
    return toAlias(row);
  },
  clear: () => {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
  },
};

export function createMemoryAliasStore(
  initial: readonly StoredAlias[] = [],
): AliasStore {
  let rows = [...initial];
  return {
    list: (householdId) =>
      rows.filter((r) => r.householdId === householdId).map(toAlias),
    learn: ({ alias, ingredientId, householdId }) => {
      const key = alias.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          !(
            r.householdId === householdId &&
            r.alias.trim().toLowerCase() === key
          ),
      );
      const row: StoredAlias = {
        alias: alias.trim(),
        ingredientId,
        householdId,
      };
      rows.push(row);
      return toAlias(row);
    },
    clear: () => {
      rows = [];
    },
  };
}
