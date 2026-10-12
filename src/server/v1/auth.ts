import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { now, tx, type Db } from "./db";
import { secureCookies } from "./env";
import { ApiError, cookie, json, readCookie, readJson, sha256, signedOut, str } from "./http";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, options: object) => Promise<Buffer>;
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const STAFF_COOKIE = "bzs", STAFF_HOURS = 12;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16), key = await scrypt(password, salt, 64, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}
async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
// Verified against unknown emails so response timing doesn't reveal which emails exist.
let dummyHash: Promise<string> | undefined;
const dummy = () => (dummyHash ??= hashPassword(randomBytes(16).toString("hex")));

export type Staff = { id: string; orgId: string; orgName: string; name: string; email: string };

export async function staffFrom(db: Db, request: Request): Promise<Staff> {
  const token = readCookie(request, STAFF_COOKIE);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw signedOut();
  const row = (await db.query<Staff>(
    `SELECT s.id, s.org_id AS "orgId", o.name AS "orgName", s.name, s.email
       FROM staff_sessions x JOIN staff s ON s.id = x.staff_id JOIN orgs o ON o.id = s.org_id
      WHERE x.token_hash = $1 AND x.revoked_at IS NULL AND x.expires_at > clock_timestamp() AND s.active`,
    [sha256(token)])).rows[0];
  if (!row) throw signedOut();
  return row;
}

export async function login(request: Request): Promise<Response> {
  const input = await readJson(request);
  const email = str(input.email, 254).toLowerCase(), password = str(input.password, 200, { trim: false });
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const emailHash = sha256(`email:${email}`), ipHash = sha256(`ip:${ip}`);
  const found = await tx(async db => {
    const recent = (await db.query<{ email: string; ip: string }>(
      `SELECT count(*) FILTER (WHERE email_hash = $1)::text AS email, count(*) FILTER (WHERE ip_hash = $2)::text AS ip
         FROM login_attempts WHERE NOT succeeded AND at > now() - interval '15 minutes' AND (email_hash = $1 OR ip_hash = $2)`,
      [emailHash, ipHash])).rows[0];
    if (Number(recent.email) >= 5 || Number(recent.ip) >= 20) return { limited: true as const };
    const staff = (await db.query<{ id: string; password_hash: string }>(
      "SELECT id, password_hash FROM staff WHERE email = $1 AND active", [email])).rows[0];
    return { limited: false as const, staff };
  });
  if (found.limited) throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Too many attempts. Wait a few minutes and try again.");
  const ok = await verifyPassword(password, found.staff?.password_hash ?? await dummy()) && Boolean(found.staff);
  const token = randomBytes(32).toString("base64url");
  await tx(async db => {
    await db.query("INSERT INTO login_attempts (email_hash, ip_hash, succeeded) VALUES ($1, $2, $3)", [emailHash, ipHash, ok]);
    if (ok) await db.query(`INSERT INTO staff_sessions (token_hash, staff_id, expires_at) VALUES ($1, $2, now() + interval '${STAFF_HOURS} hours')`,
      [sha256(token), found.staff!.id]);
  });
  if (!ok) throw new ApiError(401, "LOGIN_FAILED", "That email and password don't match.");
  return json({ ok: true }, 200, { "Set-Cookie": cookie(STAFF_COOKIE, token, STAFF_HOURS * 3600, secureCookies()) });
}

export async function logout(request: Request): Promise<Response> {
  await readJson(request);
  const token = readCookie(request, STAFF_COOKIE);
  if (token) await tx(db => db.query("UPDATE staff_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [sha256(token)]));
  return json({ ok: true }, 200, { "Set-Cookie": cookie(STAFF_COOKIE, "", 0, secureCookies()) });
}

// ---- Participants: one device identity per event ----

export type Participant = { id: string; eventId: string; displayName: string; businessName: string; canBid: boolean };
export const participantCookie = (eventId: string) => `bzp_${eventId.replace(/-/g, "")}`;

/** Returns the participant for this device, or null. Access ends at the event's access end. */
export async function participantFrom(db: Db, request: Request, eventId: string): Promise<Participant | null> {
  const token = readCookie(request, participantCookie(eventId));
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const row = (await db.query<Participant>(
    `SELECT p.id, p.event_id AS "eventId", p.display_name AS "displayName", p.business_name AS "businessName", p.can_bid AS "canBid"
       FROM participants p JOIN events e ON e.id = p.event_id
      WHERE p.token_hash = $1 AND p.event_id = $2 AND e.access_ends_at > clock_timestamp()`,
    [sha256(token), eventId])).rows[0];
  return row ?? null;
}

export async function requireParticipant(db: Db, request: Request, eventId: string): Promise<Participant> {
  const participant = await participantFrom(db, request, eventId);
  if (!participant) throw new ApiError(401, "NOT_JOINED", "Join the event to continue.");
  return participant;
}

export function participantCookieHeader(eventId: string, token: string, accessEndsAt: Date, at: Date): string {
  return cookie(participantCookie(eventId), token, (accessEndsAt.getTime() - at.getTime()) / 1000, secureCookies());
}

export { now };
