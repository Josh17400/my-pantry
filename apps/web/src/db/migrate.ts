/**
 * Idempotent migration runner for Capacitor SQLite / better-sqlite3.
 *
 * Uses the same journal shape as drizzle-kit (`__drizzle_migrations` + tags).
 * Safe to call on every app start.
 */

import { MIGRATIONS, splitMigrationSql } from './migrations';

/** Minimal async executor — both native proxy and test drivers implement this. */
export type SqlExecutor = {
  execute(sql: string, params?: unknown[]): Promise<void>;
  /**
   * Run a SELECT and return rows as objects (column name → value).
   * Prefer object rows when available; array rows are not used here.
   */
  selectObjects(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
};

const MIGRATIONS_TABLE = `__drizzle_migrations`;

async function ensureMigrationsTable(exec: SqlExecutor): Promise<void> {
  await exec.execute(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      hash TEXT NOT NULL UNIQUE,
      created_at INTEGER
    )
  `);
}

async function appliedHashes(exec: SqlExecutor): Promise<Set<string>> {
  const rows = await exec.selectObjects(
    `SELECT hash FROM ${MIGRATIONS_TABLE}`,
  );
  return new Set(rows.map((r) => String(r.hash)));
}

export type MigrateResult = {
  applied: string[];
  skipped: string[];
};

/**
 * Apply all pending migrations in journal order.
 * Re-running with no pending work is a no-op (idempotent).
 */
export async function runMigrations(exec: SqlExecutor): Promise<MigrateResult> {
  await ensureMigrationsTable(exec);
  const done = await appliedHashes(exec);
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of MIGRATIONS) {
    if (done.has(migration.tag)) {
      skipped.push(migration.tag);
      continue;
    }

    const statements = splitMigrationSql(migration.sql);
    for (const stmt of statements) {
      // CREATE TABLE / INDEX without IF NOT EXISTS for product tables —
      // first run creates; if a partial failure left debris, re-apply is
      // not expected. Health probe migration uses plain CREATE; subsequent
      // app starts skip via journal. For robustness against re-seed of
      // empty DBs that already have health probe from M0 inline DDL:
      const softened = softenCreate(stmt);
      await exec.execute(softened);
    }

    await exec.execute(
      `INSERT INTO ${MIGRATIONS_TABLE} (hash, created_at) VALUES (?, ?)`,
      [migration.tag, migration.when],
    );
    applied.push(migration.tag);
  }

  return { applied, skipped };
}

/**
 * Make first-run safe when M0 health DDL was applied outside the journal
 * (legacy native migrate). Product tables stay strict CREATE.
 */
function softenCreate(stmt: string): string {
  const trimmed = stmt.trim();
  // Only soften the M0 health table / index so legacy installs don't crash.
  if (/CREATE\s+TABLE\s+`?m0_health_probe`?/i.test(trimmed)) {
    return trimmed.replace(/CREATE\s+TABLE/i, 'CREATE TABLE IF NOT EXISTS');
  }
  if (/CREATE\s+INDEX\s+`?m0_health_probe_value_idx`?/i.test(trimmed)) {
    return trimmed.replace(/CREATE\s+INDEX/i, 'CREATE INDEX IF NOT EXISTS');
  }
  return trimmed;
}
