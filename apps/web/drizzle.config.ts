import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config for generating future migrations from `src/db/schema.ts`.
 * Runtime applies the SQL files under `src/db/migrations/` via `migrate.ts`.
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
});
