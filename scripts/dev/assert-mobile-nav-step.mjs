/**
 * Mobile nav must match the band flush under the toolbar at every scroll step.
 */
import { chromium } from "playwright";
import {
  CANVAS_HEX,
  RESOLVE_BAND_UNDER_NAV_SOURCE,
} from "./mobile-nav-band-resolve.mjs";

export const NAV_STEP_VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 767, height: 900 },
];

const STEP_PX = 10;
export const NAV_STEP_STABILITY_RUNS = 5;

async function sweepViewport(page, viewport) {
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "1";
  });
  const maxScroll = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  const mismatches = [];
  let steps = 0;

  for (let y = 0; y <= maxScroll; y += STEP_PX) {
    await page.evaluate((scrollY) => {
      window.scrollTo(0, scrollY);
      window.dispatchEvent(new Event("scroll"));
    }, y);
    await page.waitForTimeout(40);
    await page
      .waitForFunction(
        (resolveSrc) => {
          // eslint-disable-next-line no-eval
          eval(resolveSrc);
          const nav = document.querySelector(".home-navbar");
          if (!nav) return true;
          const navBg = getComputedStyle(nav).backgroundColor;
          const band = resolveBandUnderMobileNav();
          if (!band?.theme) return true;
          const pageAccent = document.documentElement.dataset.pageAccent ?? "";
          if (pageAccent !== band.theme) return false;
          const parse = (css) => {
            const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            return m
              ? [Number(m[1]), Number(m[2]), Number(m[3])]
              : null;
          };
          const a = parse(navBg);
          const b = parse(band.bandBg);
          if (!a || !b) return false;
          const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
          return d <= 48;
        },
        RESOLVE_BAND_UNDER_NAV_SOURCE,
        { timeout: 350 },
      )
      .catch(() => {});

    const sample = await page.evaluate(
      ({ scrollY, canvasHex, resolveSrc }) => {
        // eslint-disable-next-line no-eval
        eval(resolveSrc);
        const nav = document.querySelector(".home-navbar");
        const navBg = nav ? getComputedStyle(nav).backgroundColor : "";
        const band = resolveBandUnderMobileNav();
        const pageAccent = document.documentElement.dataset.pageAccent ?? "";
        if (!band?.theme) {
          return {
            scrollY,
            ok: true,
            skipped: true,
            navBg,
            pageAccent,
          };
        }
        const expectedHex = canvasHex[band.theme];
        const parse = (css) => {
          const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          return m
            ? [Number(m[1]), Number(m[2]), Number(m[3])]
            : null;
        };
        const hexToRgb = (hex) => {
          const h = hex.replace("#", "");
          return [
            Number.parseInt(h.slice(0, 2), 16),
            Number.parseInt(h.slice(2, 4), 16),
            Number.parseInt(h.slice(4, 6), 16),
          ];
        };
        const dist = (a, b) =>
          Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        const navRgb = parse(navBg);
        const bandRgb = parse(band.bandBg);
        const expectedRgb = expectedHex ? hexToRgb(expectedHex) : null;
        const navMatchesBand =
          navRgb && bandRgb ? dist(navRgb, bandRgb) <= 48 : false;
        const navMatchesTheme =
          navRgb && expectedRgb ? dist(navRgb, expectedRgb) <= 48 : false;
        const accentOk = pageAccent === band.theme;
        const ok =
          accentOk && (navMatchesBand || navMatchesTheme);
        return {
          scrollY,
          ok,
          skipped: false,
          navBg,
          bandBg: band.bandBg,
          theme: band.theme,
          pageAccent,
          accentOk,
          navMatchesBand,
          navMatchesTheme,
        };
      },
      {
        scrollY: y,
        canvasHex: CANVAS_HEX,
        resolveSrc: RESOLVE_BAND_UNDER_NAV_SOURCE,
      },
    );

    steps += 1;
    if (!sample.skipped && !sample.ok) {
      mismatches.push(sample);
    }
  }

  return {
    viewport: `${viewport.width}x${viewport.height}`,
    steps,
    maxScroll,
    mismatches,
    mismatchCount: mismatches.length,
    ok: mismatches.length === 0,
  };
}

export async function runMobileNavStepOnce(browser, baseUrl) {
  const byViewport = [];
  let ok = true;
  for (const viewport of NAV_STEP_VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
    const row = await sweepViewport(page, viewport);
    byViewport.push(row);
    if (!row.ok) ok = false;
    await ctx.close();
  }
  return { ok, byViewport };
}

export async function runMobileNavStepGate(browser, baseUrl, runs = NAV_STEP_STABILITY_RUNS) {
  const runReports = [];
  let ok = true;
  for (let i = 1; i <= runs; i += 1) {
    const report = await runMobileNavStepOnce(browser, baseUrl);
    runReports.push({ run: i, ...report });
    if (!report.ok) {
      ok = false;
      break;
    }
  }
  return { ok, stabilityRuns: runs, runReports };
}
