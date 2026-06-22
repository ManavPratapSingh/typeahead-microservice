/**
 * suggest.ts
 * GET /suggest?q=<prefix>
 *
 * O(1) lookup from Redis — returns a pre-computed top-5 array.
 * If the prefix key doesn't exist, returns an empty array immediately.
 */
import { Router, Request, Response } from "express";
import { getRedisClientForPrefix } from "../db/redis";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  const t0 = process.hrtime.bigint();

  const prefix = (req.query.q as string || "").trim().toLowerCase();

  if (!prefix) {
    res.json({ suggestions: [] });
    return;
  }

  try {
    const client = getRedisClientForPrefix(prefix);
    const cached = await client.get(`prefix:${prefix}`);

    const suggestions: string[] = cached ? JSON.parse(cached) : [];

    // Log latency for P99 tracking (Phase 5)
    const elapsed = Number(process.hrtime.bigint() - t0) / 1e6; // ms
    console.log(`[suggest] q="${prefix}" → ${suggestions.length} results (${elapsed.toFixed(2)}ms)`);

    res.json({ suggestions });
  } catch (err) {
    console.error("[suggest] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
