/**
 * Zustand locations store — `useLocations()` for screens.
 */

import { create } from 'zustand';

import type { LocationRow, LocationWrite } from '../db/types';
import { DEFAULT_HOUSEHOLD_ID } from '../db/constants';
import { getDomainRepository } from './repo-context';

export type LocationsState = {
  locations: LocationRow[];
  loading: boolean;
  error: string | null;
  householdId: string;

  setHouseholdId: (id: string) => void;
  list: () => Promise<void>;
  create: (input: LocationWrite) => Promise<LocationRow | null>;
  update: (
    id: string,
    patch: Partial<Omit<LocationWrite, 'id' | 'householdId'>>,
  ) => Promise<LocationRow | null>;
  remove: (id: string) => Promise<void>;
  clearError: () => void;
};

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const useLocationsStore = create<LocationsState>((set, get) => ({
  locations: [],
  loading: false,
  error: null,
  householdId: DEFAULT_HOUSEHOLD_ID,

  setHouseholdId: (id) => set({ householdId: id }),
  clearError: () => set({ error: null }),

  list: async () => {
    set({ loading: true, error: null });
    try {
      const locations = await getDomainRepository().listLocations(
        get().householdId,
      );
      set({ locations, loading: false });
    } catch (err) {
      set({ loading: false, error: errMessage(err) });
    }
  },

  create: async (input) => {
    set({ loading: true, error: null });
    try {
      const created = await getDomainRepository().createLocation({
        ...input,
        householdId: input.householdId || get().householdId,
      });
      const locations = await getDomainRepository().listLocations(
        get().householdId,
      );
      set({ locations, loading: false });
      return created;
    } catch (err) {
      set({ loading: false, error: errMessage(err) });
      return null;
    }
  },

  update: async (id, patch) => {
    set({ loading: true, error: null });
    try {
      const updated = await getDomainRepository().updateLocation(id, patch);
      const locations = await getDomainRepository().listLocations(
        get().householdId,
      );
      set({ locations, loading: false });
      return updated;
    } catch (err) {
      set({ loading: false, error: errMessage(err) });
      return null;
    }
  },

  remove: async (id) => {
    set({ loading: true, error: null });
    try {
      await getDomainRepository().deleteLocation(id);
      const locations = await getDomainRepository().listLocations(
        get().householdId,
      );
      set({ locations, loading: false });
    } catch (err) {
      set({ loading: false, error: errMessage(err) });
    }
  },
}));

export function useLocations(): LocationsState {
  return useLocationsStore();
}
