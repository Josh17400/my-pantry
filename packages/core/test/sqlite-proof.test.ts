/**
 * Node proof of the SQL layer (schema, migration, 1000-row tx, checksum,
 * indexed aggregate, close/reopen persistence) via better-sqlite3 + Drizzle.
 *
 * This does NOT exercise the expo-sqlite native binding — only the shared
 * SQL / schema / checksum logic. Binding remains unverified on this machine.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { asc, count, sql, sum } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { afterEach, describe, expect, it } from 'vitest';

import {
  batchValues,
  computeChecksum,
  HEALTH_PROBE_DDL,
  HEALTH_PROBE_DROP,
  HEALTH_PROBE_ROW_COUNT,
} from '../src/index';

/** Mirror of apps/mobile/src/db/schema.ts — kept local so core stays free of app imports. */
const healthProbe = sqliteTable(
  'm0_health_probe',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    value: integer('value').notNull(),
    label: text('label').notNull(),
  },
  (table) => [index('m0_health_probe_value_idx').on(table.value)],
);

const ROW_COUNT = HEALTH_PROBE_ROW_COUNT;

describe('SQLite health proof (better-sqlite3 + Drizzle)', () => {
  const tempFiles: string[] = [];

  afterEach(() => {
    for (const f of tempFiles) {
      try {
        fs.unlinkSync(f);
      } catch {
        // ignore
      }
    }
    tempFiles.length = 0;
  });

  function openTempDb() {
    const file = path.join(
      os.tmpdir(),
      `larder-m0-proof-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    tempFiles.push(file);
    const sqlite = new Database(file);
    const db = drizzle(sqlite);
    return { file, sqlite, db };
  }

  it('open → migrate → insert 1000 (tx) → verify checksum → aggregate → persist → cleanup', () => {
    // 1. open/create
    let { sqlite, db } = openTempDb();
    expect(sqlite.open).toBe(true);

    // 2. migrate
    sqlite.exec(HEALTH_PROBE_DDL);

    // 3. insert 1000 rows in a transaction
    const values = batchValues(ROW_COUNT);
    const expectedChecksum = computeChecksum(values);

    const insertStart = performance.now();
    const insertMany = sqlite.transaction(() => {
      db.delete(healthProbe).run();
      const chunkSize = 100;
      for (let offset = 0; offset < ROW_COUNT; offset += chunkSize) {
        const slice = values.slice(offset, offset + chunkSize);
        db.insert(healthProbe)
          .values(
            slice.map((value, j) => ({
              value,
              label: `row-${offset + j}`,
            })),
          )
          .run();
      }
    });
    insertMany();
    const insertMs = performance.now() - insertStart;
    expect(insertMs).toBeGreaterThanOrEqual(0);

    // 4. read back + verify count and checksum
    const rows = db
      .select({ value: healthProbe.value })
      .from(healthProbe)
      .orderBy(asc(healthProbe.id))
      .all();
    expect(rows.length).toBe(ROW_COUNT);
    const checksum = computeChecksum(rows.map((r) => r.value));
    expect(checksum).toBe(expectedChecksum);

    // 5. indexed aggregate with elapsed ms
    const aggStart = performance.now();
    const [agg] = db
      .select({
        count: count(),
        sum: sum(healthProbe.value),
      })
      .from(healthProbe)
      .where(sql`${healthProbe.value} >= 0`)
      .all();
    const aggMs = performance.now() - aggStart;
    const expectedSum = ((ROW_COUNT - 1) * ROW_COUNT) / 2;
    expect(Number(agg?.count)).toBe(ROW_COUNT);
    expect(Number(agg?.sum)).toBe(expectedSum);
    expect(aggMs).toBeGreaterThanOrEqual(0);

    // 6. close, reopen, verify data persisted
    const dbPath = tempFiles[0]!;
    sqlite.close();

    sqlite = new Database(dbPath);
    db = drizzle(sqlite);
    const afterReopen = db
      .select({ value: healthProbe.value })
      .from(healthProbe)
      .orderBy(asc(healthProbe.id))
      .all();
    expect(afterReopen.length).toBe(ROW_COUNT);
    expect(computeChecksum(afterReopen.map((r) => r.value))).toBe(expectedChecksum);

    // 7. drop test table cleanly
    sqlite.exec(HEALTH_PROBE_DROP);
    const tables = sqlite
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='m0_health_probe'`,
      )
      .all();
    expect(tables).toHaveLength(0);

    sqlite.close();
  });

  it('computeChecksum is order-sensitive', () => {
    expect(computeChecksum([1, 2, 3])).not.toBe(computeChecksum([3, 2, 1]));
    expect(computeChecksum(batchValues(10))).toBe(computeChecksum(batchValues(10)));
  });
});
