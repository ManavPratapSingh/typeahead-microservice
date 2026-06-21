import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),

  // PostgreSQL
  pg: {
    user: process.env.PG_USER || "postgres",
    password: process.env.PG_PASSWORD || "postgrespassword",
    host: process.env.PG_HOST || "localhost",
    port: parseInt(process.env.PG_PORT || "5432", 10),
    database: process.env.PG_DATABASE || "typeahead",
  },

  // Redis
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",

  // Hybrid sampling thresholds
  samplingPerQueryX: parseInt(process.env.SAMPLING_PER_QUERY_X || "5", 10),
  samplingGlobalBatchG: parseInt(process.env.SAMPLING_GLOBAL_BATCH_G || "20", 10),

  // Linear decay
  decayIntervalSec: parseInt(process.env.DECAY_INTERVAL_SEC || "120", 10),
  decayAmount: parseFloat(process.env.DECAY_AMOUNT || "2"),
};
