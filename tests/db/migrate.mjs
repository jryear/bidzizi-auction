#!/usr/bin/env node
// Migration runner: atomic body + ledger, one runner at a time, unchanged checksums.
//   BIDZIZI_TEST_PG=postgres://user@127.0.0.1:PORT node tests/db/migrate.mjs
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { migrate, unwrap } from "../../scripts/prod-migrate.mjs";
import { check, freshDb, done } from "./lib.mjs";

const quiet = () => {};
const prodDir = new URL("../../migrations/prod/", import.meta.url);

async function tempDir(files) {
  const dir = await mkdtemp(join(tmpdir(), "bzmig-"));
  for (const [name, sql] of Object.entries(files)) await writeFile(join(dir, name), sql);
  return pathToFileURL(dir + "/");
}

await check("every shipped migration has exactly one outer BEGIN/COMMIT wrapper", async () => {
  for (const f of (await readdir(prodDir)).filter(f => f.endsWith(".sql"))) unwrap(f, await readFile(new URL(f, prodDir), "utf8"));
});

await check("applies all shipped migrations and records the unchanged file hashes; a rerun is a no-op", async () => {
  const db = await freshDb();
  try {
    await migrate(db.client, prodDir, quiet);
    const rows = (await db.client.query("SELECT name, sha256 FROM schema_migrations ORDER BY name")).rows;
    const files = (await readdir(prodDir)).filter(f => /^\d{3}_.+\.sql$/.test(f)).sort();
    assert.deepEqual(rows.map(r => r.name), files);
    for (const r of rows) assert.equal(r.sha256, createHash("sha256").update(await readFile(new URL(r.name, prodDir), "utf8")).digest("hex"));
    const lines = []; await migrate(db.client, prodDir, l => lines.push(l));
    assert.deepEqual(lines, ["migrations up to date"]);
  } finally { await db.drop(); }
});

await check("a crash between the DDL and the ledger row leaves neither, and a rerun applies it once", async () => {
  const db = await freshDb();
  const dir = await tempDir({ "001_a.sql": "-- test\nBEGIN;\nCREATE TABLE crash_probe (id int);\nCOMMIT;\n" });
  try {
    const real = db.client.query.bind(db.client);
    db.client.query = (text, ...rest) => {
      if (typeof text === "string" && text.startsWith("INSERT INTO schema_migrations")) throw new Error("simulated crash");
      return real(text, ...rest);
    };
    await assert.rejects(migrate(db.client, dir, quiet), /simulated crash/);
    db.client.query = real;
    assert.equal((await real("SELECT to_regclass('crash_probe') AS t")).rows[0].t, null);
    assert.equal((await real("SELECT count(*)::int AS n FROM schema_migrations")).rows[0].n, 0);
    await migrate(db.client, dir, quiet);
    assert.equal((await real("SELECT count(*)::int AS n FROM schema_migrations")).rows[0].n, 1);
  } finally { await db.drop(); }
});

await check("a failing statement rolls back the whole file", async () => {
  const db = await freshDb();
  const dir = await tempDir({ "001_a.sql": "BEGIN;\nCREATE TABLE half_done (id int);\nSELECT 1/0;\nCOMMIT;\n" });
  try {
    await assert.rejects(migrate(db.client, dir, quiet));
    assert.equal((await db.client.query("SELECT to_regclass('half_done') AS t")).rows[0].t, null);
  } finally { await db.drop(); }
});

await check("two runners at once apply each migration exactly once", async () => {
  const db = await freshDb();
  const second = await db.connect();
  try {
    await Promise.all([migrate(db.client, prodDir, quiet), migrate(second, prodDir, quiet)]);
    const n = (await db.client.query("SELECT count(*)::int AS n FROM schema_migrations")).rows[0].n;
    assert.equal(n, (await readdir(prodDir)).filter(f => /^\d{3}_.+\.sql$/.test(f)).length);
  } finally { await second.end(); await db.drop(); }
});

await check("a changed applied file is refused", async () => {
  const db = await freshDb();
  const dir = await tempDir({ "001_a.sql": "BEGIN;\nCREATE TABLE t1 (id int);\nCOMMIT;\n" });
  try {
    await migrate(db.client, dir, quiet);
    await writeFile(new URL("001_a.sql", dir), "BEGIN;\nCREATE TABLE t1 (id bigint);\nCOMMIT;\n");
    await assert.rejects(migrate(db.client, dir, quiet), /changed after it was applied/);
  } finally { await db.drop(); }
});

await check("files without the outer wrapper, or with a nested transaction, are refused before running", async () => {
  assert.throws(() => unwrap("x.sql", "CREATE TABLE t (id int);"), /must start with BEGIN/);
  assert.throws(() => unwrap("x.sql", "BEGIN;\nCOMMIT;\nBEGIN;\nCREATE TABLE t (id int);\nCOMMIT;\n"), /nested/);
});

done();
