#!/usr/bin/env node
// Contract real-v1-preview-001, regression: the existing connected suites stay green against a
// fresh disposable database and this tree's own app server. Run only through the kernel verifier.
import { spawnSync } from "node:child_process";
import { harness, receipt, requireVerifyEnv, database, appServer } from "./lib/stack.mjs";

// tests/v1/items-ui.mjs and tests/v1/photos.mjs are not run here: they drive the photo UI that
// real-v1-photos-001 replaces, so that tranche updates them itself.
const SUITES = [
  ["JOURNEY", "tests/v1/journey.mjs"],
  ["OPERATIONS_UI", "tests/v1/operations-ui.mjs"],
  ["STUDIO_SAVING", "tests/v1/studio-saving.mjs"],
  ["BID_SHEET", "tests/v1/bid-sheet.mjs"],
  ["SIMPLE_UI", "tests/v1/simple-ui.mjs"],
];

await harness(async onExit => {
  requireVerifyEnv();
  const r = receipt("connected suites stay green", SUITES.map(([id]) => id));
  const { dbUrl, email, password } = await database(onExit);
  const { base } = await appServer(onExit, dbUrl);
  for (const [id, file] of SUITES) {
    const run = spawnSync(process.execPath, [file], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 600_000,
      env: { ...process.env, BASE: base, HOST_EMAIL: email, HOST_PASSWORD: password, BIDZIZI_DATABASE_URL: dbUrl } });
    const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;
    const fails = out.split("\n").filter(l => /^\s*(FAIL|not ok)\b/.test(l)).slice(0, 4).join(" | ");
    r.expect(id, run.status === 0, `exit ${run.status}${run.status === 0 ? "" : `: ${fails || out.trim().split("\n").slice(-4).join(" | ")}`}`);
  }
  return r.write();
});
