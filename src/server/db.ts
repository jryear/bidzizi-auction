import "server-only";
import { Pool, type PoolClient } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { databaseConnectionURL, disposableDatabase } from "./config";

let pool: Pool | undefined;
function getPool(): Pool {
  if (pool) return pool;
  const connection = new URL(databaseConnectionURL());
  const local = disposableDatabase(connection);
  if (!local && (
    !["postgres:", "postgresql:"].includes(connection.protocol) ||
    !connection.hostname.endsWith(".neon.tech") ||
    !connection.hostname.split(".")[0].endsWith("-pooler") ||
    !["require", "verify-ca", "verify-full"].includes(connection.searchParams.get("sslmode") ?? "")
  )) throw new Error("Invalid database configuration.");
  // URL TLS parameters must not override certificate verification in pg.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) connection.searchParams.delete(key);
  pool = new Pool({
    connectionString: connection.toString(), ssl: local ? false : { rejectUnauthorized: true },
    max: 2, connectionTimeoutMillis: 4000, query_timeout: 5000,
    idleTimeoutMillis: 10000, allowExitOnIdle: true,
  });
  pool.on("error", () => console.error("Application database connection failed."));
  if (process.env.VERCEL) attachDatabasePool(pool);
  return pool;
}

export async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '5s'");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}
