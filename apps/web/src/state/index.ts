/**
 * State layer public contract for product screens (M1 tracks after G).
 *
 * Boot (native):
 *   const repo = createPantryRepository();
 *   await repo.initialize?.({ loadFixtures: import.meta.env.DEV });
 *   setActiveRepository(repo);
 *
 * Screens:
 *   const { items, load, appendTxn } = usePantry();
 *   const { recipes, list, create } = useRecipes();
 *   const { list: grocery, checkOff } = useGrocery();
 *   const { locations, list: listLocations } = useLocations();
 */

export {
  setActiveRepository,
  getActiveRepository,
  getDomainRepository,
  hasActiveRepository,
} from './repo-context';

export { usePantry, usePantryStore } from './pantry-store';
export type { PantryState } from './pantry-store';

export { useRecipes, useRecipesStore } from './recipes-store';
export type { RecipesState } from './recipes-store';

export { useGrocery, useGroceryStore } from './grocery-store';
export type { GroceryState } from './grocery-store';

export { useLocations, useLocationsStore } from './locations-store';
export type { LocationsState } from './locations-store';
