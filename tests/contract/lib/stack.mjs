// Contract harness support: a disposable database and app server for one verifier phase.
//
// Protocol (kernel schema 2): a check writes one receipt to VERIFY_RESULT_JSON only after it has
// observed its assertions. Anything that stops the harness from observing (no Postgres, migration
// failure, server never ready) is infrastructure: exit 99 and write no receipt, so it can never
// count as a meaningful RED or GREEN.
//
// Requires BZ_CONTRACT_PG: an admin URL for a loopback Postgres, e.g. postgres://bz@127.0.0.1:55433/postgres.
// The harness creates and drops its own bz_test_ct_* database; it never touches an existing one.
import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createServer } from "node:net";
import pg from "pg";

export const HARNESS_EXIT = 99;

export class Infra extends Error {}

/** Run `main`, translating infrastructure failures into exit 99 with no receipt. */
export async function harness(main) {
  const cleanups = [];
  const onExit = fn => cleanups.push(fn);
  let code = HARNESS_EXIT;
  try { code = await main(onExit); }
  catch (error) { console.error(`HARNESS: ${error instanceof Infra ? "" : "unexpected "}${error?.stack ?? error}`); code = HARNESS_EXIT; }
  finally {
    for (const fn of cleanups.reverse()) { try { await fn(); } catch (error) { console.error(`cleanup: ${error?.message ?? error}`); } }
  }
  process.exit(code);
}

/** Collects assertion outcomes; writes the protocol-1 receipt once every assertion has been observed. */
export function receipt(check, ids) {
  const results = new Map();
  return {
    pass(id, detail = "") { record(id, "pass", detail); },
    fail(id, detail = "") { record(id, "fail", detail); },
    /** Record pass/fail from a boolean. Returns the boolean. */
    expect(id, ok, detail = "") { record(id, ok ? "pass" : "fail", detail); return ok; },
    has(id) { return results.has(id); },
    write() {
      const missing = ids.filter(id => !results.has(id));
      if (missing.length) throw new Infra(`harness did not observe: ${missing.join(", ")}`);
      const assertions = ids.map(id => results.get(id));
      for (const a of assertions) console.log(`${a.status === "pass" ? "ok  " : "FAIL"} ${a.id}${a.detail ? `  ${a.detail}` : ""}`);
      writeFileSync(process.env.VERIFY_RESULT_JSON, JSON.stringify({
        protocol: 1, check, phase: process.env.VERIFY_TREE, run_id: process.env.VERIFY_RUN_ID, assertions,
      }));
      return assertions.every(a => a.status === "pass") ? 0 : 1;
    },
  };
  function record(id, status, detail) {
    if (!ids.includes(id)) throw new Infra(`undeclared assertion ${id}`);
    if (results.has(id)) return; // first observation wins
    results.set(id, { id, status, detail: String(detail).slice(0, 600) });
  }
}

export function requireVerifyEnv() {
  for (const k of ["VERIFY_RESULT_JSON", "VERIFY_RUN_ID", "VERIFY_TREE", "VERIFY_ROOT"]) {
    if (!process.env[k]) throw new Infra(`${k} is not set; run through the kernel verifier`);
  }
}

function adminUrl() {
  const raw = process.env.BZ_CONTRACT_PG ?? "";
  let url;
  try { url = new URL(raw); } catch { throw new Infra("BZ_CONTRACT_PG must be a loopback Postgres admin URL"); }
  if (!/^postgres(ql)?:$/.test(url.protocol) || url.hostname !== "127.0.0.1") throw new Infra("BZ_CONTRACT_PG must point at 127.0.0.1");
  return url;
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.unref(); s.on("error", reject);
    s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

/** Create the disposable database, migrate it, provision a staff login. */
export async function database(onExit) {
  const admin = adminUrl();
  const tag = (process.env.VERIFY_RUN_ID ?? randomBytes(6).toString("hex")).replace(/[^a-z0-9]/gi, "").slice(0, 10).toLowerCase();
  const name = `bz_test_ct_${tag}_${(process.env.VERIFY_TREE ?? "x").replace(/[^a-z]/gi, "").toLowerCase()}`;
  const client = new pg.Client({ connectionString: admin.toString() });
  try { await client.connect(); } catch (error) { throw new Infra(`cannot reach contract Postgres: ${error.message}`); }
  try { await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); await client.query(`CREATE DATABASE ${name}`); }
  finally { await client.end(); }
  onExit(async () => {
    const c = new pg.Client({ connectionString: admin.toString() });
    await c.connect(); try { await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); } finally { await c.end(); }
  });
  const url = new URL(admin); url.pathname = `/${name}`;
  const dbUrl = url.toString();
  const email = "host@example.com", password = `ct-${randomBytes(9).toString("hex")}`;
  const env = { ...process.env, BIDZIZI_DATABASE_URL: dbUrl, BIDZIZI_STAFF_PASSWORD: password };
  try {
    execFileSync(process.execPath, ["scripts/prod-migrate.mjs"], { env, stdio: "pipe" });
    execFileSync(process.execPath, ["scripts/provision-staff.mjs", "--org", "saturn", "--org-name", "Saturn", "--email", email, "--name", "Contract Host"], { env, stdio: "pipe" });
  } catch (error) { throw new Infra(`database setup failed: ${error.stderr?.toString() || error.message}`); }
  return { dbUrl, email, password };
}

/** Start `next dev` for this tree on a free loopback port; resolves once the API answers.
 *  Webpack, not Turbopack: verifier snapshots link node_modules from outside the tree, which Turbopack refuses. */
export async function appServer(onExit, dbUrl) {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: process.env.VERIFY_ROOT ?? process.cwd(), detached: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, BIDZIZI_APP_MODE: "local", BIDZIZI_DATABASE_URL: dbUrl, NEXT_TELEMETRY_DISABLED: "1", APP_ORIGIN: base },
  });
  let log = "";
  child.stdout.on("data", d => { log = (log + d).slice(-8000); });
  child.stderr.on("data", d => { log = (log + d).slice(-8000); });
  onExit(async () => {
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* gone */ }
    await new Promise(r => setTimeout(r, 1500));
    try { process.kill(-child.pid, "SIGKILL"); } catch { /* gone */ }
  });
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Infra(`app server exited early:\n${log}`);
    try {
      const r = await fetch(`${base}/api/v1/e/AAAAAA`);
      if (r.status === 404 || r.status === 200) return { base, log: () => log };
    } catch { /* not listening yet */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Infra(`app server not ready within 240s:\n${log}`);
}

/** A cookie-keeping JSON client, like a browser on one device. */
export function client(base) {
  const jar = new Map();
  const call = async (method, path, body) => {
    const headers = { origin: base, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") };
    if (body !== undefined) headers["content-type"] = "application/json";
    let response;
    try { response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" }); }
    catch (error) { throw new Infra(`request ${method} ${path} failed: ${error.message}`); }
    for (const set of response.headers.getSetCookie()) {
      const [pair] = set.split(";"); const [k, ...v] = pair.split("=");
      if (/Max-Age=0/.test(set)) jar.delete(k); else jar.set(k, v.join("="));
    }
    const type = response.headers.get("content-type") ?? "";
    const text = await response.text();
    return { status: response.status, text, data: type.includes("json") && text ? JSON.parse(text) : text };
  };
  call.cookies = () => [...jar].map(([name, value]) => ({ name, value, url: base }));
  return call;
}

/** Fail setup (exit 99) unless a fixture call succeeded: fixtures use only base-era APIs. */
export function must(r, what, status = [200, 201]) {
  if (!status.includes(r.status)) throw new Infra(`fixture step failed (${what}): ${r.status} ${r.text.slice(0, 300)}`);
  return r.data;
}
