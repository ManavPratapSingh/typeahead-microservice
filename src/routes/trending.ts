/**
 * trending.ts
 * GET /trending
 *
 * One-shot query to PostgreSQL — returns the top 10 queries by frequency.
 * Designed to be called once on page load (or reload) so the read-heavy
 * Redis path is never burdened with this infrequent, durable-store query.
 */
import { Router, Request, Response } from "express";
import { pool } from "../db/postgres";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  const t0 = Date.now();

  try {
    const { rows } = await pool.query<{ query: string; frequency: number }>(
      `SELECT query, frequency
         FROM search_frequencies
        ORDER BY frequency DESC
        LIMIT 10`
    );

    const elapsed = Date.now() - t0;
    console.log(
      `[trending] Fetched top ${rows.length} from PostgreSQL (${elapsed}ms)`
    );

    res.json({ trending: rows });
  } catch (err) {
    console.error("[trending] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
