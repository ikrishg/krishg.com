/**
 * PR40 v9 nav-step reference shots.
 * PREVIEW_URL=http://127.0.0.1:4321 node scripts/dev/capture-pr40-v9-navstep.mjs
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { PR40_ARTIFACTS_V9 } from "./pr40-metrics-path.mjs";
import { scrollToClosing } from "./pr40-cursor-baseline.mjs";

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4321";
const OUT = process.env.SCREENSHOT_DIR || PR40_ARTIFACTS_V9;

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });

const shots = [
  { w: 375, h: 812, y: 2196, name: "375x812-y2196-rest.png" },
  { w: 390, h: 844, y: null, name: "390x844-rest.png" },
  { w: 430, h: 932, y: null, name: "430x932-rest.png" },
  { w: 768, h: 1024, y: null, name: "768x1024-rest.png" },
  { w: 900, h: 900, y: null, name: "900x900-rest.png" },
  { w: 1023, h: 768, y: null, name: "1023x768-rest.png" },
];

for (const { w, h, y, name } of shots) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120_000 });
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "1";
  });
  if (y != null) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await page.waitForTimeout(400);
  } else {
    await scrollToClosing(page);
  }
  await page.screenshot({ path: `${OUT}/${name}` });
  await ctx.close();
}

await browser.close();
console.log("saved to", OUT);
