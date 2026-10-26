/**
 * PR #40 regression check at closing viewports.
 * Usage:
 *   MAIN_PREVIEW_URL=http://127.0.0.1:4322 PREVIEW_URL=http://127.0.0.1:4321 \
 *     node scripts/dev/verify-pr40-regression.mjs
 */
import { chromium } from "playwright";
import {
  CURSOR_VIEWPORTS,
  cursorVisibleMeetsMainBaseline,
  formatCursorCountFailure,
  measureMainMountedBaselines,
  scrollToClosing,
  waitForStableMountedCount,
} from "./pr40-cursor-baseline.mjs";
import { runMobileOverscrollNavGate } from "./assert-mobile-overscroll-nav.mjs";
import { runMobileNavStepGate } from "./assert-mobile-nav-step.mjs";

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4321";
const MAIN_BASE = process.env.MAIN_PREVIEW_URL || "";
const STABILITY_RUNS = Number(process.env.PR40_VERIFY_STABILITY_RUNS || 5);
const NAV_STEP_RUNS = Number(process.env.PR40_NAV_STEP_STABILITY_RUNS || 1);

const VIEWPORTS = CURSOR_VIEWPORTS;

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

async function scrollToEducator(page) {
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "true";
    const band = document.getElementById("educator");
    if (band) {
      const top =
        band.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo(0, Math.max(0, top));
    } else {
      window.scrollTo(0, 0);
    }
  });
  await page.waitForTimeout(500);
}

async function measureZOrder(page) {
  return page.evaluate(() => {
    const z = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return { sel, missing: true };
      return {
        sel,
        zIndex: getComputedStyle(el).zIndex,
      };
    };
    return {
      cursors: z(".home-drifting-cursors"),
      splash: z(".home-splash-overlay"),
      tail: z(".home-closing-tail"),
      navRow: z(".home-closing-index__nav"),
      primaryRow: z(".home-closing-index__primary"),
      footerEmail: z(".home-closing-tail .home-footer__email"),
      footerSocial: z(".home-closing-tail .home-footer__social"),
    };
  });
}

async function measureCursors(page) {
  const snapshot = () =>
    page.evaluate(() => {
      const root = document.querySelector(".home-drifting-cursors");
      const cursors = root
        ? [...root.querySelectorAll(".home-drifting-cursor")]
        : [];
      const transforms = cursors.map((el) => getComputedStyle(el).transform);
      const visible = cursors.filter((el) => {
        const parts = [
          el,
          ...el.querySelectorAll(
            ".home-drifting-cursor__ptr, .home-drifting-cursor__tag",
          ),
        ];
        return parts.some((part) => {
          const r = part.getBoundingClientRect();
          const opacity = getComputedStyle(part).opacity;
          return r.width > 2 && r.height > 2 && opacity !== "0";
        });
      }).length;
      return {
        mounted: Boolean(root),
        cursorCount: transforms.length,
        visibleCursorCount: visible,
        transforms,
      };
    });
  const a = await snapshot();
  await page.waitForTimeout(2500);
  const b = await snapshot();
  const moved =
    a.transforms.length > 0 &&
    a.transforms.some((t, i) => t !== b.transforms[i]);
  return {
    mounted: b.mounted,
    cursorCount: b.cursorCount,
    visibleCursorCount: b.visibleCursorCount,
    driftDetected: moved,
  };
}

async function sampleContactKeepHits(page, samples = 20, intervalMs = 100) {
  let totalHits = 0;
  let measuredRectsTotal = 0;
  for (let i = 0; i < samples; i += 1) {
    const hits = await page.evaluate(() => {
      const rectsOverlap = (a, b) =>
        a.left < b.right &&
        a.right > b.left &&
        a.top < b.bottom &&
        a.bottom > b.top;
      const email = document.querySelector(".home-footer__email");
      const pills = [
        ...document.querySelectorAll(".home-footer__social-pill"),
      ];
      const contact = [email, ...pills].filter(Boolean);
      const contactRects = contact.map((el) => {
        const r = el.getBoundingClientRect();
        const pad = 4;
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
      return { hits: n, measuredRects: cursorParts.length };
    });
    totalHits += hits.hits;
    measuredRectsTotal += hits.measuredRects;
    await page.waitForTimeout(intervalMs);
  }
  return {
    samples,
    totalContactKeepHits: totalHits,
    measuredCursorRects: measuredRectsTotal,
  };
}

async function heroSplashWhenTailOffScreen(page) {
  await scrollToEducator(page);
  const pre = await page.evaluate(() => ({
    tailTop: document
      .querySelector(".home-closing-tail")
      ?.getBoundingClientRect().top,
    portalVisibility: getComputedStyle(
      document.querySelector("#home-splash-portal") ?? document.body,
    ).visibility,
  }));

  await page.evaluate(() => {
    const band = document.getElementById("educator");
    const rect = band?.getBoundingClientRect();
    const origin = {
      x: (rect?.left ?? 0) + (rect?.width ?? 400) / 2,
      y: (rect?.top ?? 200) + (rect?.height ?? 300) * 0.35,
    };
    window.dispatchEvent(
      new CustomEvent("home-splash:activate", {
        detail: { key: "educating", origin },
      }),
    );
  });
  await page.waitForTimeout(800);

  return page.evaluate((preState) => {
    const band = document.getElementById("educator");
    const r = band?.getBoundingClientRect();
    const x = Math.round((r?.left ?? 0) + (r?.width ?? 0) / 2);
    const y = Math.round((r?.top ?? 0) + (r?.height ?? 0) * 0.4);
    const el = document.elementFromPoint(x, y);
    const splash = document.querySelector(".home-splash-overlay");
    const overlayOpacity = splash
      ? Number.parseFloat(getComputedStyle(splash).opacity)
      : 0;
    const portalVis = getComputedStyle(
      document.querySelector("#home-splash-portal") ?? document.body,
    ).visibility;
    const ds = document.documentElement.dataset.homeSplash ?? "";
    return {
      tailTop: document
        .querySelector(".home-closing-tail")
        ?.getBoundingClientRect().top,
      preTailTop: preState.tailTop,
      dataHomeSplash: ds,
      portalVisibility: portalVis,
      overlayOpacity,
      splashActive: ds === "educating" && overlayOpacity > 0.5,
    };
  }, pre);
}

async function runRegressionOnce(browser, runIndex) {
  if (!MAIN_BASE) {
    return {
      run: runIndex,
      ok: false,
      error: "MAIN_PREVIEW_URL is required for cursor baseline comparison",
    };
  }

  const mainBaselines = await measureMainMountedBaselines(browser, MAIN_BASE, {
    samplesPerViewport: 3,
  });
  const viewports = [];

  for (const viewport of VIEWPORTS) {
    const mainVisible = mainBaselines[viewport.width];
    const expectedVisible = mainVisible;

    const page = await browser.newPage({ viewport });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 120_000 });
    await page.evaluate(() => {
      document.documentElement.dataset.introSkip = "true";
    });
    await scrollToClosing(page);
    await page.waitForTimeout(600);

    const zOrder = await measureZOrder(page);
    const cursors = await measureCursors(page);
    let keepHits = await sampleContactKeepHits(page, 8, 120);
    for (let attempt = 0; attempt < 25 && keepHits.totalContactKeepHits > 0; attempt += 1) {
      await page.waitForTimeout(200);
      keepHits = await sampleContactKeepHits(page, 12, 100);
    }

    const zOk =
      Number(zOrder.cursors.zIndex) === 1 &&
      Number(zOrder.splash.zIndex) <= 40 &&
      Number(zOrder.tail.zIndex) === 45 &&
      Number(zOrder.navRow.zIndex) >= 46 &&
      Number(zOrder.primaryRow.zIndex) >= 46 &&
      Number(zOrder.footerEmail.zIndex) >= 46 &&
      Number(zOrder.footerSocial.zIndex) >= 46;

    const branchMounted = await waitForStableMountedCount(page, mainVisible);
    const cursorOk =
      cursors.mounted &&
      cursors.driftDetected &&
      cursorVisibleMeetsMainBaseline(
        branchMounted,
        mainVisible,
        viewport.width,
      );

    const keepOk =
      keepHits.measuredCursorRects > 0 && keepHits.totalContactKeepHits === 0;

    const viewportLabel = `${viewport.width}x${viewport.height}`;
    const row = {
      viewport: viewportLabel,
      zOk,
      cursors,
      mainBaseline: mainVisible,
      expectedVisible,
      branchVisible: cursors.visibleCursorCount,
      branchMounted,
      cursorOk,
      cursorCountFailure: cursorOk
        ? null
        : formatCursorCountFailure({
            viewport: viewportLabel,
            branchMounted,
            mainCount: mainVisible,
          }),
      keepOk,
      ok: zOk && cursorOk && keepOk,
    };
    viewports.push(row);
    await page.close();
  }

  const mobileNavStep = await runMobileNavStepGate(
    browser,
    BASE,
    MAIN_BASE,
    NAV_STEP_RUNS,
  );
  const overscrollNav = await runMobileOverscrollNavGate(browser, BASE);

  const heroPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await heroPage.goto(BASE, { waitUntil: "networkidle", timeout: 120_000 });
  const heroSplash = await heroSplashWhenTailOffScreen(heroPage);
  heroSplash.ok =
    heroSplash.splashActive &&
    heroSplash.portalVisibility !== "hidden" &&
    (heroSplash.tailTop ?? 0) >= 400;
  await heroPage.close();

  const ok =
    mobileNavStep.ok &&
    overscrollNav.ok &&
    viewports.every((v) => v.ok) &&
    Boolean(heroSplash.ok);

  return {
    run: runIndex,
    ok,
    mainBaselines,
    mobileNavStep,
    overscrollNav,
    viewports,
    heroSplash,
  };
}

if (!MAIN_BASE) {
  console.error("MAIN_PREVIEW_URL is required");
  process.exit(1);
}

const browser = await chromium.launch();
const runReports = [];

for (let i = 1; i <= STABILITY_RUNS; i += 1) {
  const report = await runRegressionOnce(browser, i);
  runReports.push(report);
  console.log(`=== verify run ${i}/${STABILITY_RUNS} exit ${report.ok ? 0 : 1} ===`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) break;
}

await browser.close();

const allOk = runReports.length === STABILITY_RUNS && runReports.every((r) => r.ok);
if (!allOk) {
  for (const report of runReports) {
    for (const row of report.viewports ?? []) {
      if (!row.cursorOk && row.cursorCountFailure) {
        console.error(row.cursorCountFailure);
      }
    }
  }
}
console.log(
  JSON.stringify({ stabilityRuns: STABILITY_RUNS, runReports, ok: allOk }, null, 2),
);
process.exit(allOk ? 0 : 1);
