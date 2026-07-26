/**
 * Bundled drizzle-kit migrations (SQL + journal).
 *
 * Applied at runtime via `runMigrations` — no filesystem access required
 * (Capacitor / Vite). Idempotent: tracks applied tags in `__drizzle_migrations`.
 */

import { SQL_0000_M0_HEALTH, SQL_0001_PRODUCT_SCHEMA } from './sql';

export type MigrationEntry = {
  readonly idx: number;
  readonly tag: string;
  readonly when: number;
  readonly sql: string;
};

export const MIGRATION_JOURNAL = {
  version: '7',
  dialect: 'sqlite',
  entries: [
    {
      idx: 0,
      version: '6',
      when: 1722000000000,
      tag: '0000_m0_health',
      breakpoints: true,
    },
    {
      idx: 1,
      version: '6',
      when: 1722000001000,
      tag: '0001_product_schema',
      breakpoints: true,
    },
  ],
} as const;

const SQL_BY_TAG: Readonly<Record<string, string>> = {
  '0000_m0_health': SQL_0000_M0_HEALTH,
  '0001_product_schema': SQL_0001_PRODUCT_SCHEMA,
};

export const MIGRATIONS: readonly MigrationEntry[] = MIGRATION_JOURNAL.entries.map(
  (e) => {
    const sql = SQL_BY_TAG[e.tag];
    if (!sql) {
      throw new Error(`Missing SQL for migration tag ${e.tag}`);
    }
    return {
      idx: e.idx,
      tag: e.tag,
      when: e.when,
      sql,
    };
  },
);

/** Split drizzle-kit SQL on statement-breakpoint markers. */
export function splitMigrationSql(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
