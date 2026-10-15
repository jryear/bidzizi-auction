import "server-only";
// Device and error reports from guests' phones and staff browsers, and the Studio's view of them.
// Reports are small, rate-limited, and carry no personal data beyond the joined participant (from its cookie, never the
// payload) or the signed-in staff member. The user agent comes from the request header.
import { readUserAgent } from "../../lib/ua";
import { now, tx, type Db } from "./db";
import { participantFrom, staffFrom } from "./auth";
import { ApiError, id, invalid, json, notFound, sha256 } from "./http";
import { allowedOrigin } from "./env";
import type { EventRow } from "./engine";
import { queueAlert } from "./alerts";

const KINDS = ["device", "error", "health"] as const;
const PER_DEVICE_PER_MINUTE = 30, PER_IP_PER_MINUTE = 120, RETENTION_DAYS = 30, MAX_BODY = 8 * 1024;
const clip = (v: unknown, max: number) => typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").slice(0, max) : "";

/** Telemetry may arrive by sendBeacon (text/plain) as well as fetch. It must still come from our own pages. */
async function readReport(request: Request): Promise<Record<string, unknown>> {
  const origin = request.headers.get("origin");
  if (origin !== null ? origin !== allowedOrigin(request) : request.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiError(403, "FORBIDDEN", "This request is not allowed.");
  if (!/^(application\/json|text\/plain)/i.test(request.headers.get("content-type") ?? "")) throw invalid();
  if (Number(request.headers.get("content-length")) > MAX_BODY) throw new ApiError(413, "TOO_LARGE", "This report is too large.");
  const reader = request.body?.getReader(); if (!reader) throw invalid();
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length;
    if (size > MAX_BODY) throw new ApiError(413, "TOO_LARGE", "This report is too large."); chunks.push(value); }
  } finally { void reader.cancel().catch(() => {}); }
  const raw = Buffer.concat(chunks).toString("utf8");
  let body: unknown;
  try { body = JSON.parse(raw); } catch { throw invalid(); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid();
  return body as Record<string, unknown>;
}

const diagnostic = (value: unknown, max: number) => clip(value, max * 2)
  .replace(/https?:\/\/[^\s)]+/g, raw => { try { const u = new URL(raw); return u.origin + u.pathname; } catch { return "[url]"; } })
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
  .replace(/(?:password|token|code)=[^\s&]+/gi, "[redacted]")
  .replace(/[A-Za-z0-9_-]{43,}/g, "[redacted]").slice(0, max);
const routePath = (value: unknown) => typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value.split(/[?#]/)[0].slice(0, 200) : "";

type Clean = { kind: (typeof KINDS)[number]; deviceHash: string; viewport: string; route: string; check: string; message: string; detail: string };
function clean(input: Record<string, unknown>): Clean {
  if (!KINDS.includes(input.kind as Clean["kind"])) throw invalid();
  const device = id(input.deviceId);
  const viewport = clip(input.viewport, 20);
  if (viewport && !/^\d{2,5}x\d{2,5}(@\d(\.\d{1,2})?)?$/.test(viewport)) throw invalid();
  const kind = input.kind as Clean["kind"];
  const check = clip(input.check, 60);
  if (check && !/^[a-z0-9-]+$/.test(check)) throw invalid();
  if (kind === "health" && !check) throw invalid();
  if (kind === "error" && !clip(input.message, 500).trim()) throw invalid();
  return { kind, deviceHash: sha256(`device:${device}`), viewport, route: routePath(input.route), check, message: diagnostic(input.message, 500), detail: diagnostic(input.detail, 2000) };
}

async function store(db: Db, request: Request, r: Clean, who: { orgId: string; eventId: string | null; participantId: string | null; staffId: string | null; source: "guest" | "staff" }) {
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ipHash = sha256(`ip:${ip}`);
  // Serialize the count and insert for shared-IP and shared-device limits, including concurrent reports.
  for (const key of [`report-ip:${ipHash}`, `report-device:${r.deviceHash}`].sort())
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
  const recent = (await db.query<{ device: number; ip: number }>(
    `SELECT count(*) FILTER (WHERE device_hash = $1)::int AS device, count(*) FILTER (WHERE ip_hash = $2)::int AS ip
       FROM client_reports WHERE at > now() - interval '1 minute' AND (device_hash = $1 OR ip_hash = $2)`, [r.deviceHash, ipHash])).rows[0];
  if (recent.device >= PER_DEVICE_PER_MINUTE || recent.ip >= PER_IP_PER_MINUTE) throw new ApiError(429, "TOO_MANY_REPORTS", "Too many reports. Try again in a minute.");
  const d = readUserAgent(request.headers.get("user-agent") ?? "");
  await db.query(
    `INSERT INTO client_reports (org_id, event_id, participant_id, staff_id, source, kind, device_hash, ip_hash, browser, browser_version, os, os_version,
                                 device_class, in_app, viewport, route, check_code, message, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
    [who.orgId, who.eventId, who.participantId, who.staffId, who.source, r.kind, r.deviceHash, ipHash, d.browser, d.browserVersion, d.os, d.osVersion,
     d.deviceClass, d.inApp, r.viewport, r.route, r.check, r.message, r.detail]);
  // Enforce retention on every write; the timestamp index bounds the scan.
  await prune(db);
}
export async function prune(db: Db): Promise<number> {
  return (await db.query(`DELETE FROM client_reports WHERE at < now() - interval '${RETENTION_DAYS} days'`)).rowCount ?? 0;
}

/** A guest device reporting in. Works for any live event, joined or not; drafts only for signed-in staff previews. */
export async function guestReport(request: Request, code: string): Promise<Response> {
  const input = clean(await readReport(request));
  await tx(async db => {
    const normalized = code.toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(normalized)) throw notFound("This event");
    const e = (await db.query<EventRow>("SELECT * FROM events WHERE join_code = $1 AND archived_at IS NULL", [normalized])).rows[0];
    if (!e) throw notFound("This event");
    if (e.status !== "live") {
      const staff = await staffFrom(db, request).catch(() => null);
      if (!staff || staff.orgId !== e.org_id) throw notFound("This event");
    }
    const me = await participantFrom(db, request, e.id);
    await store(db, request, input, { orgId: e.org_id, eventId: e.id, participantId: me?.id ?? null, staffId: null, source: "guest" });
  });
  return reportResponse(input, request);
}

/** A staff browser reporting an error (Studio, Live, the stage display). */
export async function staffReport(request: Request): Promise<Response> {
  const input = await readReport(request);
  const r = clean(input);
  const eventId = input.eventId === undefined || input.eventId === null ? null : id(input.eventId);
  await tx(async db => {
    const staff = await staffFrom(db, request);
    const own = eventId ? (await db.query("SELECT 1 FROM events WHERE id = $1 AND org_id = $2", [eventId, staff.orgId])).rows.length > 0 : false;
    if (eventId && !own) throw notFound("This event");
    await store(db, request, r, { orgId: staff.orgId, eventId: own ? eventId : null, participantId: null, staffId: staff.id, source: "staff" });
  });
  return reportResponse(r, request);
}

/** The store transaction has committed before this function is called. */
function reportResponse(r: Clean, request: Request): Response {
  const alertId = r.kind === "error" || (r.kind === "health" && ["app-not-started", "error-boundary", "bid-sheet"].includes(r.check))
    ? queueAlert({ category: "guest-blocked", check: r.kind === "error" ? "client-error" : r.check,
      browser: readUserAgent(request.headers.get("user-agent") ?? "").browser }) : null;
  return json({ ok: true }, 202, alertId ? { "X-BidZizi-Alert-Id": alertId } : {});
}

/** Studio → Live → Devices: the device mix of this event's guests, and every problem anyone (guest or staff) hit. */
export async function eventDevices(request: Request, eventId: string): Promise<Response> {
  return json(await tx(async db => {
    const staff = await staffFrom(db, request);
    const e = (await db.query<{ id: string }>("SELECT id FROM events WHERE id = $1 AND org_id = $2", [id(eventId), staff.orgId])).rows[0];
    if (!e) throw notFound("This event");
    const at = await now(db);
    // Each device once, as it last reported, with whether it has joined.
    const devices = (await db.query<{ browser: string; browser_version: string; os: string; os_version: string; device_class: string; in_app: string; joined: boolean; last: Date; problems: number }>(
      `SELECT DISTINCT ON (device_hash) browser, browser_version, os, os_version, device_class, in_app,
              bool_or(participant_id IS NOT NULL) OVER (PARTITION BY device_hash) AS joined,
              max(at) OVER (PARTITION BY device_hash) AS last,
              (count(*) FILTER (WHERE kind <> 'device') OVER (PARTITION BY device_hash))::int AS problems
         FROM client_reports WHERE event_id = $1 AND at > now() - interval '30 days' AND source = 'guest' ORDER BY device_hash, at DESC`, [e.id])).rows;
    const groups = new Map<string, { browser: string; version: string; os: string; osVersion: string; deviceClass: string; inApp: string; devices: number; joined: number; active: number; problems: number }>();
    for (const d of devices) {
      const key = [d.browser, d.browser_version, d.os, d.os_version, d.in_app].join("|");
      const g = groups.get(key) ?? { browser: d.browser, version: d.browser_version, os: d.os, osVersion: d.os_version, deviceClass: d.device_class, inApp: d.in_app, devices: 0, joined: 0, active: 0, problems: 0 };
      g.devices++; if (d.joined) g.joined++; if (at.getTime() - d.last.getTime() < 10 * 60_000) g.active++; g.problems += d.problems;
      groups.set(key, g);
    }
    const problems = (await db.query<{ id: string; at: Date; source: string; kind: string; check_code: string; message: string; detail: string; route: string;
      browser: string; browser_version: string; os: string; os_version: string; in_app: string; viewport: string; display_name: string | null; business_name: string | null; staff_name: string | null }>(
      `SELECT r.id::text, r.at, r.source, r.kind, r.check_code, r.message, r.detail, r.route, r.browser, r.browser_version, r.os, r.os_version, r.in_app, r.viewport,
              p.display_name, p.business_name, s.name AS staff_name
         FROM client_reports r LEFT JOIN participants p ON p.id = r.participant_id LEFT JOIN staff s ON s.id = r.staff_id
        WHERE r.event_id = $1 AND r.at > now() - interval '30 days' AND r.kind <> 'device' ORDER BY r.at DESC LIMIT 50`, [e.id])).rows;
    return {
      serverNow: at,
      totals: { devices: devices.length, joined: devices.filter(d => d.joined).length, active: devices.filter(d => at.getTime() - d.last.getTime() < 10 * 60_000).length,
        problems: problems.length },
      groups: [...groups.values()].sort((a, b) => b.devices - a.devices),
      problems: problems.map(p => ({ id: p.id, at: p.at, source: p.source, kind: p.kind, check: p.check_code, message: p.message, detail: p.detail, route: p.route,
        browser: p.browser, version: p.browser_version, os: p.os, osVersion: p.os_version, inApp: p.in_app, viewport: p.viewport,
        who: p.source === "staff" ? (p.staff_name ? `${p.staff_name} (staff)` : "Staff") : p.display_name ? `${p.display_name}, ${p.business_name}` : "A guest who hasn't joined" })),
    };
  }));
}
