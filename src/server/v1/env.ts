import "server-only";

export type Mode = "production" | "preview" | "local";

/** Deployment mode. Production and preview require Vercel; local requires a loopback database. */
export function mode(): Mode {
  const value = process.env.BIDZIZI_APP_MODE;
  if ((value === "production" || value === "preview") && process.env.VERCEL === "1") return value;
  if (value === "local" && !process.env.VERCEL) return "local";
  throw new Error("Invalid application configuration.");
}

function loopback(url: URL): boolean {
  return ["postgres:", "postgresql:"].includes(url.protocol) && url.hostname === "127.0.0.1" &&
    Number(url.port) > 1024 && /^\/bz_test_[a-z0-9_]+$/.test(url.pathname);
}

export function databaseConfig(): { connectionString: string; tls: boolean } {
  const raw = process.env.BIDZIZI_DATABASE_URL ?? "";
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Invalid database configuration."); }
  if (mode() === "local") {
    if (!loopback(url)) throw new Error("Invalid database configuration.");
    return { connectionString: raw, tls: false };
  }
  // Deployed databases must use the Neon pooled endpoint with verified TLS.
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname.endsWith(".neon.tech") ||
      !url.hostname.split(".")[0].endsWith("-pooler")) throw new Error("Invalid database configuration.");
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert", "channel_binding"]) url.searchParams.delete(key);
  return { connectionString: url.toString(), tls: true };
}

/** The origin mutations must come from. Configured explicitly when deployed. */
export function allowedOrigin(request: Request): string {
  const configured = process.env.APP_ORIGIN;
  if (configured) return configured.replace(/\/$/, "");
  if (mode() === "preview" && process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (mode() === "local") return `http://${request.headers.get("host") ?? ""}`;
  throw new Error("Invalid application configuration.");
}

export const secureCookies = () => mode() !== "local";
