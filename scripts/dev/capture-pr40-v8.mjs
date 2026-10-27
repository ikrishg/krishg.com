/**
 * PR40 v8 screenshots + layout metrics.
 * PREVIEW_URL=http://127.0.0.1:4321 MAIN_PREVIEW_URL=http://127.0.0.1:4322 \
 *   node scripts/dev/capture-pr40-v8.mjs
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { measureDesktopVisibleGaps } from "./measure-closing-visible-gaps.mjs";
import {
  CURSOR_VIEWPORTS,
  countSettledCursors,
  measureMainCursorBaselines,
  scrollToClosing,
} from "./pr40-cursor-baseline.mjs";
import { PR40_ARTIFACTS_V8 } from "./pr40-metrics-path.mjs";
import { runMobileOverscrollNavGate } from "./assert-mobile-overscroll-nav.mjs";
import { runStackedPrimaryInkGate } from "./assert-stacked-primary-ink.mjs";

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4321";
const MAIN_BASE = process.env.MAIN_PREVIEW_URL || "";
const OUT = process.env.SCREENSHOT_DIR || PR40_ARTIFACTS_V8;
const SETTLE_MS = 1500;

const DESKTOP_GAP_VIEWPORTS = [
  { width: 768, height: 1024 },
  { width: 800, height: 1024 },
  { width: 900, height: 768 },
  { width: 900, height: 900 },
  { width: 1023, height: 768 },
  { width: 1024, height: 776 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
];

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}`, fullPage: false });
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });

const mainBaselines = MAIN_BASE
  ? await measureMainCursorBaselines(browser, MAIN_BASE)
  : {};

const visibleGapTable = [];
for (const vp of DESKTOP_GAP_VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: vp,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120_000 });
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "1";
  });
  await scrollToClosing(page);
  await page.evaluate(() => {
    const root = document.querySelector(".home-drifting-cursors");
    if (root) root.style.visibility = "hidden";
  });
  await page.waitForTimeout(SETTLE_MS);
  const row = await measureDesktopVisibleGaps(page);
  visibleGapTable.push({
    viewport: `${vp.width}x${vp.height}`,
    gaps: row.gaps?.map((g) => Math.round(g)) ?? [],
    ok: row.ok,
  });
  await ctx.close();
}

const cursorCounts = {};
for (const vp of CURSOR_VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: vp,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120_000 });
  await scrollToClosing(page);
  const visible = await countSettledCursors(page);
  cursorCounts[`${vp.width}x${vp.height}`] = {
    branch: visible,
    main: mainBaselines[vp.width] ?? null,
  };
  await ctx.close();
}

const overscrollNav = await runMobileOverscrollNavGate(browser, BASE);
const stackedPrimaryInk = await runStackedPrimaryInkGate(browser, BASE);

for (const { w, h, shots } of [
  { w: 768, h: 1024, shots: ["768x1024-rest.png"] },
  { w: 900, h: 900, shots: ["900x900-rest.png"] },
  { w: 1023, h: 768, shots: ["1023x768-rest.png"] },
  { w: 1280, h: 800, shots: ["1280x800-rest.png"] },
  { w: 1440, h: 900, shots: ["1440x900-rest.png"] },
  { w: 1024, h: 776, shots: ["1024x776-rest.png"] },
  { w: 390, h: 844, shots: ["390x844-rest.png"] },
  { w: 375, h: 844, shots: ["375x844-rest.png"] },
  { w: 430, h: 844, shots: ["430x844-rest.png"] },
]) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120_000 });
  await scrollToClosing(page);
  await shot(page, shots[0]);
  await ctx.close();
}

const metrics = {
  visibleGapTable,
  cursorCounts,
  mainBaselines,
  overscrollNav,
  stackedPrimaryInk,
  artifactsDir: OUT,
};

await writeFile(`${OUT}/layout-metrics.json`, JSON.stringify(metrics, null, 2));
await writeFile(
  `${OUT}/visible-gap-table.json`,
  JSON.stringify(visibleGapTable, null, 2),
);
console.log(JSON.stringify(metrics, null, 2));
await browser.close();
