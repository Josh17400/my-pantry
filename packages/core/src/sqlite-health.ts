/**
 * Shared pure helpers for the M0 SQLite health self-test.
 * Used by apps/mobile native driver and by the better-sqlite3 Node proof.
 * No React, no platform APIs.
 */

/** Deterministic checksum used by insert + verify steps. */
export function computeChecksum(values: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    // Mix index so order matters slightly and pure sum alone is not enough.
    sum = (sum + values[i]! * (i + 1)) | 0;
  }
  return sum;
}

/** Values for an N-row insert: value = i for i in 0..n-1 */
export function batchValues(count: number): number[] {
  const values: number[] = new Array(count);
  for (let i = 0; i < count; i++) {
    values[i] = i;
  }
  return values;
}

/** Default row count for the health probe. */
export const HEALTH_PROBE_ROW_COUNT = 1000;

/** DDL for the M0 health-probe table + index (mirrors apps/mobile Drizzle schema). */
export const HEALTH_PROBE_DDL = `
CREATE TABLE IF NOT EXISTS m0_health_probe (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  value INTEGER NOT NULL,
  label TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS m0_health_probe_value_idx
ON m0_health_probe (value);
`;

export const HEALTH_PROBE_DROP = `DROP TABLE IF EXISTS m0_health_probe;`;
