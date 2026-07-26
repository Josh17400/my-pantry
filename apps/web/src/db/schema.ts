import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Health-check table only — not product domain.
 * Exercises create / insert / read / aggregate / drop for the shell proof.
 */
export const healthProbe = sqliteTable(
  'm0_health_probe',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    value: integer('value').notNull(),
    label: text('label').notNull(),
  },
  (table) => [index('m0_health_probe_value_idx').on(table.value)],
);

export type HealthProbeRow = typeof healthProbe.$inferSelect;
