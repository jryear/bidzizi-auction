import "server-only";
import { Pool, type PoolClient } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { databaseConfig } from "./env";

let pool: Pool | undefined;
function getPool(): Pool {
  if (pool) return pool;
  const config = databaseConfig();
  pool = new Pool({
    connectionString: config.connectionString, ssl: config.tls ? { rejectUnauthorized: true } : false,
    max: 5, connectionTimeoutMillis: 5000, query_timeout: 8000, idleTimeoutMillis: 10000, allowExitOnIdle: true,
  });
  pool.on("error", () => console.error("Database connection failed."));
  if (process.env.VERCEL) attachDatabasePool(pool);
  return pool;
}

export type Db = PoolClient;

export async function tx<T>(run: (db: Db) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '8s'");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}

export async function now(db: Db): Promise<Date> {
  return (await db.query<{ at: Date }>("SELECT clock_timestamp() AS at")).rows[0].at;
}
