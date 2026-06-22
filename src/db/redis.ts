import { createClient } from "redis";
import { config } from "../config";
import { ConsistentHashRing } from "./consistent-hashing";

type RedisClient = ReturnType<typeof createClient>;

export const redisShards: { key: string; client: RedisClient }[] = [];
let hashRing: ConsistentHashRing<RedisClient>;

// Initialize all Redis client instances for shards
for (const shardUrl of config.redisShards) {
  const client = createClient({ url: shardUrl });
  client.on("error", (err) => {
    console.error(`[Redis Shard: ${shardUrl}] Client error:`, err.message);
  });
  redisShards.push({ key: shardUrl, client });
}

// Build the consistent hash ring
hashRing = new ConsistentHashRing(
  redisShards.map((s) => ({ key: s.key, value: s.client }))
);

/**
 * Gets the designated Redis client for a given prefix key.
 */
export function getRedisClientForPrefix(prefix: string): RedisClient {
  return hashRing.getNode(prefix);
}

/**
 * Connect to all Redis shards
 */
export async function connectRedis(): Promise<void> {
  for (const { key, client } of redisShards) {
    if (!client.isOpen) {
      await client.connect();
      console.log(`[Redis] Connected to shard: ${key}`);
    }
  }
}
