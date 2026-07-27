/**
 * In-memory product store with IndexedDB snapshot persistence.
 * Used only by the browser DEV driver (drivers/dev.ts).
 */

export const DEV_IDB_NAME = 'good-pantry-dev';
export const DEV_IDB_VERSION = 1;
export const DEV_IDB_STORE = 'snapshot';
export const DEV_SNAPSHOT_KEY = 'state';

export type HealthProbeRow = {
  id: number;
  value: number;
  label: string;
};

export type MetaRow = { key: string; value: string };

export type LocationRec = {
  id: string;
  householdId: string;
  name: string;
  icon: string;
  tint: string;
  parentId: string | null;
  sortOrder: number;
};

export type IngredientRec = {
  id: string;
  name: string;
  category: string;
  allergens: string;
  isStaple: boolean;
  defaultFormId: string;
};

export type FormRec = {
  id: string;
  ingredientId: string;
  form: string;
  dim: string;
  densityGPerMl: number | null;
  gramsPerCount: number | null;
  uncertaintyPct: number;
};

export type EdgeRec = {
  fromFormId: string;
  toFormId: string;
  factor: number;
  uncertaintyPct: number;
  source: string;
  oneWay: boolean;
};

export type PackageRec = {
  formId: string;
  label: string;
  netG: number;
  drainedG: number | null;
};

export type PantryItemRec = {
  householdId: string;
  ingredientId: string;
  formId: string;
  locationId: string | null;
  qtyBase: number;
  dim: string;
  parLevelBase: number;
  lowThresholdPct: number;
  lastVerifiedAt: string | null;
  unverifiedCookCount: number;
  openedAt: string | null;
  expiresAt: string | null;
  updatedAt: string;
  watermarkCursor: string | null;
  lastAbsoluteCursor: string | null;
  isNegative: boolean;
  conflict: boolean;
  /**
   * Optional denormalized title written at add/upsert time. Used when the
   * local ingredients catalogue join misses (legacy / pre-seed devices).
   */
  ingredientName?: string | null;
};

export type TxnRec = {
  id: string;
  clientTxnId: string;
  householdId: string;
  ingredientId: string;
  formId: string;
  kind: string;
  deltaBase: number | null;
  targetBase: number | null;
  basisCursor: string | null;
  reason: string;
  refId: string | null;
  unitPrice: number | null;
  occurredAt: string;
  acceptedAt: string | null;
  deviceId: string;
  userId: string;
};

export type RecipeRec = {
  id: string;
  householdId: string | null;
  title: string;
  servings: number;
  yieldNote: string | null;
  prepMin: number | null;
  cookMin: number | null;
  authorId: string | null;
  visibility: string;
  forkedFrom: string | null;
  tags: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RecipeLineRec = {
  id: string;
  recipeId: string;
  sortOrder: number;
  ingredientId: string | null;
  formId: string | null;
  rawText: string;
  qty: number | null;
  unit: string | null;
  optional: boolean;
  groupId: string | null;
  substitutes: string | null;
  unknownAllergens: boolean;
  nonQuantified: boolean;
  qtyHigh: number | null;
  qtyLow: number | null;
  isRange: boolean;
};

export type RecipeStepRec = {
  id: string;
  recipeId: string;
  sortOrder: number;
  text: string;
  durationSec: number | null;
  timerLabel: string | null;
};

export type GroceryListRec = {
  id: string;
  householdId: string;
  shoppingTripId: string;
  createdAt: string;
  updatedAt: string;
};

export type GroceryItemRec = {
  id: string;
  listId: string;
  shoppingTripId: string;
  ingredientId: string | null;
  formId: string | null;
  name: string;
  category: string;
  qtyBase: number | null;
  dim: string | null;
  displayQty: string;
  sources: string | null;
  recipeIds: string | null;
  checked: boolean;
  sortOrder: number;
  notes: string | null;
};

export type UserAliasRec = {
  id: string;
  householdId: string;
  alias: string;
  ingredientId: string;
  createdAt: string;
};

/** Serializable snapshot of the whole product DB. */
export type DevSnapshot = {
  version: 1;
  nextHealthId: number;
  healthProbe: HealthProbeRow[];
  meta: MetaRow[];
  locations: LocationRec[];
  ingredients: IngredientRec[];
  forms: FormRec[];
  edges: EdgeRec[];
  packages: PackageRec[];
  pantryItems: PantryItemRec[];
  pantryTxns: TxnRec[];
  recipes: RecipeRec[];
  recipeLines: RecipeLineRec[];
  recipeSteps: RecipeStepRec[];
  groceryLists: GroceryListRec[];
  groceryItems: GroceryItemRec[];
  userAliases: UserAliasRec[];
};

export function emptySnapshot(): DevSnapshot {
  return {
    version: 1,
    nextHealthId: 1,
    healthProbe: [],
    meta: [],
    locations: [],
    ingredients: [],
    forms: [],
    edges: [],
    packages: [],
    pantryItems: [],
    pantryTxns: [],
    recipes: [],
    recipeLines: [],
    recipeSteps: [],
    groceryLists: [],
    groceryItems: [],
    userAliases: [],
  };
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openIdb(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, DEV_IDB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DEV_IDB_STORE)) {
        db.createObjectStore(DEV_IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export async function loadSnapshot(
  dbName: string = DEV_IDB_NAME,
  memoryOnly = false,
): Promise<DevSnapshot> {
  if (memoryOnly || !hasIndexedDb()) {
    return emptySnapshot();
  }
  try {
    const db = await openIdb(dbName);
    try {
      const snap = await new Promise<DevSnapshot | undefined>((resolve, reject) => {
        const tx = db.transaction(DEV_IDB_STORE, 'readonly');
        const store = tx.objectStore(DEV_IDB_STORE);
        const req = store.get(DEV_SNAPSHOT_KEY);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB get failed'));
        req.onsuccess = () => resolve(req.result as DevSnapshot | undefined);
      });
      if (snap && snap.version === 1) {
        return snap;
      }
      return emptySnapshot();
    } finally {
      db.close();
    }
  } catch {
    return emptySnapshot();
  }
}

export async function saveSnapshot(
  snapshot: DevSnapshot,
  dbName: string = DEV_IDB_NAME,
  memoryOnly = false,
): Promise<void> {
  if (memoryOnly || !hasIndexedDb()) {
    return;
  }
  const db = await openIdb(dbName);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DEV_IDB_STORE, 'readwrite');
      const store = tx.objectStore(DEV_IDB_STORE);
      const req = store.put(snapshot, DEV_SNAPSHOT_KEY);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB put failed'));
      req.onsuccess = () => resolve();
    });
  } finally {
    db.close();
  }
}

export async function deleteDevDatabase(dbName: string = DEV_IDB_NAME): Promise<void> {
  if (!hasIndexedDb()) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(dbName);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB delete failed'));
    req.onblocked = () => resolve();
    req.onsuccess = () => resolve();
  });
}

/**
 * Mutable in-memory DB. Mutations call `persist()` so reloads keep state.
 */
export class DevStore {
  private data: DevSnapshot;
  private readonly dbName: string;
  private readonly memoryOnly: boolean;
  private persistChain: Promise<void> = Promise.resolve();
  private suspended = false;

  constructor(
    initial: DevSnapshot,
    options: { dbName?: string; memoryOnly?: boolean } = {},
  ) {
    this.data = initial;
    this.dbName = options.dbName ?? DEV_IDB_NAME;
    this.memoryOnly = options.memoryOnly ?? false;
  }

  get snapshot(): DevSnapshot {
    return this.data;
  }

  /** Replace entire state (e.g. after reset + reseed). */
  replace(next: DevSnapshot): void {
    this.data = next;
  }

  /** Batch mutations without intermediate IndexedDB writes. */
  async batch(fn: () => void | Promise<void>): Promise<void> {
    this.suspended = true;
    try {
      await fn();
    } finally {
      this.suspended = false;
      await this.persist();
    }
  }

  async persist(): Promise<void> {
    if (this.suspended) return;
    const copy = structuredClone(this.data);
    this.persistChain = this.persistChain.then(() =>
      saveSnapshot(copy, this.dbName, this.memoryOnly),
    );
    await this.persistChain;
  }

  getMeta(key: string): string | null {
    return this.data.meta.find((m) => m.key === key)?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    const i = this.data.meta.findIndex((m) => m.key === key);
    if (i >= 0) {
      this.data.meta[i] = { key, value };
    } else {
      this.data.meta.push({ key, value });
    }
  }

  // ── Convenience mutators that mark dirty ────────────────────────────────

  async touch(fn: () => void): Promise<void> {
    fn();
    await this.persist();
  }
}
