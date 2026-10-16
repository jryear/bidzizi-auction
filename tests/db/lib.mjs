// Shared helpers for database tests. Each test gets its own throwaway database on a loopback cluster.
//   BIDZIZI_TEST_PG=postgres://user@127.0.0.1:PORT
import { randomBytes } from "node:crypto";
import pg from "pg";

const base = process.env.BIDZIZI_TEST_PG ?? "";
function at(name) {
  if (!/^postgres(?:ql)?:\/\/[^@/]+@127\.0\.0\.1:\d+\/?$/.test(base)) {
    console.error("Set BIDZIZI_TEST_PG to a loopback cluster URL without a database name, e.g. postgres://bz@127.0.0.1:55480");
    process.exit(99);
  }
  return `${base.replace(/\/$/, "")}/${name}`;
}

const results = [];
export async function check(name, run) {
  try { await run(); results.push(true); console.log(`ok   ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${name}\n     ${error.stack?.split("\n").slice(0, 3).join("\n     ")}`); }
}
export function done() {
  const failed = results.filter(r => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
}

/** A fresh empty bz_test_* database with one connected client; drop() removes it. */
export async function freshDb() {
  const name = `bz_test_${randomBytes(5).toString("hex")}`;
  const admin = new pg.Client({ connectionString: at("postgres") });
  await admin.connect(); await admin.query(`CREATE DATABASE ${name}`); await admin.end();
  const extra = [];
  const connect = async () => { const c = new pg.Client({ connectionString: at(name) }); await c.connect(); extra.push(c); return c; };
  const client = await connect();
  return {
    name, url: at(name), client, connect,
    async drop() {
      for (const c of extra) await c.end().catch(() => {});
      const a = new pg.Client({ connectionString: at("postgres") });
      await a.connect(); await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); await a.end();
    },
  };
}

/** A browser-like HTTP client with its own cookie jar. Extra headers (e.g. x-forwarded-for) apply to every call. */
export function client(BASE, extra = {}) {
  const jar = new Map();
  return async function call(method, path, body, headers1 = {}) {
    const headers = { origin: BASE, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), ...extra, ...headers1 };
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    for (const set of response.headers.getSetCookie()) {
      const [pair] = set.split(";"); const [k, ...v] = pair.split("=");
      if (/Max-Age=0/.test(set)) jar.delete(k); else jar.set(k, v.join("="));
    }
    const type = response.headers.get("content-type") ?? "";
    return { status: response.status, data: type.includes("json") ? await response.json() : await response.text() };
  };
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** The app's own database, only when it is a loopback bz_test_* database. */
export function appDbUrl() {
  const url = process.env.BIDZIZI_DATABASE_URL ?? "";
  if (!/^postgres(?:ql)?:\/\/[^@/]*@?127\.0\.0\.1:\d+\/bz_test_[a-z0-9_]+$/.test(url)) {
    console.error("Set BIDZIZI_DATABASE_URL to the running app's loopback bz_test_* database.");
    process.exit(99);
  }
  return url;
}
