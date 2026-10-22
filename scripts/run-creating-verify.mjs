#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";

const script = path.resolve("scripts/verify-creating-interactions.mjs");
const preview = process.env.PREVIEW_URL ?? "http://localhost:4321";

const result = spawnSync(
  "xvfb-run",
  ["-a", "-s", "-screen 0 1440x900x24", "node", script],
  {
    stdio: "inherit",
    env: { ...process.env, PREVIEW_URL: preview },
  },
);

process.exit(result.status ?? 1);
