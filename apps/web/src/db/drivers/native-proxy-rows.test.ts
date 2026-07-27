/**
 * Regression: Capacitor SQLite object-keyed rows collapse duplicate column
 * names (ingredients.name + locations.name → single "name" = location).
 * Drizzle sqlite-proxy needs positional arrays; the native proxy must rewrite
 * SELECTs with unique aliases and fail loudly on length mismatch.
 */

import Database from 'better-sqlite3';
import { asc, eq } from 'drizzle-orm';
import { drizzle as drizzleBetter } from 'drizzle-orm/better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_HOUSEHOLD_ID } from '../constants';
import { DomainRepository } from '../domain-repository';
import { runMigrations } from '../migrate';
import {
  ingredientForms,
  ingredients,
  locations,
  pantryItems,
  schema,
} from '../schema';
import { runSeed } from '../seed';
import { createProxyDb, type ProxySqliteConnection } from './native';
import {
  countSelectResultColumns,
  normalizeProxyRows,
  objectRowToValues,
  prepareProxySelect,
  PROXY_COL_ALIAS_PREFIX,
  ProxyColumnMismatchError,
  rewriteSelectWithPositionalAliases,
  stripTrailingAlias,
} from './native-proxy-rows';

describe('stripTrailingAlias', () => {
  it('strips a trailing alias so it can be replaced with a positional one', () => {
    expect(stripTrailingAlias('"ingredients"."name" as "ingredient_name"')).toBe(
      '"ingredients"."name"',
    );
    expect(stripTrailingAlias('"t"."x" AS y')).toBe('"t"."x"');
  });

  it('leaves an unaliased column untouched', () => {
    expect(stripTrailingAlias('"pantry_items"."qty_base"')).toBe(
      '"pantry_items"."qty_base"',
    );
  });

  it('does not truncate on " as " inside a string literal', () => {
    // A regex-only stripper truncates these, silently changing the SQL.
    expect(stripTrailingAlias("'sold as seen'")).toBe("'sold as seen'");
    expect(stripTrailingAlias("coalesce(x, 'sold as seen')")).toBe(
      "coalesce(x, 'sold as seen')",
    );
  });

  it('still strips a real alias on an expression containing such a literal', () => {
    expect(stripTrailingAlias("coalesce(x, 'sold as seen') as \"label\"")).toBe(
      "coalesce(x, 'sold as seen')",
    );
  });

  it('ignores AS nested inside parentheses (cast)', () => {
    expect(stripTrailingAlias('cast("x" as text)')).toBe('cast("x" as text)');
  });
});

/** Legacy broken normalizer (pre-fix): Object.values on collapsed keys. */
function legacyObjectValuesNormalize(raw: unknown[]): unknown[][] {
  return raw.map((row) => {
    if (Array.isArray(row)) return row as unknown[];
    if (row !== null && typeof row === 'object') {
      return Object.values(row as Record<string, unknown>);
    }
    return [row];
  });
}

/**
 * Capacitor-like connection: better-sqlite3 object mode (duplicate bare names
 * collapse — last write wins), matching Android/iOS JSObject row building.
 */
function createObjectRowConnection(raw: Database.Database): ProxySqliteConnection {
  return {
    async run(statement, values = []) {
      raw.prepare(statement).run(...(values as never[]));
      return {};
    },
    async query(statement, values = []) {
      const stmt = raw.prepare(statement);
      // Object mode — same collapse as Capacitor when column names collide.
      const rows = stmt.all(...(values as never[])) as Record<string, unknown>[];
      return { values: rows };
    },
  };
}

describe('native-proxy-rows — column collision', () => {
  describe('rewriteSelectWithPositionalAliases', () => {
    it('aliases every select expression with unique __gp_N keys', () => {
      const sql = [
        'select "pantry_items"."household_id", "ingredients"."name",',
        '"ingredient_forms"."form", "locations"."name"',
        'from "pantry_items"',
        'left join "ingredients" on "pantry_items"."ingredient_id" = "ingredients"."id"',
        'left join "locations" on "pantry_items"."location_id" = "locations"."id"',
      ].join(' ');

      const rewritten = rewriteSelectWithPositionalAliases(sql);
      expect(rewritten).not.toBeNull();
      expect(rewritten!.columnCount).toBe(4);
      expect(rewritten!.sql).toContain(
        `"ingredients"."name" as "${PROXY_COL_ALIAS_PREFIX}1"`,
      );
      expect(rewritten!.sql).toContain(
        `"locations"."name" as "${PROXY_COL_ALIAS_PREFIX}3"`,
      );
      // No two bare "name" result labels remain.
      expect(rewritten!.sql).not.toMatch(
        /"name"\s*,\s*"ingredient_forms"/i,
      );
    });

    it('strips existing AS aliases before re-aliasing', () => {
      const sql =
        'select "ingredients"."name" as "ingredient_name", "locations"."name" as "location_name" from "ingredients"';
      const rewritten = rewriteSelectWithPositionalAliases(sql);
      expect(rewritten).not.toBeNull();
      expect(rewritten!.columnCount).toBe(2);
      expect(rewritten!.sql).toContain(
        `"ingredients"."name" as "${PROXY_COL_ALIAS_PREFIX}0"`,
      );
      expect(rewritten!.sql).toContain(
        `"locations"."name" as "${PROXY_COL_ALIAS_PREFIX}1"`,
      );
      expect(rewritten!.sql).not.toContain('ingredient_name');
    });
  });

  describe('loud failure on column mismatch', () => {
    it('throws ProxyColumnMismatchError when object keys are fewer than SELECT columns', () => {
      // Capacitor collapse: two "name" columns → one key.
      const collapsed = { name: 'Fridge', form: 'each' };
      const sql =
        'select "ingredients"."name", "ingredient_forms"."form", "locations"."name" from "pantry_items"';

      expect(() =>
        objectRowToValues(collapsed, sql, 3),
      ).toThrow(ProxyColumnMismatchError);

      try {
        objectRowToValues(collapsed, sql, 3);
      } catch (err) {
        expect(err).toBeInstanceOf(ProxyColumnMismatchError);
        const e = err as ProxyColumnMismatchError;
        expect(e.expectedColumns).toBe(3);
        expect(e.actualEntries).toBe(2);
        expect(e.message).toContain(sql);
      }
    });

    it('normalizeProxyRows throws when raw object rows collapse duplicates', () => {
      const sql =
        'select "ingredients"."name", "ingredient_forms"."form", "locations"."name" from "x"';
      // Simulate Capacitor without rewrite: 3 columns → 2 keys.
      const raw = [{ name: 'Fridge', form: 'each' }];

      expect(() => normalizeProxyRows(sql, raw, 3)).toThrow(
        ProxyColumnMismatchError,
      );
    });
  });

  describe('legacy Object.values vs fixed path (proves the regression)', () => {
    it('legacy Object.values maps location name into the ingredient slot', () => {
      // Full pantry-shaped collision: 20 columns → 19 keys, name = Fridge.
      const row: Record<string, unknown> = {
        household_id: 'hh',
        ingredient_id: 'cucumber',
        form_id: 'cucumber-each',
        location_id: 'loc-fridge',
        qty_base: 1,
        dim: 'count',
        par_level_base: 1,
        low_threshold_pct: 25,
        last_verified_at: null,
        unverified_cook_count: 0,
        opened_at: null,
        expires_at: null,
        updated_at: '2026-01-01',
        watermark_cursor: null,
        last_absolute_cursor: null,
        is_negative: 0,
        conflict: 0,
        // ingredients.name was overwritten by locations.name:
        name: 'Fridge',
        form: 'each',
        // location name slot lost
      };

      const legacy = legacyObjectValuesNormalize([row])[0]!;
      // Position 17 is where Drizzle expects ingredients.name.
      expect(legacy[17]).toBe('Fridge');
      // form lands at 18 by coincidence; location is missing (undefined).
      expect(legacy[18]).toBe('each');
      expect(legacy[19]).toBeUndefined();
      expect(legacy.length).toBe(19);
    });

    it('fixed normalize after rewrite preserves ingredient and location names', () => {
      const sql = [
        'select "pantry_items"."household_id", "pantry_items"."ingredient_id",',
        '"pantry_items"."form_id", "pantry_items"."location_id",',
        '"pantry_items"."qty_base", "pantry_items"."dim",',
        '"pantry_items"."par_level_base", "pantry_items"."low_threshold_pct",',
        '"pantry_items"."last_verified_at", "pantry_items"."unverified_cook_count",',
        '"pantry_items"."opened_at", "pantry_items"."expires_at",',
        '"pantry_items"."updated_at", "pantry_items"."watermark_cursor",',
        '"pantry_items"."last_absolute_cursor", "pantry_items"."is_negative",',
        '"pantry_items"."conflict", "ingredients"."name",',
        '"ingredient_forms"."form", "locations"."name"',
        'from "pantry_items"',
      ].join(' ');

      const prepared = prepareProxySelect(sql);
      expect(prepared.columnCount).toBe(20);
      // Simulate Capacitor after rewrite: unique keys in select order.
      const objectRow: Record<string, unknown> = {};
      const values = [
        'hh',
        'cucumber',
        'cucumber-each',
        'loc-fridge',
        1,
        'count',
        1,
        25,
        null,
        0,
        null,
        null,
        '2026-01-01',
        null,
        null,
        0,
        0,
        'Cucumber',
        'each',
        'Fridge',
      ];
      for (let i = 0; i < values.length; i++) {
        objectRow[`${PROXY_COL_ALIAS_PREFIX}${i}`] = values[i];
      }

      const [positional] = normalizeProxyRows(
        sql,
        [objectRow],
        prepared.columnCount,
      );
      expect(positional).toEqual(values);
      expect(positional![17]).toBe('Cucumber');
      expect(positional![19]).toBe('Fridge');
    });
  });

  describe('createProxyDb + DomainRepository round-trip (Capacitor simulation)', () => {
    let raw: Database.Database | null = null;

    afterEach(() => {
      raw?.close();
      raw = null;
    });

    async function openProxyDomain(): Promise<DomainRepository> {
      raw = new Database(':memory:');
      raw.pragma('journal_mode = WAL');

      const conn = createObjectRowConnection(raw);
      const proxyDb = createProxyDb(conn);

      // Migrate + seed via better-sqlite3 direct handle (migrations use executor).
      const nodeDb = drizzleBetter(raw, { schema });
      const exec = {
        execute: async (sqlText: string, params: unknown[] = []) => {
          if (params.length === 0) {
            raw!.exec(sqlText);
          } else {
            raw!.prepare(sqlText).run(...(params as never[]));
          }
        },
        selectObjects: async (sqlText: string, params: unknown[] = []) => {
          return raw!.prepare(sqlText).all(...(params as never[])) as Record<
            string,
            unknown
          >[];
        },
      };
      await runMigrations(exec);
      await runSeed(nodeDb as never);

      return new DomainRepository(proxyDb as never);
    }

    it('listPantryItems returns ingredient name, not location name', async () => {
      const domain = await openProxyDomain();
      const householdId = DEFAULT_HOUSEHOLD_ID;

      // Place a cucumber in the Fridge via domain writes (proxy path).
      await domain.upsertPantryItem({
        householdId,
        ingredientId: 'cucumber',
        formId: 'cucumber-each',
        locationId: 'loc-fridge',
        qtyBase: 1,
        dim: 'count',
        ingredientName: 'Cucumber',
      });

      // Confirm seed/ensure catalog left real names in tables.
      const loc = await domain.getLocation('loc-fridge');
      expect(loc?.name).toBe('Fridge');

      const items = await domain.listPantryItems(householdId);
      const cucumber = items.find((i) => i.ingredientId === 'cucumber');
      expect(cucumber).toBeDefined();
      expect(cucumber!.ingredientName).toBe('Cucumber');
      expect(cucumber!.locationName).toBe('Fridge');
      expect(cucumber!.formName).toBe('each');
    });

    it('getPantryItem preserves ingredient vs location names', async () => {
      const domain = await openProxyDomain();
      await domain.upsertPantryItem({
        householdId: DEFAULT_HOUSEHOLD_ID,
        ingredientId: 'cucumber',
        formId: 'cucumber-each',
        locationId: 'loc-fridge',
        qtyBase: 1,
        dim: 'count',
        ingredientName: 'Cucumber',
      });

      const item = await domain.getPantryItem(
        'cucumber',
        'cucumber-each',
        DEFAULT_HOUSEHOLD_ID,
      );
      expect(item).not.toBeNull();
      expect(item!.ingredientName).toBe('Cucumber');
      expect(item!.locationName).toBe('Fridge');
    });

    it('without rewrite, object-mode better-sqlite3 still collapses names (driver baseline)', () => {
      // Documents the Capacitor-equivalent collapse that the proxy must defeat.
      const db = new Database(':memory:');
      db.exec(`
        create table ingredients (id text, name text);
        create table locations (id text, name text);
        insert into ingredients values ('c', 'Cucumber');
        insert into locations values ('f', 'Fridge');
      `);
      const collapsed = db
        .prepare(
          `select ingredients.name, locations.name from ingredients, locations`,
        )
        .all() as Record<string, unknown>[];
      expect(collapsed).toEqual([{ name: 'Fridge' }]);
      expect(Object.keys(collapsed[0]!).length).toBe(1);
      expect(countSelectResultColumns(
        `select ingredients.name, locations.name from ingredients, locations`,
      )).toBe(2);
      db.close();
    });
  });

  describe('array rows still work (better-sqlite3 / positional path)', () => {
    it('passes array rows through when lengths match', () => {
      const sql = 'select "a", "b" from "t"';
      const rows = normalizeProxyRows(sql, [[1, 2]], 2);
      expect(rows).toEqual([[1, 2]]);
    });

    it('throws when array row length mismatches expected columns', () => {
      const sql = 'select "a", "b", "c" from "t"';
      expect(() => normalizeProxyRows(sql, [[1, 2]], 3)).toThrow(
        ProxyColumnMismatchError,
      );
    });
  });
});

describe('pantry join SQL still emits name columns without domain aliases safety net', () => {
  /**
   * If someone reverts domain-repository aliases, the proxy rewrite must still
   * produce unique labels. This asserts the raw Drizzle shape of the join.
   */
  it('Drizzle join select without sql.as has two bare name outputs', () => {
    const raw = new Database(':memory:');
    const db = drizzleBetter(raw, { schema });
    const q = db
      .select({
        item: pantryItems,
        ingredientName: ingredients.name,
        formName: ingredientForms.form,
        locationName: locations.name,
      })
      .from(pantryItems)
      .leftJoin(ingredients, eq(pantryItems.ingredientId, ingredients.id))
      .leftJoin(ingredientForms, eq(pantryItems.formId, ingredientForms.id))
      .leftJoin(locations, eq(pantryItems.locationId, locations.id))
      .orderBy(asc(ingredients.name));

    const { sql } = q.toSQL();
    // Two unaliased "name" projections — the historical bug surface.
    const nameRefs = sql.match(/"name"/g) ?? [];
    expect(nameRefs.length).toBeGreaterThanOrEqual(2);

    const rewritten = rewriteSelectWithPositionalAliases(sql);
    expect(rewritten).not.toBeNull();
    // After rewrite every column is uniquely labeled.
    const gpAliases = rewritten!.sql.match(
      new RegExp(`${PROXY_COL_ALIAS_PREFIX}\\d+`, 'g'),
    );
    expect(gpAliases?.length).toBe(rewritten!.columnCount);
    raw.close();
  });
});
