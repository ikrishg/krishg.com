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

/** Directory for gate JSON/logs; defaults to dirname(metrics) under scripts/dev/out/. */
export function resolvePr40ArtifactsDir() {
  if (process.env.PR40_ARTIFACTS_DIR) {
    return process.env.PR40_ARTIFACTS_DIR;
  }
  return path.dirname(resolvePr40MetricsFile());
}

export const PR40_ARTIFACTS_V7 = "/opt/cursor/artifacts/pr40-v7";
export const PR40_ARTIFACTS_V8 = "/opt/cursor/artifacts/pr40-v8";
export const PR40_ARTIFACTS_V9 = "/opt/cursor/artifacts/pr40-v9";
