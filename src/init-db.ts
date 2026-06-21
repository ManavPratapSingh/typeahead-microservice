/**
 * init-db.ts
 * Creates the search_frequencies table in PostgreSQL.
 * Run with: npm run db:init
 */
import { pool } from "./db/postgres";

async function initDb(): Promise<void> {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS search_frequencies (
      query       TEXT PRIMARY KEY,
      frequency   DOUBLE PRECISION NOT NULL DEFAULT 0,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Index to speed up ORDER BY frequency DESC during sync worker reads
    CREATE INDEX IF NOT EXISTS idx_search_freq_frequency
      ON search_frequencies (frequency DESC);
  `;

  try {
    await pool.query(createTableSQL);
    console.log("[init-db] Table 'search_frequencies' created (or already exists).");
  } catch (err) {
    console.error("[init-db] Failed to create table:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initDb();
