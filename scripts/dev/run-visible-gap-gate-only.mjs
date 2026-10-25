import { chromium } from "playwright";
import { measureDesktopVisibleGaps } from "./measure-closing-visible-gaps.mjs";

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4321";
const viewports = [
  { width: 768, height: 1024 },
  { width: 800, height: 1024 },
  { width: 900, height: 768 },
  { width: 900, height: 900 },
  { width: 1023, height: 768 },
  { width: 1024, height: 776 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
];

const browser = await chromium.launch();
const rows = [];
for (const viewport of viewports) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120_000 });
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "1";
  });
  await page.waitForFunction(
    () => document.documentElement.dataset.logoMorph !== "pending",
    { timeout: 20_000 },
  );
  await page.evaluate(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.max(0, max));
  });
  await page.waitForTimeout(1500);
  const r = await measureDesktopVisibleGaps(page);
  const label = `${viewport.width}x${viewport.height}`;
  rows.push({
    viewport: label,
    gaps: r.gaps,
    mean: r.mean,
    ok: r.ok,
    ratio: r.ratio,
    collisions: r.collisions,
  });
  console.log(rows[rows.length - 1]);
  await ctx.close();
}
await browser.close();
const ok = rows.every((r) => r.ok);
console.log("all ok:", ok);
process.exit(ok ? 0 : 1);
