/**
 * Exit 0/1 wrapper for mobile pre-tail nav sweep vs main.
 *   MAIN_PREVIEW_URL=... PREVIEW_URL=... node scripts/dev/run-pretail-nav-sweep-check.mjs
 */
import { chromium } from "playwright";
import { runMobilePretailNavSweepGate } from "./assert-mobile-pretail-nav-sweep.mjs";

const MAIN = process.env.MAIN_PREVIEW_URL || "";
const BRANCH = process.env.PREVIEW_URL || "http://127.0.0.1:4321";

if (!MAIN) {
  console.error("MAIN_PREVIEW_URL is required");
  process.exit(1);
}

const browser = await chromium.launch();
const result = await runMobilePretailNavSweepGate(browser, MAIN, BRANCH);
await browser.close();
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
