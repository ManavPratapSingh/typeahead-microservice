/**
 * search.ts
 * POST /search  { query: string }
 *
 * Records a search hit via the hybrid sampler.
 * The sampler handles per-query downsampling (X) and global batch flushing (G).
 */
import { Router, Request, Response } from "express";
import { sampler } from "../services/sampler";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const { query } = req.body;

  if (!query || typeof query !== "string" || !query.trim()) {
    res.status(400).json({ error: "Missing or empty 'query' in request body" });
    return;
  }

  try {
    await sampler.record(query);
    res.json({ message: "searched" });
  } catch (err) {
    console.error("[search] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
