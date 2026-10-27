/**
 * Dense pre-tail mobile nav accent sweep vs main (catches 390 profile gaps).
 */
import { SAMPLE_NAV_ACCENT_SOURCE } from "./mobile-nav-band-resolve.mjs";

const WIDTHS = [375, 390, 430, 767];
const VIEWPORT_HEIGHT = 844;
const COARSE_STEP = 64;
const FINE_STEP = 16;
const FINE_WINDOW_PX = 900;
const SCROLL_SETTLE_MS = 160;

async function settleScroll(page, scrollY) {
  if (page.isClosed()) {
    throw new Error("pre-tail nav sweep: page closed before scroll settle");
  }
  await page.evaluate((y) => window.scrollTo(0, y), scrollY);
  await page
    .waitForFunction(
      (target) => Math.abs(window.scrollY - target) <= 1,
      scrollY,
      { timeout: 8_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(SCROLL_SETTLE_MS);
}

async function pretailSweep(page, width) {
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "1";
  });
  await page
    .waitForFunction(
      () => document.documentElement.dataset.logoMorph !== "pending",
      { timeout: 20_000 },
    )
    .catch(() => {});
  const { tailTop, max } = await page.evaluate(() => {
    const tail = document.querySelector(".home-closing-tail");
    return {
      tailTop: Math.round(
        tail.getBoundingClientRect().top + window.scrollY,
      ),
      max: document.documentElement.scrollHeight - window.innerHeight,
    };
  });
  const ys = [];
  for (let y = 0; y <= max; y += y >= tailTop - FINE_WINDOW_PX ? FINE_STEP : COARSE_STEP) {
    ys.push(y);
  }
  if (ys.at(-1) !== max) ys.push(max);
  const samples = new Map();
  for (const y of ys) {
    if (y >= tailTop - 64) continue;
    await settleScroll(page, y);
    const sample = await page.evaluate((sampleSrc) => {
      // eslint-disable-next-line no-eval
      eval(sampleSrc);
      return sampleMobileNavAccentState();
    }, SAMPLE_NAV_ACCENT_SOURCE);
    samples.set(y, sample);
  }
  return { width, tailTop, samples };
}

export async function runMobilePretailNavSweepGate(browser, mainUrl, branchUrl) {
  const byWidth = [];
  let ok = true;
  for (const width of WIDTHS) {
    const viewport = { width, height: VIEWPORT_HEIGHT };
    const mainCtx = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      hasTouch: true,
    });
    const mainPage = await mainCtx.newPage();
    await mainPage.goto(mainUrl, { waitUntil: "networkidle", timeout: 120_000 });
    const main = await pretailSweep(mainPage, width);
    await mainCtx.close();

    const branchCtx = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      hasTouch: true,
    });
    const branchPage = await branchCtx.newPage();
    await branchPage.goto(branchUrl, {
      waitUntil: "networkidle",
      timeout: 120_000,
    });
    const branch = await pretailSweep(branchPage, width);
    await branchCtx.close();

    const mismatches = [];
    for (const [y, mainSample] of main.samples) {
      const branchSample = branch.samples.get(y);
      if (!branchSample) continue;
      if (
        mainSample.pageAccent !== branchSample.pageAccent ||
        (mainSample.themeColor || "").toLowerCase() !==
          (branchSample.themeColor || "").toLowerCase()
      ) {
        mismatches.push({
          scrollY: y,
          main: mainSample,
          branch: branchSample,
        });
      }
    }
    const row = {
      width,
      preTailSamples: main.samples.size,
      mismatchCount: mismatches.length,
      mismatches: mismatches.slice(0, 8),
      ok: mismatches.length === 0,
    };
    if (!row.ok) ok = false;
    byWidth.push(row);
  }
  return { ok, byWidth };
}
