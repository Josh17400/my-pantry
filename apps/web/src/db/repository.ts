/**
 * Platform-agnostic data-access surface for the shell + product domain.
 *
 * Drivers: native = Capacitor SQLite + Drizzle (sqlite-proxy),
 * web = Supabase-direct (stub until product needs it),
 * node = better-sqlite3 (tests).
 */

import {
  batchValues as coreBatchValues,
  computeChecksum as coreComputeChecksum,
} from '@larder/core';

import type { DomainRepository } from './domain-repository';
import type { SeedResult } from './seed';
import type { FixtureResult } from './fixtures';

export type HealthStepName =
  | 'open'
  | 'migrate'
  | 'insert'
  | 'read_verify'
  | 'aggregate'
  | 'persist'
  | 'cleanup';

export type HealthStepResult = {
  step: HealthStepName;
  ok: boolean;
  ms: number;
  detail: string;
};

export type HealthRunResult = {
  steps: HealthStepResult[];
  allPassed: boolean;
  platform: string;
  driver: string;
};

export type AggregateResult = {
  count: number;
  sum: number;
  ms: number;
};

export type VerifyResult = {
  count: number;
  checksum: number;
  expectedCount: number;
  expectedChecksum: number;
  ok: boolean;
};

export type InitializeResult = {
  migrateApplied: string[];
  migrateSkipped: string[];
  seed: SeedResult;
  fixtures?: FixtureResult;
};

/**
 * Minimal repository exercised by the DB Health screen (native only),
 * extended with product domain access via `domain()`.
 */
export interface PantryRepository {
  readonly driverName: string;

  /** Open / create the database file (or web equivalent). */
  open(): Promise<void>;

  /**
   * Apply drizzle-kit migrations (idempotent).
   * Product drivers also leave the DB ready for seed.
   */
  migrate(): Promise<void>;

  /**
   * Insert `count` rows inside a single transaction.
   * Returns wall-clock ms for the whole batch.
   */
  insertBatch(count: number): Promise<{ ms: number; inserted: number; checksum: number }>;

  /** Read all probe rows and verify count + checksum. */
  verify(expectedCount: number, expectedChecksum: number): Promise<VerifyResult>;

  /** Indexed aggregate: COUNT + SUM(value), with elapsed ms. */
  aggregateIndexed(): Promise<AggregateResult>;

  /**
   * Close the connection, reopen, and re-verify data still present.
   * This is the step that fails for pure in-memory backends.
   */
  closeReopenAndVerify(expectedCount: number, expectedChecksum: number): Promise<VerifyResult>;

  /** Drop the health-probe table; leave no residue. */
  cleanup(): Promise<void>;

  /** Close without reopening (best-effort). */
  close(): Promise<void>;

  // ── Product domain (optional on web stub) ───────────────────────────────

  /**
   * Full product open path: open → migrate → seed catalog/locations.
   * Native/node only. Web throws NotConfiguredError.
   */
  initialize?(options?: {
    loadFixtures?: boolean;
  }): Promise<InitializeResult>;

  /** Seed catalog + default locations (idempotent). */
  seed?(options?: { force?: boolean }): Promise<SeedResult>;

  /**
   * Domain repository for pantry / ledger / recipes / grocery / locations.
   * Available after open()+migrate() (and typically seed()).
   */
  domain?(): DomainRepository;
}

/** Deterministic checksum used by insert + verify steps (from @larder/core). */
export const computeChecksum = coreComputeChecksum;

/** Values for a 1000-row insert: value = i for i in 0..n-1 (from @larder/core). */
export const batchValues = coreBatchValues;

/** Thrown by the web driver until Supabase is configured and wired. */
export class NotConfiguredError extends Error {
  readonly code = 'NOT_CONFIGURED' as const;

  constructor(message = 'Web data layer is not configured (Supabase credentials required)') {
    super(message);
    this.name = 'NotConfiguredError';
  }
}
