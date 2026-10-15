#!/usr/bin/env node
// Contract real-v1-preview-001, regression: the gates that need no server stay green.
// Run only through the kernel verifier.
import { spawnSync } from "node:child_process";
import { harness, receipt, requireVerifyEnv } from "./lib/stack.mjs";

const GATES = [
  // Build first: it generates next-env.d.ts (untracked), which the typecheck reads.
  ["NEXT_BUILD", [process.execPath, "node_modules/next/dist/bin/next", "build", "--webpack"]],
  ["TYPECHECK", [process.execPath, "node_modules/typescript/bin/tsc", "--noEmit"]],
  ["COMPAT_GATE", [process.execPath, "scripts/compat.mjs"]],
  ["DISPLAY_LOGIC", [process.execPath, "tests/v1/display-logic.mjs"]],
  ["ITEMS_LOGIC", [process.execPath, "tests/v1/items-logic.mjs"]],
  ["COMPAT_LOGIC", [process.execPath, "tests/v1/compat-logic.mjs"]],
];

await harness(async () => {
  requireVerifyEnv();
  const r = receipt("static gates stay green", GATES.map(([id]) => id));
  for (const [id, [cmd, ...args]] of GATES) {
    const run = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, BIDZIZI_APP_MODE: "local", NEXT_TELEMETRY_DISABLED: "1" } });
    const tail = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim().split("\n").slice(-6).join(" | ");
    r.expect(id, run.status === 0, `exit ${run.status}${run.status === 0 ? "" : `: ${tail}`}`);
  }
  return r.write();
});
