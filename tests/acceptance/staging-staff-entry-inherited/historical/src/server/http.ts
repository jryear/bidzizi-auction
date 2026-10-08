import "server-only";
import { testMode, type TestMode } from "./config";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}
export const validation = () => new ApiError(400, "VALIDATION", "Check the draft fields and try again.");
export const forbidden = () => new ApiError(403, "FORBIDDEN", "This action is not available to this account.");
export const unauthenticated = () => new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
export const notFound = () => new ApiError(404, "NOT_FOUND", "This draft could not be found.");

export function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return Response.json(data, { status, headers: {
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin", ...extraHeaders,
  } });
}
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try { return await run(); }
  catch (error) {
    if (error instanceof ApiError) return json({ error: { code: error.code, message: error.message }, ...error.extra }, error.status);
    // Deliberately withhold provider details, SQL, connection values and stack traces.
    console.error("Application request could not be confirmed.");
    return json({ error: { code: "UNAVAILABLE", message: "The request could not be confirmed. Try again." } }, 503);
  }
}
export function mutationMode(request: Request): TestMode {
  const mode = testMode(request);
  if (!mode || request.headers.get("origin") !== mode.origin) throw forbidden();
  if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get("content-type") ?? "")) throw validation();
  return mode;
}
export async function body(request: Request): Promise<unknown> {
  const limit = 64 * 1024;
  if (Number(request.headers.get("content-length")) > limit || !request.body) throw validation();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw validation(); }
      chunks.push(value);
    }
    const joined = new Uint8Array(size);
    let offset = 0;
    for (const part of chunks) { joined.set(part, offset); offset += part.length; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined));
  } catch { throw validation(); }
  finally { reader.releaseLock(); }
}
export function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) throw validation();
  return value as Record<string, unknown>;
}
export function text(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.length > maximum || value.includes("\u0000")) throw validation();
  return value;
}
export function uuid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw validation();
  return value.toLowerCase();
}
