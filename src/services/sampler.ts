/**
 * sampler.ts
 * Hybrid In-Memory Sampling Logic
 *
 * Two-tier threshold system:
 *   1. Per-query threshold X  — a query must accumulate X local hits before it
 *      is considered significant (downsamples noisy/one-off searches).
 *   2. Global batch threshold G — once G promoted queries accumulate in the
 *      flush buffer, we fire a single bulk UPSERT to PostgreSQL
 *      (reduces total write operations).
 *
 * Flow:
 *   POST /search { query } → sampler.record(query)
 *     ┌─ localCounters[query]++ ─┐
 *     │  if >= X:                 │
 *     │    flushBuffer[query] += X│
 *     │    localCounters[query]=0 │
 *     │    promotedCount++        │
 *     └──────────────────────────┘
 *     if promotedCount >= G → bulk UPSERT flushBuffer → clear
 */
import { pool } from "../db/postgres";
import { config } from "../config";

class Sampler {
  /** Tracks raw hit counts per query (pre-promotion) */
  private localCounters: Map<string, number> = new Map();

  /** Queries that crossed the per-query threshold, awaiting bulk flush */
  private flushBuffer: Map<string, number> = new Map();

  /** Number of promotion events since last flush */
  private promotedCount: number = 0;

  private readonly X = config.samplingPerQueryX;
  private readonly G = config.samplingGlobalBatchG;

  /**
   * Record a single search hit for a query.
   * Handles per-query promotion and triggers a global flush when needed.
   */
  async record(query: string): Promise<void> {
    const normalised = query.trim().toLowerCase();
    if (!normalised) return;

    // ── Per-query threshold (Tier 1) ──
    const current = (this.localCounters.get(normalised) || 0) + 1;
    this.localCounters.set(normalised, current);

    if (current >= this.X) {
      // Promote: move accumulated count into flush buffer
      const existing = this.flushBuffer.get(normalised) || 0;
      this.flushBuffer.set(normalised, existing + this.X);
      this.localCounters.set(normalised, 0);
      this.promotedCount++;
    }

    // ── Global batch threshold (Tier 2) ──
    if (this.promotedCount >= this.G) {
      await this.flush();
    }
  }

  /**
   * Bulk UPSERT everything in the flush buffer to PostgreSQL,
   * then reset the buffer and promoted counter.
   */
  async flush(): Promise<void> {
    if (this.flushBuffer.size === 0) return;

    const entries = Array.from(this.flushBuffer.entries());

    // Build a single multi-row UPSERT
    const valuePlaceholders: string[] = [];
    const values: (string | number)[] = [];

    entries.forEach(([q, freq], i) => {
      const offset = i * 2;
      valuePlaceholders.push(`($${offset + 1}, $${offset + 2})`);
      values.push(q, freq);
    });

    const sql = `
      INSERT INTO search_frequencies (query, frequency)
      VALUES ${valuePlaceholders.join(", ")}
      ON CONFLICT (query) DO UPDATE
        SET frequency   = search_frequencies.frequency + EXCLUDED.frequency,
            updated_at  = NOW();
    `;

    try {
      await pool.query(sql, values);
      console.log(
        `[Sampler] Flushed ${entries.length} queries to PostgreSQL ` +
        `(promoted ${this.promotedCount} times since last flush)`
      );
    } catch (err) {
      console.error("[Sampler] Flush failed:", err);
      // Don't clear the buffer so it retries on the next promotion cycle
      return;
    }

    this.flushBuffer.clear();
    this.promotedCount = 0;
  }
}

/** Singleton instance shared by the /search route */
export const sampler = new Sampler();
