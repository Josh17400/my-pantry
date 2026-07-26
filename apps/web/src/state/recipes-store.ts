/**
 * Zustand recipes store — `useRecipes()` for screens.
 */

import { create } from 'zustand';

import type { RecipeDetail, RecipeSummary, RecipeWrite } from '../db/types';
import { DEFAULT_HOUSEHOLD_ID } from '../db/constants';
import { getDomainRepository } from './repo-context';

export type RecipesState = {
  recipes: RecipeSummary[];
  current: RecipeDetail | null;
  loading: boolean;
  error: string | null;
  householdId: string;

  setHouseholdId: (id: string) => void;
  list: () => Promise<void>;
  get: (id: string) => Promise<RecipeDetail | null>;
  create: (recipe: RecipeWrite) => Promise<RecipeDetail | null>;
  update: (id: string, recipe: RecipeWrite) => Promise<RecipeDetail | null>;
  remove: (id: string) => Promise<void>;
  clearError: () => void;
};

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const useRecipesStore = create<RecipesState>((set, get) => ({
  recipes: [],
  current: null,
  loading: false,
  error: null,
  householdId: DEFAULT_HOUSEHOLD_ID,

  setHouseholdId: (id) => set({ householdId: id }),
  clearError: () => set({ error: null }),

  list: async () => {
    set({ loading: true, error: null });
    try {
      const recipes = await getDomainRepository().listRecipes(get().householdId);
      set({ recipes, loading: false });
    } catch (err) {
      set({ loading: false, error: errMessage(err) });
    }
  },

  get: async (id) => {
    set({ loading: true, error: null });
    try {
      const current = await getDomainRepository().getRecipe(id);
      set({ current, loading: false });
      return current;
    } catch (err) {
      set({ loading: false, error: errMessage(err) });
      return null;
    }
  },

  create: async (recipe) => {
    set({ loading: true, error: null });
    try {
      const created = await getDomainRepository().createRecipe({
        ...recipe,
        householdId: recipe.householdId ?? get().householdId,
      });
      const recipes = await getDomainRepository().listRecipes(get().householdId);
      set({ recipes, current: created, loading: false });
      return created;
    } catch (err) {
      set({ loading: false, error: errMessage(err) });
      return null;
    }
  },

  update: async (id, recipe) => {
    set({ loading: true, error: null });
    try {
      const updated = await getDomainRepository().updateRecipe(id, recipe);
      const recipes = await getDomainRepository().listRecipes(get().householdId);
      set({ recipes, current: updated, loading: false });
      return updated;
    } catch (err) {
      set({ loading: false, error: errMessage(err) });
      return null;
    }
  },

  remove: async (id) => {
    set({ loading: true, error: null });
    try {
      await getDomainRepository().deleteRecipe(id);
      const recipes = await getDomainRepository().listRecipes(get().householdId);
      set({
        recipes,
        current: get().current?.id === id ? null : get().current,
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: errMessage(err) });
    }
  },
}));

export function useRecipes(): RecipesState {
  return useRecipesStore();
}
