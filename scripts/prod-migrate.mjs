#!/usr/bin/env node
// Applies migrations/prod/*.sql in order, once each. Usage:
//   BIDZIZI_DATABASE_URL=... node scripts/prod-migrate.mjs
//
// Each file is written as BEGIN; … COMMIT;. The runner strips that outer wrapper and runs the body
// together with its schema_migrations row in one transaction, so a crash can never leave an applied
// migration recorded as unapplied. A session advisory lock keeps two runners from racing.
// The recorded sha256 is of the file's unchanged bytes.
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";

const LOCK = 0x627a6d67; // "bzmg"

/** Returns the body inside a file's single outer BEGIN; … COMMIT; wrapper, or throws. */
export function unwrap(file, sql) {
  const m = /^((?:\s*--[^\n]*\n|\s+)*)BEGIN;\s*\n([\s\S]*)\nCOMMIT;\s*$/.exec(sql);
  if (!m) throw new Error(`${file} must start with BEGIN; (after comments) and end with COMMIT;.`);
  if (/^\s*(BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION)\s*;/im.test(m[2])) throw new Error(`${file} has a nested transaction statement.`);
  return m[2];
}

export async function migrate(client, dir, log = console.log) {
  await client.query("SELECT pg_advisory_lock($1)", [LOCK]);
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const files = (await readdir(dir)).filter(f => /^\d{3}_.+\.sql$/.test(f)).sort();
    const applied = new Map((await client.query("SELECT name, sha256 FROM schema_migrations")).rows.map(r => [r.name, r.sha256]));
    for (const file of files) {
      const sql = await readFile(new URL(file, dir), "utf8");
      const hash = createHash("sha256").update(sql).digest("hex");
      if (applied.has(file)) {
        if (applied.get(file) !== hash) throw new Error(`${file} changed after it was applied. Add a new migration instead.`);
        continue;
      }
      const body = unwrap(file, sql);
      await client.query("BEGIN");
      try {
        await client.query(body);
        await client.query("INSERT INTO schema_migrations (name, sha256) VALUES ($1, $2)", [file, hash]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      }
      log(`applied ${file}`);
    }
    log("migrations up to date");
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK]).catch(() => {});
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.BIDZIZI_DATABASE_URL;
  if (!url) { console.error("Set BIDZIZI_DATABASE_URL."); process.exit(2); }
  let client;
  try {
    const local = new URL(url).hostname === "127.0.0.1";
    client = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: true } });
    await client.connect();
    await migrate(client, new URL("../migrations/prod/", import.meta.url));
  } catch (error) {
    // Migration errors (a changed file, a failing statement) are ours to show; connection details are not.
    const ours = /^\d{3}_.+\.sql /.test(error?.message ?? "") || error?.code?.length === 5;
    console.error(ours ? `Migration failed: ${error.message}` : "Migration failed: could not connect or run. Check BIDZIZI_DATABASE_URL.");
    process.exitCode = 1;
  } finally {
    await client?.end().catch(() => {});
  }
}
