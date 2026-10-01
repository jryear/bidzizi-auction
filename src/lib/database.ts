import "server-only";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";

type DatabaseCheck =
  | { ok: true; connected: 1; checkedAt: string }
  | { ok: false; checkedAt: string };

let pool: Pool | undefined;

function getPool(): Pool {
  if (pool) return pool;

  const connection = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["postgres:", "postgresql:"].includes(connection.protocol) ||
    !connection.hostname.endsWith(".neon.tech") ||
    !connection.hostname.split(".")[0].endsWith("-pooler") ||
    !["require", "verify-ca", "verify-full"].includes(
      connection.searchParams.get("sslmode") ?? "",
    )
  ) {
    throw new Error("Database connection configuration is invalid.");
  }

  // pg parses URL SSL options after its configuration. Set verified TLS here
  // instead, so a URL option cannot override certificate verification.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) {
    connection.searchParams.delete(key);
  }

  pool = new Pool({
    connectionString: connection.toString(),
    ssl: { rejectUnauthorized: true },
    max: 2,
    connectionTimeoutMillis: 5_000,
    query_timeout: 5_000,
    idleTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  // Idle connection failures must not terminate a healthy server process or
  // disclose provider error strings. The next request performs a fresh check.
  pool.on("error", () => {
    console.error("Database idle connection failed.");
  });
  if (process.env.VERCEL) attachDatabasePool(pool);
  return pool;
}

export async function checkDatabase(): Promise<DatabaseCheck> {
  try {
    const result = await getPool().query<{ connected: number }>(
      "SELECT 1 AS connected",
    );
    if (result.rows[0]?.connected !== 1) throw new Error("Unexpected result.");
    return { ok: true, connected: 1, checkedAt: new Date().toISOString() };
  } catch {
    console.error("Database connection check failed.");
    return { ok: false, checkedAt: new Date().toISOString() };
  }
}
