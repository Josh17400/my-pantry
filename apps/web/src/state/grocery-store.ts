/**
 * Zustand grocery store — `useGrocery()` for screens.
 */

import { create } from 'zustand';

import type {
  GroceryListItemInput,
  GroceryListItemRow,
  GroceryListView,
} from '../db/types';
import { DEFAULT_HOUSEHOLD_ID } from '../db/constants';
import { getDomainRepository } from './repo-context';

export type GroceryState = {
  list: GroceryListView | null;
  loading: boolean;
  error: string | null;
  householdId: string;

  setHouseholdId: (id: string) => void;
  load: (listId?: string) => Promise<void>;
  create: (items?: readonly GroceryListItemInput[]) => Promise<GroceryListView | null>;
  updateItems: (items: readonly GroceryListItemInput[]) => Promise<void>;
  checkOff: (itemId: string, checked: boolean) => Promise<GroceryListItemRow | null>;
  clearError: () => void;
};

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const useGroceryStore = create<GroceryState>((set, get) => ({
  list: null,
  loading: false,
  error: null,
  householdId: DEFAULT_HOUSEHOLD_ID,

  setHouseholdId: (id) => set({ householdId: id }),
  clearError: () => set({ error: null }),

  load: async (listId) => {
    set({ loading: true, error: null });
    try {
      const domain = getDomainRepository();
      const list =
        listId != null
          ? await domain.getGroceryList(listId)
          : await domain.getActiveGroceryList(get().householdId);
      set({ list, loading: false });
    } catch (err) {
      set({ loading: false, error: errMessage(err) });
    }
  },

  create: async (items) => {
    set({ loading: true, error: null });
    try {
      const list = await getDomainRepository().createGroceryList({
        householdId: get().householdId,
        items,
      });
      set({ list, loading: false });
      return list;
    } catch (err) {
      set({ loading: false, error: errMessage(err) });
      return null;
    }
  },

  updateItems: async (items) => {
    const current = get().list;
    if (!current) {
      set({ error: 'No grocery list loaded' });
      return;
    }
    set({ loading: true, error: null });
    try {
      const list = await getDomainRepository().updateGroceryListItems(
        current.id,
        items,
      );
      set({ list, loading: false });
    } catch (err) {
      set({ loading: false, error: errMessage(err) });
    }
  },

  checkOff: async (itemId, checked) => {
    set({ loading: true, error: null });
    try {
      const domain = getDomainRepository();
      const row = await domain.checkOffGroceryItem(itemId, checked);
      const listId = get().list?.id;
      const list = listId
        ? await domain.getGroceryList(listId)
        : await domain.getActiveGroceryList(get().householdId);
      set({ list, loading: false });
      return row;
    } catch (err) {
      set({ loading: false, error: errMessage(err) });
      return null;
    }
  },
}));

export function useGrocery(): GroceryState {
  return useGroceryStore();
}
