import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { testMode, type TestMode } from "./config";
import { forbidden, unauthenticated, object, text, json, mutationMode, body, validation } from "./http";
import { transaction } from "./db";

export type Organization = { id: string; name: string; initials: string };
export type Identity = { person: { id: string; name: string }; organizations: Organization[] };
export const anonymous = (enabled: boolean) => ({ authenticated: false, testMode: enabled });
const sessionJSON = (identity: Identity) => ({ authenticated: true, testMode: true, person: identity.person, staffOrganizations: identity.organizations });
export function sessionHash(request: Request): string | null {
  const cookie = (request.headers.get("cookie") ?? "").split(";").map(v => v.trim()).find(v => v.startsWith("bz_session="));
  const token = cookie?.slice("bz_session=".length);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? createHash("sha256").update(token).digest("hex") : null;
}
async function organizations(client: PoolClient, personId: string): Promise<Organization[]> {
  const rows = await client.query<Organization>(
    `SELECT o.id,o.name,o.initials FROM bz_staff_grants g JOIN bz_orgs o ON o.id=g.org_id
     WHERE g.person_id=$1 AND g.active ORDER BY o.name FOR SHARE OF g,o`, [personId]);
  return rows.rows;
}
export async function identity(client: PoolClient, request: Request): Promise<Identity> {
  if (!testMode(request)) throw unauthenticated();
  const hash = sessionHash(request);
  if (!hash) throw unauthenticated();
  const result = await client.query<{ id: string; name: string }>(
    `SELECT p.id,p.name FROM bz_sessions s JOIN bz_people p ON p.id=s.person_id
     WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND p.active AND p.is_test
     FOR SHARE OF s,p`, [hash]);
  const person = result.rows[0];
  if (!person) throw unauthenticated();
  return { person, organizations: await organizations(client, person.id) };
}
export async function staff(client: PoolClient, request: Request): Promise<Identity> {
  const actor = await identity(client, request);
  if (!actor.organizations.length) throw forbidden();
  return actor;
}
export function grant(actor: Identity, orgId: string): Organization {
  const organization = actor.organizations.find(o => o.id === orgId);
  if (!organization) throw forbidden();
  return organization;
}
function cookie(token: string, mode: TestMode, expired = false): string {
  return `bz_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${expired ? 0 : 28800}${mode.secure ? "; Secure" : ""}`;
}
export async function getSession(request: Request): Promise<Response> {
  const mode = testMode(request);
  if (!mode || !sessionHash(request)) return json(anonymous(Boolean(mode)));
  try { return json(await transaction(async client => sessionJSON(await identity(client, request)))); }
  catch (error) {
    if (error instanceof Error && "status" in error && error.status === 401) return json(anonymous(true));
    throw error;
  }
}
export async function login(request: Request): Promise<Response> {
  const mode = mutationMode(request);
  const input = object(await body(request), ["account"]);
  const account = text(input.account, 40);
  if (!["staff-saturn", "staff-pine", "bidder-juniper", "bidder-harbor", "bidder-juniper-coworker", "bidder-member", "bidder-viewer", "bidder-unlisted", "bidder-pine", "bidder-bid-only"].includes(account)) throw validation();
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const result = await transaction(async client => {
    const found = await client.query<{ id: string; name: string }>(
      "SELECT id,name FROM bz_people WHERE alias=$1 AND active AND is_test FOR SHARE", [account]);
    const person = found.rows[0];
    if (!person) throw forbidden();
    const previous = sessionHash(request);
    if (previous) await client.query("UPDATE bz_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL", [previous]);
    await client.query("INSERT INTO bz_sessions(token_hash,person_id,expires_at) VALUES($1,$2,now()+interval '8 hours')", [hash,person.id]);
    return sessionJSON({ person, organizations: await organizations(client, person.id) });
  });
  return json(result, 200, { "Set-Cookie": cookie(token, mode) });
}
export async function logout(request: Request): Promise<Response> {
  const mode = mutationMode(request);
  object(await body(request), []);
  const hash = sessionHash(request);
  if (hash) await transaction(async client => {
    await client.query("UPDATE bz_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL", [hash]);
  });
  return json(anonymous(true), 200, { "Set-Cookie": cookie("", mode, true) });
}
