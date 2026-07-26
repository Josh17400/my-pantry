/**
 * Native driver: @capacitor-community/sqlite + Drizzle via sqlite-proxy.
 *
 * Drizzle has no official Capacitor driver. `drizzle-orm/sqlite-proxy` takes an
 * async executor callback; that maps cleanly onto Capacitor SQLite's
 * run / query / execute APIs.
 *
 * Only instantiated when Capacitor.isNativePlatform() is true.
 */

import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import { asc, count, sql, sum } from 'drizzle-orm';
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

import {
  batchValues,
  computeChecksum,
  type AggregateResult,
  type PantryRepository,
  type VerifyResult,
} from '../repository';
import { healthProbe } from '../schema';

const DB_NAME = 'my-pantry-m0';
const DB_VERSION = 1;
const BATCH_SIZE = 1000;

type DrizzleDb = SqliteRemoteDatabase<Record<string, never>>;

let sharedConnection: SQLiteConnection | null = null;

function getSqliteConnection(): SQLiteConnection {
  if (!sharedConnection) {
    sharedConnection = new SQLiteConnection(CapacitorSQLite);
  }
  return sharedConnection;
}

/**
 * Map Drizzle sqlite-proxy calls onto a Capacitor SQLiteDBConnection.
 * Proxy contract: return { rows } as array-of-arrays for SELECT-style methods;
 * empty rows for run.
 */
function createProxyDb(conn: SQLiteDBConnection): DrizzleDb {
  return drizzle(async (sqlText, params, method) => {
    const values = params as unknown[];

    if (method === 'run') {
      await conn.run(sqlText, values, false);
      return { rows: [] };
    }

    // 'all' | 'values' — Drizzle expects rows as unknown[][]
    const result = await conn.query(sqlText, values);
    const raw = result.values ?? [];
    const rows: unknown[][] = raw.map((row) => {
      if (Array.isArray(row)) {
        return row as unknown[];
      }
      // Capacitor sometimes returns row objects; normalize to ordered values.
      if (row !== null && typeof row === 'object') {
        return Object.values(row as Record<string, unknown>);
      }
      return [row];
    });
    return { rows };
  });
}

export class NativePantryRepository implements PantryRepository {
  readonly driverName = 'capacitor-sqlite+drizzle-proxy';

  private conn: SQLiteDBConnection | null = null;
  private db: DrizzleDb | null = null;

  async open(): Promise<void> {
    const sqlite = getSqliteConnection();

    const consistency = await sqlite.checkConnectionsConsistency();
    const isConn = (await sqlite.isConnection(DB_NAME, false)).result;

    if (consistency.result && isConn) {
      this.conn = await sqlite.retrieveConnection(DB_NAME, false);
    } else {
      this.conn = await sqlite.createConnection(
        DB_NAME,
        false,
        'no-encryption',
        DB_VERSION,
        false,
      );
    }

    await this.conn.open();
    this.db = createProxyDb(this.conn);
  }

  async migrate(): Promise<void> {
    const conn = this.requireConn();
    // Apply the Drizzle schema as SQL at runtime (probe table only).
    // Prefer HEALTH_PROBE_DDL from core when available; keep local DDL in sync.
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS m0_health_probe (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        value INTEGER NOT NULL,
        label TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS m0_health_probe_value_idx
      ON m0_health_probe (value);
    `);
  }

  async insertBatch(
    countRows: number = BATCH_SIZE,
  ): Promise<{ ms: number; inserted: number; checksum: number }> {
    const db = this.requireDb();
    const conn = this.requireConn();
    const values = batchValues(countRows);
    const checksum = computeChecksum(values);

    await db.delete(healthProbe);

    const start = performance.now();
    await conn.beginTransaction();
    try {
      const chunkSize = 100;
      for (let offset = 0; offset < countRows; offset += chunkSize) {
        const slice = values.slice(offset, offset + chunkSize);
        await db.insert(healthProbe).values(
          slice.map((value, j) => ({
            value,
            label: `row-${offset + j}`,
          })),
        );
      }
      await conn.commitTransaction();
    } catch (err) {
      await conn.rollbackTransaction();
      throw err;
    }
    const ms = performance.now() - start;

    return { ms, inserted: countRows, checksum };
  }

  async verify(expectedCount: number, expectedChecksum: number): Promise<VerifyResult> {
    const db = this.requireDb();
    const rows = await db
      .select({ value: healthProbe.value })
      .from(healthProbe)
      .orderBy(asc(healthProbe.id));

    const values = rows.map((r) => r.value);
    const checksum = computeChecksum(values);
    const countRows = values.length;

    return {
      count: countRows,
      checksum,
      expectedCount,
      expectedChecksum,
      ok: countRows === expectedCount && checksum === expectedChecksum,
    };
  }

  async aggregateIndexed(): Promise<AggregateResult> {
    const db = this.requireDb();
    const start = performance.now();
    const [row] = await db
      .select({
        count: count(),
        sum: sum(healthProbe.value),
      })
      .from(healthProbe)
      .where(sql`${healthProbe.value} >= 0`);
    const ms = performance.now() - start;
    return {
      count: Number(row?.count ?? 0),
      sum: Number(row?.sum ?? 0),
      ms,
    };
  }

  async closeReopenAndVerify(
    expectedCount: number,
    expectedChecksum: number,
  ): Promise<VerifyResult> {
    await this.close();
    await this.open();
    return this.verify(expectedCount, expectedChecksum);
  }

  async cleanup(): Promise<void> {
    const conn = this.requireConn();
    await conn.execute(`DROP TABLE IF EXISTS m0_health_probe;`);
  }

  async close(): Promise<void> {
    if (!this.conn) {
      return;
    }
    const sqlite = getSqliteConnection();
    try {
      await this.conn.close();
    } catch {
      // already closed
    }
    try {
      await sqlite.closeConnection(DB_NAME, false);
    } catch {
      // connection may already be gone
    }
    this.conn = null;
    this.db = null;
  }

  private requireDb(): DrizzleDb {
    if (!this.db) {
      throw new Error('Database not open');
    }
    return this.db;
  }

  private requireConn(): SQLiteDBConnection {
    if (!this.conn) {
      throw new Error('Database not open');
    }
    return this.conn;
  }
}
