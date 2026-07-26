/**
 * Zustand pantry store — screens use `usePantry()`, never the DB directly.
 */

import { create } from 'zustand';

import { DEFAULT_HOUSEHOLD_ID } from '../db/constants';
import type { AppendTxnInput, PantryItemUpsert, PantryItemView } from '../db/types';
import { getDomainRepository } from './repo-context';

export type PantryState = {
  items: PantryItemView[];
  selected: PantryItemView | null;
  loading: boolean;
  error: string | null;
  householdId: string;

  setHouseholdId: (id: string) => void;
  load: () => Promise<void>;
  loadByLocation: (locationId: string) => Promise<void>;
  search: (query: string) => Promise<void>;
  getOne: (
    ingredientId: string,
    formId: string,
  ) => Promise<PantryItemView | null>;
  upsert: (item: PantryItemUpsert) => Promise<void>;
  appendTxn: (txn: AppendTxnInput) => Promise<void>;
  clearError: () => void;
};

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const usePantryStore = create<PantryState>((set, get) => ({
  items: [],
  selected: null,
  loading: false,
  error: null,
  householdId: DEFAULT_HOUSEHOLD_ID,

  setHouseholdId: (id) => set({ householdId: id }),

  clearError: () => set({ error: null }),

  load: async () => {
    set({ loading: true, error: null });
    try {
      const items = await getDomainRepository().listPantryItems(get().householdId);
      set({ items, loading: false });
    } catch (err) {
      set({ loading: false, error: errMessage(err) });
    }
  },

  loadByLocation: async (locationId) => {
    set({ loading: true, error: null });
    try {
      const items = await getDomainRepository().listPantryByLocation(
        locationId,
        get().householdId,
      );
      set({ items, loading: false });
    } catch (err) {
      set({ loading: false, error: errMessage(err) });
    }
  },

  search: async (query) => {
    set({ loading: true, error: null });
    try {
      const items = await getDomainRepository().searchPantryByName(
        query,
        get().householdId,
      );
      set({ items, loading: false });
    } catch (err) {
      set({ loading: false, error: errMessage(err) });
    }
  },

  getOne: async (ingredientId, formId) => {
    set({ loading: true, error: null });
    try {
      const selected = await getDomainRepository().getPantryItem(
        ingredientId,
        formId,
        get().householdId,
      );
      set({ selected, loading: false });
      return selected;
    } catch (err) {
      set({ loading: false, error: errMessage(err) });
      return null;
    }
  },

  upsert: async (item) => {
    set({ loading: true, error: null });
    try {
      await getDomainRepository().upsertPantryItem(item);
      const items = await getDomainRepository().listPantryItems(get().householdId);
      set({ items, loading: false });
    } catch (err) {
      set({ loading: false, error: errMessage(err) });
    }
  },

  appendTxn: async (txn) => {
    set({ loading: true, error: null });
    try {
      await getDomainRepository().appendTxn(txn);
      const items = await getDomainRepository().listPantryItems(get().householdId);
      set({ items, loading: false });
    } catch (err) {
      set({ loading: false, error: errMessage(err) });
    }
  },
}));

/** Screen hook — pantry list + actions. */
export function usePantry(): PantryState {
  return usePantryStore();
}
