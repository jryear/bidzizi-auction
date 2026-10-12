import "server-only";
import { createHash } from "node:crypto";
import { allowedOrigin } from "./env";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) { super(message); }
}
export const invalid = (message = "Check the highlighted fields and try again.") => new ApiError(400, "INVALID", message);
export const notFound = (what = "This page") => new ApiError(404, "NOT_FOUND", `${what} could not be found.`);
export const signedOut = () => new ApiError(401, "SIGNED_OUT", "Sign in to continue.");
export const conflict = (message: string, extra: Record<string, unknown> = {}) => new ApiError(409, "CONFLICT", message, extra);

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(data, { status, headers: {
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin", ...headers,
  } });
}

export async function handle(run: () => Promise<Response>): Promise<Response> {
  try { return await run(); }
  catch (error) {
    if (error instanceof ApiError) return json({ error: { code: error.code, message: error.message }, ...error.extra }, error.status);
    // Never expose SQL, provider or stack details.
    console.error("Request failed:", error instanceof Error ? error.name : "unknown");
    return json({ error: { code: "UNAVAILABLE", message: "Something went wrong. Try again." } }, 503);
  }
}

/** Mutations must come from our own origin. */
export function sameOrigin(request: Request) {
  if (request.headers.get("origin") !== allowedOrigin(request)) throw new ApiError(403, "FORBIDDEN", "This request is not allowed.");
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  sameOrigin(request);
  if (!/^application\/json/i.test(request.headers.get("content-type") ?? "")) throw invalid();
  const raw = await request.text();
  if (raw.length > 64 * 1024) throw invalid();
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
    return value;
  } catch { throw invalid(); }
}

export const str = (value: unknown, max: number, { required = false, trim = true } = {}): string => {
  if (typeof value !== "string" || value.length > max || value.includes("\u0000")) throw invalid();
  const out = trim ? value.trim() : value;
  if (required && !out) throw invalid();
  return out;
};
export const id = (value: unknown): string => {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw invalid();
  return value.toLowerCase();
};
export const cents = (value: unknown, max = 1_000_000_000): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > max) throw invalid("Enter a whole-dollar or cents amount.");
  return value;
};
export const when = (value: unknown): Date => {
  if (typeof value !== "string") throw invalid();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw invalid();
  return date;
};
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}
export function cookie(name: string, value: string, maxAgeSeconds: number, secure: boolean): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}${secure ? "; Secure" : ""}`;
}
