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

import { DomainRepository } from '../domain-repository';
import { generateDevFixtures } from '../fixtures';
import { runMigrations, type SqlExecutor } from '../migrate';
import {
  type AggregateResult,
  batchValues,
  computeChecksum,
  type InitializeResult,
  type PantryRepository,
  type VerifyResult,
} from '../repository';
import { type AppSchema,healthProbe, schema } from '../schema';
import { runSeed, type SeedResult } from '../seed';

const DB_NAME = 'good-pantry';
const DB_VERSION = 1;
const BATCH_SIZE = 1000;

type DrizzleDb = SqliteRemoteDatabase<AppSchema>;

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
  return drizzle(
    async (sqlText, params, method) => {
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
    },
    { schema },
  );
}

export class NativePantryRepository implements PantryRepository {
  readonly driverName = 'capacitor-sqlite+drizzle-proxy';

  private conn: SQLiteDBConnection | null = null;
  private db: DrizzleDb | null = null;
  private domainRepo: DomainRepository | null = null;

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
    this.domainRepo = new DomainRepository(this.db as import('../domain-repository').AppDatabase);
  }

  async migrate(): Promise<void> {
    const exec = this.createExecutor();
    await runMigrations(exec);
  }

  async seed(options?: { force?: boolean }): Promise<SeedResult> {
    return runSeed(this.appDb(), options);
  }

  async initialize(options?: {
    loadFixtures?: boolean;
  }): Promise<InitializeResult> {
    await this.open();
    const migrateResult = await runMigrations(this.createExecutor());
    const seed = await runSeed(this.appDb());
    let fixtures;
    if (options?.loadFixtures) {
      fixtures = await generateDevFixtures(this.domain(), this.appDb());
    }
    return {
      migrateApplied: migrateResult.applied,
      migrateSkipped: migrateResult.skipped,
      seed,
      fixtures,
    };
  }

  domain(): DomainRepository {
    if (!this.domainRepo) {
      throw new Error('Database not open');
    }
    return this.domainRepo;
  }

  private createExecutor(): SqlExecutor {
    const conn = this.requireConn();
    return {
      execute: async (sqlText, params = []) => {
        if (params.length === 0) {
          await conn.execute(sqlText);
        } else {
          await conn.run(sqlText, params as unknown[], false);
        }
      },
      selectObjects: async (sqlText, params = []) => {
        const result = await conn.query(sqlText, params as unknown[]);
        // Prefer object rows when Capacitor provides them
        if (result.values && result.values.length > 0) {
          const first = result.values[0];
          if (first !== null && typeof first === 'object' && !Array.isArray(first)) {
            return result.values as Record<string, unknown>[];
          }
        }
        // Fall back: if columns present, zip
        const cols = (result as { columns?: string[] }).columns;
        if (cols && result.values) {
          return (result.values as unknown[][]).map((row) => {
            const obj: Record<string, unknown> = {};
            cols.forEach((c, i) => {
              obj[c] = Array.isArray(row) ? row[i] : row;
            });
            return obj;
          });
        }
        return (result.values ?? []) as Record<string, unknown>[];
      },
    };
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
    this.domainRepo = null;
  }

  /**
   * Settings → Diagnostics: delete the on-device SQLite file, re-open, migrate,
   * and seed the catalogue + default locations. Cloud / Supabase is untouched.
   * Fixtures are never reloaded on native.
   */
  async resetLocalData(): Promise<void> {
    await this.close();
    try {
      await CapacitorSQLite.deleteDatabase({
        database: DB_NAME,
        readonly: false,
      });
    } catch {
      // File may already be absent after a partial wipe — continue to re-init.
    }
    await this.initialize({ loadFixtures: false });
  }

  private requireDb(): DrizzleDb {
    if (!this.db) {
      throw new Error('Database not open');
    }
    return this.db;
  }

  private appDb(): import('../domain-repository').AppDatabase {
    return this.requireDb() as unknown as import('../domain-repository').AppDatabase;
  }

  private requireConn(): SQLiteDBConnection {
    if (!this.conn) {
      throw new Error('Database not open');
    }
    return this.conn;
  }
}
