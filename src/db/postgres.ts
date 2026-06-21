import { Pool } from "pg";
import { config } from "../config";

export const pool = new Pool({
  user: config.pg.user,
  password: config.pg.password,
  host: config.pg.host,
  port: config.pg.port,
  database: config.pg.database,
  max: 10, // connection pool ceiling
});

pool.on("error", (err) => {
  console.error("[PostgreSQL] Unexpected pool error:", err.message);
});
