#!/usr/bin/env node
// Test runner for the node:test suites in tests/.
//
//   node scripts/run-tests.mjs           unit suites (no external services)
//   node scripts/run-tests.mjs emulator  suites that need the RTDB emulator
//   node scripts/run-tests.mjs all       both
//
// Emulator suites are named *.emulator.test.mjs and expect the Realtime
// Database emulator on 127.0.0.1:9000 (npm run test:emulator starts one with
// the test-only open rules in tests/emulator/).
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] ?? "unit";
if (!["unit", "emulator", "all"].includes(mode)) {
  console.error(`Unknown mode "${mode}". Use unit, emulator or all.`);
  process.exit(2);
}

const files = readdirSync(path.join(root, "tests"))
  .filter((f) => f.endsWith(".test.mjs"))
  .filter((f) => {
    const emulator = f.endsWith(".emulator.test.mjs");
    return mode === "all" || (mode === "emulator" ? emulator : !emulator);
  })
  .sort()
  .map((f) => path.join("tests", f));

if (files.length === 0) {
  console.error(`No ${mode} test files found.`);
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    "--import", "./tests/register.mjs",
    "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
    "--disable-warning=ExperimentalWarning",
    "--test",
    // Suites share process-wide env flags (demo mode, outbound flags), so
    // each file runs in its own process; within a file tests run in order.
    "--test-concurrency=4",
    ...files,
  ],
  { cwd: root, stdio: "inherit" }
);
process.exit(result.status ?? 1);
