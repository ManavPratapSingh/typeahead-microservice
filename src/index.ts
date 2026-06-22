/**
 * index.ts
 * Express entry point — wires up routes, serves static frontend,
 * connects to Redis, and starts the background sync worker.
 */
import express from "express";
import path from "path";
import { config } from "./config";
import { connectRedis } from "./db/redis";
import { startSyncWorker } from "./services/sync-worker";
import suggestRouter from "./routes/suggest";
import searchRouter from "./routes/search";
import trendingRouter from "./routes/trending";

async function main(): Promise<void> {
  const app = express();

  // ── Middleware ──
  app.use(express.json());

  // ── Serve static frontend ──
  app.use(express.static(path.join(__dirname, "..", "public")));

  // ── API Routes ──
  app.use("/suggest", suggestRouter);
  app.use("/search", searchRouter);
  app.use("/trending", trendingRouter);

  // ── Connect to Redis ──
  await connectRedis();

  // ── Start background sync worker ──
  startSyncWorker();

  // ── Start Express ──
  app.listen(config.port, () => {
    console.log(`\n🚀 Typeahead server running on http://localhost:${config.port}`);
    console.log(`   Hybrid sampling: X=${config.samplingPerQueryX}, G=${config.samplingGlobalBatchG}`);
    console.log(`   Linear decay:    d=${config.decayAmount} every ${config.decayIntervalSec}s\n`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
