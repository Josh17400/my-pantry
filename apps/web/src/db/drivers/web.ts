import {
  NotConfiguredError,
  type AggregateResult,
  type PantryRepository,
  type VerifyResult,
} from '../repository';

/**
 * Web driver: Supabase-direct + service-worker cache (future).
 *
 * Typed stub that satisfies PantryRepository and throws NotConfiguredError.
 * No local SQLite / jeep-sqlite on production web — online companion only.
 *
 * jeep-sqlite was investigated for a browser-only *dev* path; see
 * reports/m1-replatform.md. Product web remains Supabase-direct.
 */
export class WebPantryRepository implements PantryRepository {
  readonly driverName = 'supabase-direct (not configured)';

  async open(): Promise<void> {
    throw new NotConfiguredError(
      'Web has no local database. Supabase-direct driver is not configured for health probes.',
    );
  }

  async migrate(): Promise<void> {
    throw new NotConfiguredError();
  }

  async insertBatch(
    _count: number,
  ): Promise<{ ms: number; inserted: number; checksum: number }> {
    throw new NotConfiguredError();
  }

  async verify(_expectedCount: number, _expectedChecksum: number): Promise<VerifyResult> {
    throw new NotConfiguredError();
  }

  async aggregateIndexed(): Promise<AggregateResult> {
    throw new NotConfiguredError();
  }

  async closeReopenAndVerify(
    _expectedCount: number,
    _expectedChecksum: number,
  ): Promise<VerifyResult> {
    throw new NotConfiguredError();
  }

  async cleanup(): Promise<void> {
    throw new NotConfiguredError();
  }

  async close(): Promise<void> {
    // no-op: nothing opened
  }
}
