/**
 * Write nav-step-5runs.json (default scripts/dev/out) for PR40 artifacts.
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runMobileNavStepGate } from "./assert-mobile-nav-step.mjs";
import { resolvePr40ArtifactsDir } from "./pr40-metrics-path.mjs";

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4321";
const MAIN_BASE = process.env.MAIN_PREVIEW_URL || "";
const ARTIFACTS_DIR = resolvePr40ArtifactsDir();

if (!MAIN_BASE) {
  console.error("MAIN_PREVIEW_URL is required");
  process.exit(1);
}

await mkdir(ARTIFACTS_DIR, { recursive: true });
const browser = await chromium.launch();
const mobileNavStep = await runMobileNavStepGate(browser, BASE, MAIN_BASE, 5);
await browser.close();
await writeFile(
  path.join(ARTIFACTS_DIR, "nav-step-5runs.json"),
  JSON.stringify(mobileNavStep, null, 2),
);
console.log(JSON.stringify({ ok: mobileNavStep.ok, path: ARTIFACTS_DIR }, null, 2));
process.exit(mobileNavStep.ok ? 0 : 1);
