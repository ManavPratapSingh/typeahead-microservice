/**
 * sync-worker.ts
 * Background pipeline that bridges PostgreSQL (durable write store) to
 * Redis (fast read cache).
 *
 * Every `t` seconds it:
 *   1. Applies LINEAR DECAY — subtracts a flat `d` from every row's frequency
 *      (floored at 0). Rows that hit 0 are deleted to keep the table lean.
 *   2. Reads the surviving rows from PostgreSQL.
 *   3. Tokenises every query into its progressive sub-prefixes.
 *   4. Ranks: for each prefix, sorts associated queries by decayed frequency
 *      descending and keeps the Top 5.
 *   5. Atomically writes the new prefix → top-5 mappings into Redis via a
 *      pipeline (MSET-style).
 */
import { pool } from "../db/postgres";
import { redisClient } from "../db/redis";
import { config } from "../config";

/**
 * Generate all progressive prefixes for a given string.
 * e.g. "apple" → ["a", "ap", "app", "appl", "apple"]
 */
function generatePrefixes(term: string): string[] {
  const prefixes: string[] = [];
  for (let i = 1; i <= term.length; i++) {
    prefixes.push(term.substring(0, i));
  }
  return prefixes;
}

async function runSyncCycle(): Promise<void> {
  const t0 = Date.now();

  try {
    // ── Step 1: Linear Decay ──────────────────────────────────────────────
    // Subtract d from every frequency, floor at 0
    await pool.query(
      `UPDATE search_frequencies
         SET frequency  = GREATEST(0, frequency - $1),
             updated_at = NOW()`,
      [config.decayAmount]
    );

    // Clean up rows that have fully decayed to 0
    await pool.query(
      `DELETE FROM search_frequencies WHERE frequency <= 0`
    );

    // ── Step 2: Fetch surviving rows ──────────────────────────────────────
    const { rows } = await pool.query<{ query: string; frequency: number }>(
      `SELECT query, frequency FROM search_frequencies ORDER BY frequency DESC`
    );

    if (rows.length === 0) {
      console.log("[SyncWorker] No rows after decay, skipping Redis write.");
      return;
    }

    // ── Step 3 & 4: Tokenise + Rank ──────────────────────────────────────
    // Build a map: prefix → [ { query, frequency }, … ] (unsorted initially)
    const prefixMap = new Map<string, { query: string; frequency: number }[]>();

    for (const row of rows) {
      const prefixes = generatePrefixes(row.query);
      for (const prefix of prefixes) {
        let bucket = prefixMap.get(prefix);
        if (!bucket) {
          bucket = [];
          prefixMap.set(prefix, bucket);
        }
        bucket.push({ query: row.query, frequency: row.frequency });
      }
    }

    // For each prefix, sort descending by frequency and keep top 5
    const top5Map = new Map<string, string[]>();
    for (const [prefix, items] of prefixMap) {
      items.sort((a, b) => b.frequency - a.frequency);
      top5Map.set(prefix, items.slice(0, 5).map((i) => i.query));
    }

    // ── Step 5: Atomic Redis Pipeline Write ──────────────────────────────
    const pipeline = redisClient.multi();

    for (const [prefix, suggestions] of top5Map) {
      pipeline.set(`prefix:${prefix}`, JSON.stringify(suggestions));
    }

    await pipeline.exec();

    const elapsed = Date.now() - t0;
    console.log(
      `[SyncWorker] Cycle complete — ${rows.length} terms, ` +
      `${top5Map.size} prefixes written to Redis (${elapsed}ms)`
    );
  } catch (err) {
    console.error("[SyncWorker] Cycle failed:", err);
  }
}

/** Start the background worker on a fixed interval */
export function startSyncWorker(): void {
  const intervalMs = config.decayIntervalSec * 1000;

  console.log(
    `[SyncWorker] Starting — decay interval: ${config.decayIntervalSec}s, ` +
    `decay amount: ${config.decayAmount}`
  );

  // Run an initial sync immediately on startup so Redis isn't empty
  runSyncCycle();

  // Then schedule recurring cycles
  setInterval(runSyncCycle, intervalMs);
}
