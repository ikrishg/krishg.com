#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";

const preview = process.env.PREVIEW_URL ?? "http://localhost:4321";
const steps = [
  ["node", path.resolve("scripts/creating-bundle-check.mjs")],
  [
    "xvfb-run",
    "-a",
    "-s",
    "-screen 0 1440x900x24",
    "node",
    path.resolve("scripts/verify-creating-dom.mjs"),
  ],
];

for (const cmd of steps) {
  const result = spawnSync(cmd[0], cmd.slice(1), {
    stdio: "inherit",
    env: { ...process.env, PREVIEW_URL: preview },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
