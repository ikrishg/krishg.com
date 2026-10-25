import path from "node:path";
import { fileURLToPath } from "node:url";

const DEV_ROOT = path.dirname(fileURLToPath(import.meta.url));

/** Repo-local default; override with PR40_METRICS_FILE (full file path). */
export function resolvePr40MetricsFile() {
  return (
    process.env.PR40_METRICS_FILE ||
    path.join(DEV_ROOT, "out", "layout-metrics.json")
  );
}

export const PR40_ARTIFACTS_V7 = "/opt/cursor/artifacts/pr40-v7";
export const PR40_ARTIFACTS_V8 = "/opt/cursor/artifacts/pr40-v8";
