import { createClient } from "redis";
import { config } from "../config";

export const redisClient = createClient({ url: config.redisUrl });

redisClient.on("error", (err) => {
  console.error("[Redis] Client error:", err.message);
});

export async function connectRedis(): Promise<void> {
  if (!redisClient.isOpen) {
    await redisClient.connect();
    console.log("[Redis] Connected successfully");
  }
}
