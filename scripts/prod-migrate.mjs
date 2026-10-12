#!/usr/bin/env node
// Applies migrations/prod/*.sql in order, once each. Usage:
//   BIDZIZI_DATABASE_URL=... node scripts/prod-migrate.mjs
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";

const url = process.env.BIDZIZI_DATABASE_URL;
if (!url) { console.error("Set BIDZIZI_DATABASE_URL."); process.exit(2); }
const local = new URL(url).hostname === "127.0.0.1";
const client = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: true } });
await client.connect();
try {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
  const dir = new URL("../migrations/prod/", import.meta.url);
  const files = (await readdir(dir)).filter(f => /^\d{3}_.+\.sql$/.test(f)).sort();
  const applied = new Map((await client.query("SELECT name, sha256 FROM schema_migrations")).rows.map(r => [r.name, r.sha256]));
  for (const file of files) {
    const sql = await readFile(new URL(file, dir), "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");
    if (applied.has(file)) {
      if (applied.get(file) !== hash) throw new Error(`${file} changed after it was applied. Add a new migration instead.`);
      continue;
    }
    // Each file manages its own transaction; record it right after.
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (name, sha256) VALUES ($1, $2)", [file, hash]);
    console.log(`applied ${file}`);
  }
  console.log("migrations up to date");
} finally { await client.end(); }
