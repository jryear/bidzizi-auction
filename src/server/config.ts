import "server-only";

export type TestMode = { origin: string; secure: boolean };

const PUBLIC_STAGING_ORIGIN = "https://staging.bidzizi.com";

function publicStaging(): boolean {
  return process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production" &&
    process.env.BIDZIZI_APP_MODE === "public-staging" &&
    process.env.BIDZIZI_STAGING_TEST_AUTH === "true" &&
    Boolean(process.env.BIDZIZI_STAGING_DATABASE_URL) &&
    process.env.APP_ORIGIN === PUBLIC_STAGING_ORIGIN;
}

/** The sole plaintext adapter is bounded to an explicitly disposable loopback DB. */
export function disposableDatabase(connection: URL): boolean {
  return !process.env.VERCEL && !process.env.VERCEL_ENV &&
    process.env.BIDZIZI_APP_MODE === "local-test" &&
    process.env.BIDZIZI_LOCAL_TEST_DATABASE === "true" &&
    ["postgres:", "postgresql:"].includes(connection.protocol) &&
    connection.hostname === "127.0.0.1" &&
    Number(connection.port) > 1024 && Number(connection.port) !== 5432 &&
    /^\/bz_test_[a-z0-9_]+$/.test(connection.pathname) &&
    Boolean(connection.username && connection.password);
}

/** The staff adapter uses a branch-owned secret; integration variables are read-only connectivity inputs. */
export function databaseConnectionURL(): string {
  if (publicStaging()) return process.env.BIDZIZI_STAGING_DATABASE_URL!;
  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    if (process.env.VERCEL !== "1" || process.env.VERCEL_ENV !== "preview" ||
        process.env.BIDZIZI_APP_MODE !== "staging" || !process.env.BIDZIZI_STAGING_DATABASE_URL) {
      throw new Error("Invalid database configuration.");
    }
    return process.env.BIDZIZI_STAGING_DATABASE_URL;
  }
  const configured = process.env.DATABASE_URL ?? "";
  try {
    if (disposableDatabase(new URL(configured))) return configured;
  } catch { /* Keep malformed configuration private. */ }
  throw new Error("Invalid database configuration.");
}

/** Never derive the allowed test boundary from a client Host/forwarded header. */
export function testMode(request: Request): TestMode | null {
  if (process.env.BIDZIZI_STAGING_TEST_AUTH !== "true") return null;
  try {
    if (publicStaging()) {
      if (request.headers.get("host") !== "staging.bidzizi.com") return null;
      const suppliedOrigin = request.headers.get("origin");
      if (suppliedOrigin !== null && suppliedOrigin !== PUBLIC_STAGING_ORIGIN) return null;
      return { origin: PUBLIC_STAGING_ORIGIN, secure: true };
    }
    let origin: string;
    if (process.env.VERCEL || process.env.VERCEL_ENV) {
      if (process.env.VERCEL !== "1" || process.env.VERCEL_ENV !== "preview" ||
          process.env.BIDZIZI_APP_MODE !== "staging") return null;
      const host = process.env.VERCEL_URL ?? "";
      if (!/^[a-z0-9][a-z0-9-]*\.vercel\.app$/.test(host)) return null;
      origin = `https://${host}`;
      if (process.env.APP_ORIGIN && process.env.APP_ORIGIN !== origin) return null;
    } else {
      if (process.env.BIDZIZI_APP_MODE !== "local-test") return null;
      const configured = new URL(process.env.APP_ORIGIN ?? "");
      if (configured.protocol !== "http:" || configured.hostname !== "127.0.0.1" ||
          Number(configured.port) <= 1024 || configured.username || configured.password ||
          configured.href !== `${configured.origin}/` ||
          !disposableDatabase(new URL(process.env.DATABASE_URL ?? ""))) return null;
      origin = configured.origin;
    }
    // Next dev normalizes Request.url to localhost. Compare the incoming authority
    // against the server-configured host; never use it to choose the allowed origin.
    if (request.headers.get("host") !== new URL(origin).host) return null;
    return { origin, secure: origin.startsWith("https:") };
  } catch { return null; }
}
