#!/usr/bin/env node
// Creates an owner account (or resets an account's password and restores its access), creating its organization if needed.
//   BIDZIZI_DATABASE_URL=... node scripts/provision-staff.mjs --org saturn --org-name "Saturn" --email you@example.com --name "Your Name"
// The password is read from the terminal (hidden) or from BIDZIZI_STAFF_PASSWORD.
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import { parseArgs } from "node:util";
import readline from "node:readline";
import pg from "pg";

const scrypt = promisify(scryptCb);
const { values } = parseArgs({ options: { org: { type: "string" }, "org-name": { type: "string" }, email: { type: "string" }, name: { type: "string" } } });
const url = process.env.BIDZIZI_DATABASE_URL;
if (!url || !values.org || !values.email || !values.name) {
  console.error("Usage: BIDZIZI_DATABASE_URL=... node scripts/provision-staff.mjs --org <slug> [--org-name <name>] --email <email> --name <name>");
  process.exit(2);
}

async function askHidden(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = text => { if (text.includes(prompt)) process.stdout.write(text); };
  const answer = await new Promise(resolve => rl.question(prompt, resolve));
  rl.close(); process.stdout.write("\n");
  return answer;
}
const password = process.env.BIDZIZI_STAFF_PASSWORD ?? await askHidden("Password (min 10 characters): ");
if (password.length < 10) { console.error("Use at least 10 characters."); process.exit(2); }

const N = 32768, r = 8, p = 1, salt = randomBytes(16);
const key = await scrypt(password, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
const hash = `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${key.toString("base64url")}`;

class Refusal extends Error {}
let client;
try {
  const local = new URL(url).hostname === "127.0.0.1";
  client = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: true } });
  await client.connect();
  await client.query("BEGIN");
  const org = (await client.query(
    `INSERT INTO orgs (slug, name) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET name = coalesce($3, orgs.name) RETURNING id`,
    [values.org, values["org-name"] ?? values.org, values["org-name"] ?? null])).rows[0];
  const staff = (await client.query(
    `INSERT INTO staff (org_id, email, name, password_hash, role) VALUES ($1, lower($2), $3, $4, 'owner')
     ON CONFLICT (email) DO UPDATE SET password_hash = $4, name = $3, active = true, deactivated_at = NULL, deactivated_by = NULL
     RETURNING id, (xmax = 0) AS created, org_id`,
    [org.id, values.email.trim(), values.name, hash])).rows[0];
  if (staff.org_id !== org.id) throw new Refusal("That email already belongs to another organization.");
  // A password reset signs out existing sessions.
  await client.query("UPDATE staff_sessions SET revoked_at = now() WHERE staff_id = $1 AND revoked_at IS NULL", [staff.id]);
  await client.query("COMMIT");
  console.log(staff.created ? `Created staff account ${values.email}.` : `Reset password for ${values.email}.`);
} catch (error) {
  await client?.query("ROLLBACK").catch(() => {});
  // Show our own refusals; never echo driver or connection errors, which can carry host details.
  console.error(error instanceof Refusal ? error.message : `Could not provision the account${error?.code ? ` (${error.code})` : ""}. Check BIDZIZI_DATABASE_URL.`);
  process.exitCode = 1;
} finally { await client?.end().catch(() => {}); }
