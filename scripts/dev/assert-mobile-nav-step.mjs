/**
 * Mobile nav accent must match main at every 10px scroll step (375/390/430/767).
 */
import { chromium } from "playwright";
import { SAMPLE_NAV_ACCENT_SOURCE } from "./mobile-nav-band-resolve.mjs";

export const NAV_STEP_VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 767, height: 900 },
];

const STEP_PX = 10;
export const NAV_STEP_STABILITY_RUNS = 5;

async function accentSweep(page, viewport) {
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "1";
  });
  await page
    .waitForFunction(
      () => document.documentElement.dataset.logoMorph !== "pending",
      { timeout: 20_000 },
    )
    .catch(() => {});
  const maxScroll = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  const samples = new Map();
  const preTail = new Map();
  for (let y = 0; y <= maxScroll; y += STEP_PX) {
    const row = await page.evaluate(
      ({ scrollY, sampleSrc }) => {
        window.scrollTo(0, scrollY);
        const tailTop = Math.round(
          document.querySelector(".home-closing-tail").getBoundingClientRect()
            .top + window.scrollY,
        );
        // eslint-disable-next-line no-eval
        eval(sampleSrc);
        return {
          sample: sampleMobileNavAccentState(),
          isPreTail: scrollY < tailTop - 64,
        };
      },
      { scrollY: y, sampleSrc: SAMPLE_NAV_ACCENT_SOURCE },
    );
    await page.waitForTimeout(50);
    samples.set(y, row.sample);
    preTail.set(y, row.isPreTail);
  }
  return {
    viewport: `${viewport.width}x${viewport.height}`,
    maxScroll,
    steps: Math.floor(maxScroll / STEP_PX) + 1,
    samples,
    preTail,
  };
}

function compareSweeps(mainSweep, branchSweep) {
  const mismatches = [];
  for (const [y, main] of mainSweep.samples) {
    if (!mainSweep.preTail.get(y) || !branchSweep.preTail.get(y)) continue;
    const branch = branchSweep.samples.get(y);
    if (!branch) continue;
    const accentOk = main.pageAccent === branch.pageAccent;
    const themeOk =
      (main.themeColor || "").toLowerCase() ===
      (branch.themeColor || "").toLowerCase();
    if (!accentOk || !themeOk) {
      mismatches.push({
        scrollY: y,
        mainAccent: main.pageAccent,
        branchAccent: branch.pageAccent,
        mainTheme: main.themeColor,
        branchTheme: branch.themeColor,
      });
    }
  }
  return {
    viewport: mainSweep.viewport,
    steps: mainSweep.steps,
    mismatchCount: mismatches.length,
    mismatches,
    ok: mismatches.length === 0,
  };
}

async function sweepViewportPair(browser, mainUrl, branchUrl, viewport) {
  const mainCtx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
  });
  const mainPage = await mainCtx.newPage();
  await mainPage.goto(mainUrl, { waitUntil: "networkidle", timeout: 120_000 });
  const mainSweep = await accentSweep(mainPage, viewport);
  await mainCtx.close();

  const branchCtx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
  });
  const branchPage = await branchCtx.newPage();
  await branchPage.goto(branchUrl, {
    waitUntil: "networkidle",
    timeout: 120_000,
  });
  const branchSweep = await accentSweep(branchPage, viewport);
  await branchCtx.close();

  return compareSweeps(mainSweep, branchSweep);
}

export async function runMobileNavStepOnce(browser, branchUrl, mainUrl) {
  if (!mainUrl) {
    return { ok: false, error: "MAIN_PREVIEW_URL required for nav-step vs main" };
  }
  const byViewport = [];
  let ok = true;
  for (const viewport of NAV_STEP_VIEWPORTS) {
    const row = await sweepViewportPair(browser, mainUrl, branchUrl, viewport);
    byViewport.push(row);
    if (!row.ok) ok = false;
  }
  return { ok, byViewport };
}

export async function runMobileNavStepGate(
  browser,
  branchUrl,
  mainUrl,
  runs = NAV_STEP_STABILITY_RUNS,
) {
  const runReports = [];
  let ok = true;
  for (let i = 1; i <= runs; i += 1) {
    const report = await runMobileNavStepOnce(browser, branchUrl, mainUrl);
    runReports.push({ run: i, ...report });
    if (!report.ok) {
      ok = false;
      break;
    }
  }
  return { ok, stabilityRuns: runs, runReports };
}
