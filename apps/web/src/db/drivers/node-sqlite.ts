/**
 * Node / test driver: better-sqlite3 + Drizzle.
 *
 * Used by vitest and any Node-side tooling. Mirrors the product surface of the
 * native driver (migrate → seed → DomainRepository).
 */

import Database from 'better-sqlite3';
import { asc, count, sql, sum } from 'drizzle-orm';
import { type BetterSQLite3Database,drizzle } from 'drizzle-orm/better-sqlite3';

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

export type NodeSqliteOptions = {
  /** Path or ':memory:' (default). */
  path?: string;
};

/**
 * Full product repository backed by better-sqlite3.
 * Implements health-check methods + domain ops via DomainRepository.
 */
export class NodeSqliteRepository implements PantryRepository {
  readonly driverName = 'better-sqlite3+drizzle';

  private raw: Database.Database | null = null;
  private db: BetterSQLite3Database<AppSchema> | null = null;
  private domainRepo: DomainRepository | null = null;
  private readonly path: string;

  constructor(options: NodeSqliteOptions = {}) {
    this.path = options.path ?? ':memory:';
  }

  get drizzle(): BetterSQLite3Database<AppSchema> {
    if (!this.db) {
      throw new Error('Database not open');
    }
    return this.db;
  }

  async open(): Promise<void> {
    this.raw = new Database(this.path);
    this.raw.pragma('journal_mode = WAL');
    this.db = drizzle(this.raw, { schema });
    this.domainRepo = new DomainRepository(
      this.db as unknown as import('../domain-repository').AppDatabase,
    );
  }

  /** Apply drizzle-kit migrations (idempotent). */
  async migrate(): Promise<void> {
    const exec = this.createExecutor();
    await runMigrations(exec);
  }

  /** Seed catalog + default locations (idempotent). */
  async seed(options?: { force?: boolean }): Promise<SeedResult> {
    return runSeed(this.drizzle, options);
  }

  /** migrate + seed — typical app-start sequence. */
  async initialize(options?: {
    loadFixtures?: boolean;
  }): Promise<InitializeResult> {
    await this.open();
    const migrateResult = await runMigrations(this.createExecutor());
    const seed = await runSeed(this.drizzle);
    let fixtures;
    if (options?.loadFixtures) {
      fixtures = await generateDevFixtures(this.domain(), this.drizzle);
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
    const raw = this.requireRaw();
    return {
      execute: async (sqlText, params = []) => {
        raw.prepare(sqlText).run(...params);
      },
      selectObjects: async (sqlText, params = []) => {
        return raw.prepare(sqlText).all(...params) as Record<string, unknown>[];
      },
    };
  }

  // ── Health probe (M0) ───────────────────────────────────────────────────

  async insertBatch(
    countRows = 1000,
  ): Promise<{ ms: number; inserted: number; checksum: number }> {
    const db = this.drizzle;
    const values = batchValues(countRows);
    const checksum = computeChecksum(values);

    await db.delete(healthProbe);

    const start = performance.now();
    const insert = this.requireRaw().transaction(() => {
      const chunkSize = 100;
      for (let offset = 0; offset < countRows; offset += chunkSize) {
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
    insert();
    const ms = performance.now() - start;

    return { ms, inserted: countRows, checksum };
  }

  async verify(expectedCount: number, expectedChecksum: number): Promise<VerifyResult> {
    const rows = await this.drizzle
      .select({ value: healthProbe.value })
      .from(healthProbe)
      .orderBy(asc(healthProbe.id));

    const values = rows.map((r) => r.value);
    const checksum = computeChecksum(values);
    return {
      count: values.length,
      checksum,
      expectedCount,
      expectedChecksum,
      ok: values.length === expectedCount && checksum === expectedChecksum,
    };
  }

  async aggregateIndexed(): Promise<AggregateResult> {
    const start = performance.now();
    const [row] = await this.drizzle
      .select({
        count: count(),
        sum: sum(healthProbe.value),
      })
      .from(healthProbe)
      .where(sql`${healthProbe.value} >= 0`);
    return {
      count: Number(row?.count ?? 0),
      sum: Number(row?.sum ?? 0),
      ms: performance.now() - start,
    };
  }

  async closeReopenAndVerify(
    expectedCount: number,
    expectedChecksum: number,
  ): Promise<VerifyResult> {
    // In-memory DB cannot survive close; for file paths we reopen.
    if (this.path === ':memory:') {
      return this.verify(expectedCount, expectedChecksum);
    }
    await this.close();
    await this.open();
    await this.migrate();
    return this.verify(expectedCount, expectedChecksum);
  }

  async cleanup(): Promise<void> {
    this.requireRaw().exec('DROP TABLE IF EXISTS m0_health_probe;');
  }

  async close(): Promise<void> {
    if (this.raw) {
      this.raw.close();
    }
    this.raw = null;
    this.db = null;
    this.domainRepo = null;
  }

  private requireRaw(): Database.Database {
    if (!this.raw) throw new Error('Database not open');
    return this.raw;
  }
}
