import { chromium } from "playwright";

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4321";
const RUNS = Number(process.env.KEEPOUT_RUNS || 16);

async function scrollToClosing(page) {
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
}

async function sampleContactKeepHits(page, samples = 40, intervalMs = 100) {
  let totalHits = 0;
  for (let i = 0; i < samples; i += 1) {
    const hits = await page.evaluate(() => {
      const rectsOverlap = (a, b) =>
        a.left < b.right &&
        a.right > b.left &&
        a.top < b.bottom &&
        a.bottom > b.top;
      const email = document.querySelector(".home-footer__email");
      const pills = [...document.querySelectorAll(".home-footer__social-pill")];
      const sitemap = document.querySelector(
        'a.home-closing-link--primary[data-splash-key="sitemap"]',
      );
      const contact = [email, sitemap, ...pills].filter(Boolean);
      const contactRects = contact.map((el) => {
        const r = el.getBoundingClientRect();
        const pad = 6;
        return {
          left: r.left - pad,
          top: r.top - pad,
          right: r.right + pad,
          bottom: r.bottom + pad,
        };
      });
      const cursorParts = [
        ...document.querySelectorAll(
          ".home-drifting-cursor__ptr, .home-drifting-cursor__tag",
        ),
      ].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 2 && r.height > 2;
      });
      let n = 0;
      for (const part of cursorParts) {
        const r = part.getBoundingClientRect();
        const box = {
          left: r.left - 3,
          top: r.top - 3,
          right: r.right + 3,
          bottom: r.bottom + 3,
        };
        for (const c of contactRects) {
          if (rectsOverlap(box, c)) n += 1;
        }
      }
      return n;
    });
    totalHits += hits;
    await page.waitForTimeout(intervalMs);
  }
  return totalHits;
}

const browser = await chromium.launch();
const report = [];
for (const viewport of [
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
]) {
  const runHits = [];
  for (let run = 0; run < RUNS; run += 1) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 120_000 });
    await scrollToClosing(page);
    runHits.push(await sampleContactKeepHits(page));
    await ctx.close();
  }
  report.push({
    viewport: `${viewport.width}x${viewport.height}`,
    runs: runHits,
    brushingRuns: runHits.filter((h) => h > 0).length,
  });
}
await browser.close();
console.log(JSON.stringify(report, null, 2));
const ok = report.every((r) => r.brushingRuns === 0);
process.exit(ok ? 0 : 1);
