/**
 * B2 closing splash proof: beige at rest, full splash on hover, clean exit fade.
 * Usage:
 *   PREVIEW_URL=http://127.0.0.1:4321 node scripts/dev/prove-closing-tail-splash-fill.mjs
 *   MAIN_PREVIEW_URL=http://127.0.0.1:4322 node scripts/dev/prove-closing-tail-splash-fill.mjs
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  measureDesktopVisibleGaps,
  evaluateVisibleGapBar,
} from "./measure-closing-visible-gaps.mjs";
import {
  measureCursorCountAt,
  measureMainCursorBaselines,
  measureStableCursorCount,
} from "./pr40-cursor-baseline.mjs";
import { resolvePr40MetricsFile, PR40_ARTIFACTS_V7 } from "./pr40-metrics-path.mjs";
import { runMobileOverscrollNavGate } from "./assert-mobile-overscroll-nav.mjs";
import { runStackedPrimaryInkGate } from "./assert-stacked-primary-ink.mjs";

const STABILITY_RUNS = 5;

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4321";
const MAIN_BASE = process.env.MAIN_PREVIEW_URL || "";
const DEV_ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT =
  process.env.SCREENSHOT_DIR ||
  path.join(DEV_ROOT, "out", "closing-tail-splash-proof");

const BEIGE = [231, 221, 204];
const SPLASH = {
  building: [57, 143, 208],
  creating: [185, 74, 63],
  educating: [216, 161, 42],
};
const MIN_CONTRAST = 4.5;
const MIN_PILL_VIEWPORT_INSET_PX = 16;
const MIN_PILL_GAP_PX = 8;
const ROW_STEP_PX = 8;
const BEIGE_DIST_THRESHOLD = 28;

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 776 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];

const DESKTOP_VISIBLE_GAP_VIEWPORTS = [
  { width: 768, height: 1024 },
  { width: 800, height: 1024 },
  { width: 900, height: 768 },
  { width: 900, height: 900 },
  { width: 1023, height: 768 },
  { width: 1024, height: 776 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
];

const GAP_MAX_RATIO = 1.25;
const GAP_MEAN_TOLERANCE = 0.1;
const MOBILE_STACK_GAP_TARGET = 52;
const MOBILE_PILL_GAP_TARGET = 16;
const LAYOUT_SETTLE_MS = 1500;
const MOBILE_CLOSING_NAV_WIDTHS = [
  { width: 375, height: 844 },
  { width: 390, height: 844 },
  { width: 430, height: 844 },
  { width: 767, height: 1024 },
];

const WORDS = ["building", "creating", "educating"];
const NAV_ROW_INK_RGB = [20, 26, 43];
const CLOSING_NAV_RGB = BEIGE;
const MOBILE_GAP_BEIGE_MIN_FRACTION = 0.94;
const DESKTOP_PILL_GAP_TARGET = 44;
const DESKTOP_PILL_GAP_TOLERANCE = 8;
const METRICS_OUT =
  process.env.PR40_METRICS_FILE || resolvePr40MetricsFile();

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function isBeigeRgb(rgb) {
  return dist(rgb, BEIGE) < BEIGE_DIST_THRESHOLD;
}

function nearestClass(rgb) {
  const dBeige = dist(rgb, BEIGE);
  let best = "beige";
  let bestD = dBeige;
  for (const [name, color] of Object.entries(SPLASH)) {
    const d = dist(rgb, color);
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return { label: best, dBeige, confidence: bestD < 38 };
}

function parseCssRgb(css) {
  const m = String(css).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function normalizeCssColor(css) {
  const rgb = parseCssRgb(css);
  return rgb ? rgb.join(",") : String(css).trim().toLowerCase();
}

function srgbToLinear(c) {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg, bg) {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function classifySamples(samples) {
  const counts = { beige: 0, building: 0, creating: 0, educating: 0 };
  for (const s of samples) {
    if (s.label === "beige" || s.dBeige < BEIGE_DIST_THRESHOLD) counts.beige += 1;
    else counts[s.label] = (counts[s.label] ?? 0) + 1;
  }
  return counts;
}

function hasStripeFromRows(rowSamples) {
  if (rowSamples.length < 3) return false;
  const splashRows = rowSamples.filter((r) => r.dominant !== "beige");
  const beigeRows = rowSamples.filter((r) => r.dominant === "beige");
  if (beigeRows.length === 0 || splashRows.length === 0) return false;
  const firstBeige = beigeRows[0].y;
  const lastBeige = beigeRows[beigeRows.length - 1].y;
  const hasSplashAbove = rowSamples.some(
    (r) => r.y < firstBeige && r.dominant !== "beige",
  );
  const hasSplashBelow = rowSamples.some(
    (r) => r.y > lastBeige && r.dominant !== "beige",
  );
  return hasSplashAbove && hasSplashBelow;
}

function hasBeigeBandOnHover(rowSamples) {
  return rowSamples.some((r) => r.dominant === "beige" && r.beigeFraction > 0.55);
}

function resultsTable(results) {
  return results.map((x) => ({
    vp: x.viewport,
    state: x.state,
    ok: x.ok,
    stripe: x.stripe ?? "-",
    hit: x.hitTest?.ok ?? "-",
    pills: x.pillLayout?.ok ?? "-",
    gaps: x.closingGaps?.ok ?? "-",
    beigeBand: x.beigeBandRows ?? "-",
  }));
}

async function waitLayoutSettle(page) {
  await page.waitForTimeout(LAYOUT_SETTLE_MS);
}

async function assertDesktopNavRowInk(page) {
  return page.evaluate((target) => {
    const link = document.querySelector(
      ".home-closing-nav-row .home-closing-link--nav",
    );
    const row = document.querySelector(".home-closing-nav-row");
    if (!link || !row) return { ok: false, reason: "missing-nav-row" };
    const cs = getComputedStyle(link);
    const rowCs = getComputedStyle(row);
    const m = cs.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return { ok: false, reason: "unparsed-color" };
    const rgb = [Number(m[1]), Number(m[2]), Number(m[3])];
    const delta = Math.hypot(
      rgb[0] - target[0],
      rgb[1] - target[1],
      rgb[2] - target[2],
    );
    const opacity = parseFloat(rowCs.opacity);
    return {
      ok: delta <= 12 && opacity >= 0.98,
      rgb,
      opacity,
      delta: Math.round(delta),
    };
  }, NAV_ROW_INK_RGB);
}

function navMatchesClosingBeige(navBg) {
  const m = String(navBg).match(
    /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/,
  );
  if (!m) return false;
  const alpha = m[4] !== undefined ? Number.parseFloat(m[4]) : 1;
  if (alpha < 0.92) return false;
  const rgb = [Number(m[1]), Number(m[2]), Number(m[3])];
  return dist(rgb, CLOSING_NAV_RGB) <= 36;
}

async function waitForOverscrollReleased(page) {
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.overscrollPulling !== "true" &&
      document.documentElement.dataset.overscrollReveal !== "true",
    { timeout: 15_000 },
  );
}

async function readDesktopNavTailState(page) {
  return page.evaluate(() => ({
    pageAccent: document.documentElement.dataset.pageAccent ?? "",
    navBg: getComputedStyle(document.querySelector(".home-navbar")).backgroundColor,
  }));
}

async function assertDesktopNavBeigeAtTailRest(page, viewport) {
  await scrollToClosing(page);
  await waitLayoutSettle(page);
  const scrollToState = await readDesktopNavTailState(page);
  const scrollToOk =
    scrollToState.pageAccent === "closing" &&
    navMatchesClosingBeige(scrollToState.navBg);

  const maxScroll = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  await siteScrollToY(page, Math.max(0, maxScroll - 600));
  await page.waitForTimeout(600);
  await page.mouse.move(8, Math.max(8, viewport.height - 8));
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("home-splash:immediate-clear"));
  });
  for (let i = 0; i < 80; i += 1) {
    await page.mouse.wheel(0, 40);
    await page.waitForTimeout(12);
  }
  await waitForOverscrollReleased(page).catch(() => {});
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("home-splash:immediate-clear"));
  });
  await page
    .waitForFunction(
      () => !document.documentElement.dataset.homeSplash,
      { timeout: 12_000 },
    )
    .catch(() => {});
  await siteScrollToY(page, Math.max(0, maxScroll - 8));
  await page.waitForTimeout(200);
  await siteScrollToY(page, maxScroll);
  await waitLayoutSettle(page);
  const wheelState = await readDesktopNavTailState(page);
  const wheelOk =
    wheelState.pageAccent === "closing" &&
    navMatchesClosingBeige(wheelState.navBg);

  await scrollToClosing(page);
  await waitLayoutSettle(page);

  return {
    ok: scrollToOk && wheelOk,
    scrollTo: scrollToState,
    wheel: wheelState,
  };
}

async function countVisibleCursors(page) {
  return page.evaluate(() => {
    const cursors = [...document.querySelectorAll(".home-drifting-cursor")];
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
    const settled = Math.max(cursors.length, visible);
    return { total: cursors.length, visible, settled };
  });
}

async function assertSettledCursorCounts(browser, baseUrl, viewport) {
  if (!MAIN_BASE) return { ok: true, skipped: true };
  const expected = await measureCursorCountAt(browser, MAIN_BASE, viewport, {
    reducedMotion: "reduce",
  });
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
  });
  const countPage = await ctx.newPage();
  await countPage.emulateMedia({ reducedMotion: "reduce" });
  await countPage.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await countPage.evaluate(() => {
    document.documentElement.dataset.introSkip = "true";
  });
  await scrollToClosing(countPage);
  const settled = await measureStableCursorCount(countPage);
  await ctx.close();
  return {
    ok: settled === expected,
    expected,
    mainBaseline: expected,
    settled,
    visible: settled,
    total: settled,
  };
}

async function assertDesktopEmailHitArea(page) {
  return page.evaluate(() => {
    const email = document.querySelector(".home-footer__email");
    const text = document.querySelector(".home-footer__email-text");
    if (!email || !text) return { ok: false, reason: "missing-email" };
    const range = document.createRange();
    range.selectNodeContents(text);
    const rects = [...range.getClientRects()];
    let textWidth = text.getBoundingClientRect().width;
    if (rects.length) {
      const left = Math.min(...rects.map((r) => r.left));
      const right = Math.max(...rects.map((r) => r.right));
      textWidth = right - left;
    }
    const linkWidth = email.getBoundingClientRect().width;
    return {
      ok: linkWidth <= textWidth + 12,
      linkWidth: Math.round(linkWidth),
      textWidth: Math.round(textWidth),
    };
  });
}

async function assertDesktopPillGap(page) {
  return page.evaluate(({ target, tol }) => {
    const pills = [...document.querySelectorAll(".home-footer__social-pill")];
    if (pills.length < 2) return { ok: false, reason: "missing-pills" };
    const a = pills[0].getBoundingClientRect();
    const b = pills[1].getBoundingClientRect();
    const gap = b.left - a.right;
    return {
      ok: Math.abs(gap - target) <= tol,
      gap: Math.round(gap),
      target,
    };
  }, { target: DESKTOP_PILL_GAP_TARGET, tol: DESKTOP_PILL_GAP_TOLERANCE });
}

async function assertMobileSitemapEmailGapPixels(page) {
  const box = await page.evaluate(() => {
    const last = document.querySelector(
      ".home-closing-link--mobile:last-of-type",
    );
    const email = document.querySelector(".home-footer__email");
    if (!last || !email) return null;
    const a = last.getBoundingClientRect();
    const b = email.getBoundingClientRect();
    const y0 = Math.round(a.bottom);
    const y1 = Math.round(b.top);
    if (y1 - y0 < 6) return null;
    return {
      x: 0,
      y: y0,
      width: Math.round(window.innerWidth),
      height: y1 - y0,
    };
  });
  if (!box) return { ok: true, skipped: true };

  const buf = await page.screenshot({ type: "png", clip: box });
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  let beigeCount = 0;
  let offender = null;
  const total = info.width * info.height;
  for (let py = 0; py < info.height; py += 1) {
    for (let px = 0; px < info.width; px += 2) {
      const i = (py * info.width + px) * channels;
      const rgb = [data[i], data[i + 1], data[i + 2]];
      if (isBeigeRgb(rgb)) {
        beigeCount += 1;
      } else if (!offender) {
        const classified = nearestClass(rgb);
        if (
          classified.dBeige > BEIGE_DIST_THRESHOLD ||
          classified.label !== "beige"
        ) {
          offender = { rgb, label: classified.label };
        }
      }
    }
  }
  const samples = Math.ceil(info.width / 2) * info.height;
  const beigeFraction = beigeCount / samples;
  return {
    ok: beigeFraction >= MOBILE_GAP_BEIGE_MIN_FRACTION && !offender,
    beigeFraction: Math.round(beigeFraction * 1000) / 1000,
    offender,
    box,
  };
}

function assertHoverSplashHue(word, hoverCounts, sampleCount, splashKeyOk) {
  const splashPx = hoverCounts[word] ?? 0;
  const filled = sampleCount > 0 && splashPx >= sampleCount * 0.72;
  return { ok: splashKeyOk && filled, word, splashPx, sampleCount };
}

function evaluateGapBar(gaps) {
  const rounded = gaps.map((g) => Math.round(g * 10) / 10);
  const min = Math.min(...rounded);
  const max = Math.max(...rounded);
  const mean = rounded.reduce((sum, g) => sum + g, 0) / rounded.length;
  const ratio = min > 0 ? max / min : Number.POSITIVE_INFINITY;
  const withinTolerance = rounded.every(
    (g) => Math.abs(g - mean) <= mean * GAP_MEAN_TOLERANCE + 0.5,
  );
  const ok =
    rounded.length >= 3 &&
    min > 4 &&
    ratio <= GAP_MAX_RATIO + 0.001 &&
    withinTolerance;
  return { ok, gaps: rounded, min, max, mean: Math.round(mean * 10) / 10, ratio };
}

function evaluateMobileStackGaps(gaps, pillGap) {
  const rounded = gaps.map((g) => Math.round(g * 10) / 10);
  const gapTol = MOBILE_STACK_GAP_TARGET * GAP_MEAN_TOLERANCE + 0.5;
  const pillTol = MOBILE_PILL_GAP_TARGET * GAP_MEAN_TOLERANCE + 0.5;
  const gapsOk = rounded.every(
    (g) => Math.abs(g - MOBILE_STACK_GAP_TARGET) <= gapTol,
  );
  const pillGapOk =
    Math.abs(pillGap - MOBILE_PILL_GAP_TARGET) <= pillTol;
  return {
    ok: gapsOk && pillGapOk,
    gaps: rounded,
    pillGap: Math.round(pillGap),
    targetGap: MOBILE_STACK_GAP_TARGET,
    targetPillGap: MOBILE_PILL_GAP_TARGET,
  };
}

async function assertClosingVerticalGaps(page, isMobile) {
  if (!isMobile) {
    const visible = await measureDesktopVisibleGaps(page);
    if (!visible.ok && visible.reason) {
      return visible;
    }
    return { ...visible, mobile: false };
  }
  return page.evaluate(
    ({ mobile }) => {
      const inkVerticalBounds = (el) => {
        if (!el) return null;
        const range = document.createRange();
        range.selectNodeContents(el);
        const rects = [...range.getClientRects()];
        if (!rects.length) {
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom };
        }
        return {
          top: Math.min(...rects.map((r) => r.top)),
          bottom: Math.max(...rects.map((r) => r.bottom)),
        };
      };
      const unionInk = (elements) => {
        let top = Infinity;
        let bottom = -Infinity;
        for (const el of elements) {
          const b = inkVerticalBounds(el);
          if (!b) continue;
          top = Math.min(top, b.top);
          bottom = Math.max(bottom, b.bottom);
        }
        if (!Number.isFinite(top)) return null;
        return { top, bottom };
      };

      const navEl = document.querySelector(".home-navbar");
      const navBottom = navEl?.getBoundingClientRect().bottom ?? 64;
      const vh = window.innerHeight;

      if (mobile) {
        const blocks = [
          ...document.querySelectorAll(".home-closing-link--mobile"),
        ];
        const lastBlock = blocks[blocks.length - 1];
        const email = document.querySelector(".home-footer__email");
        const pills = [
          ...document.querySelectorAll(".home-footer__social-pill"),
        ];
        if (!lastBlock || !email || pills.length < 2) {
          return { ok: false, reason: "missing-mobile-nodes" };
        }
        const lastRect = lastBlock.getBoundingClientRect();
        const emailRect = email.getBoundingClientRect();
        const pillRects = pills.map((p) => p.getBoundingClientRect());
        const pillGap = pillRects[1].top - pillRects[0].bottom;
        const gaps = [
          emailRect.top - lastRect.bottom,
          pillRects[0].top - emailRect.bottom,
          vh - pillRects[pillRects.length - 1].bottom,
        ];
        return { gaps, pillGap, mobile: true };
      }

      const navRow = document.querySelector(".home-closing-nav-row");
      const primaryLinks = [
        ...document.querySelectorAll("a.home-closing-link--primary"),
      ];
      const emailText = document.querySelector(".home-footer__email-text");
      const pillLabels = [
        ...document.querySelectorAll(".home-footer__social-pill-label"),
      ];
      if (!navRow || primaryLinks.length < 1 || !emailText || !pillLabels.length) {
        return { ok: false, reason: "missing-desktop-nodes" };
      }
      const navInk = inkVerticalBounds(navRow);
      const primaryInk = unionInk(primaryLinks);
      const emailInk = inkVerticalBounds(emailText);
      const socialInk = unionInk(pillLabels);
      const tailRect = document
        .querySelector(".home-closing-tail")
        ?.getBoundingClientRect();
      const tailBottom = tailRect?.bottom ?? vh;
      const gaps = [
        navInk.top - navBottom,
        primaryInk.top - navInk.bottom,
        emailInk.top - primaryInk.bottom,
        socialInk.top - emailInk.bottom,
        tailBottom - socialInk.bottom,
      ];
      return { gaps, mobile: false };
    },
    { mobile: isMobile },
  ).then((raw) => {
    if (raw.ok === false && raw.reason) {
      return { ok: false, reason: raw.reason };
    }
    if (raw.mobile) {
      const mobileBar = evaluateMobileStackGaps(raw.gaps, raw.pillGap);
      return { ...mobileBar, mobile: true };
    }
    const bar = evaluateVisibleGapBar(raw.gaps);
    return { ...bar, mobile: false, ok: bar.ok };
  });
}

async function runDesktopVisibleGapGate(browser, baseUrl) {
  const rows = [];
  let ok = true;
  for (const viewport of DESKTOP_VISIBLE_GAP_VIEWPORTS) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
    await scrollToClosing(page);
    await waitLayoutSettle(page);
    const result = await measureDesktopVisibleGaps(page);
    const label = `${viewport.width}x${viewport.height}`;
    rows.push({ viewport: label, ...result });
    if (!result.ok) {
      ok = false;
      console.error(
        `VISIBLE GAP FAIL ${label}:`,
        JSON.stringify(result, null, 2),
      );
    }
    await context.close();
  }
  return { ok, rows };
}

async function sampleContactKeepHits(page, samples = 40, intervalMs = 100) {
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
      return { hits: n, measuredRects: cursorParts.length };
    });
    totalHits += hits.hits;
    measuredRectsTotal += hits.measuredRects;
    await page.waitForTimeout(intervalMs);
  }
  return { samples, totalContactKeepHits: totalHits, measuredCursorRects: measuredRectsTotal };
}

async function runCursorKeepOutGate(browser, baseUrl, runs = 16) {
  const widthRuns = [];
  let ok = true;
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 768, height: 1024 },
  ]) {
    const runHits = [];
    for (let run = 0; run < runs; run += 1) {
      const context = await browser.newContext({
        viewport,
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
      await scrollToClosing(page);
      await waitLayoutSettle(page);
      let hits = await sampleContactKeepHits(page, 40, 100);
      for (let attempt = 0; attempt < 20 && hits.totalContactKeepHits > 0; attempt += 1) {
        await page.waitForTimeout(200);
        hits = await sampleContactKeepHits(page, 40, 100);
      }
      runHits.push(hits.totalContactKeepHits);
      if (hits.totalContactKeepHits > 0) ok = false;
      await context.close();
    }
    widthRuns.push({
      viewport: `${viewport.width}x${viewport.height}`,
      runs: runHits,
      brushingRuns: runHits.filter((h) => h > 0).length,
    });
  }
  return { ok, widthRuns };
}

async function sampleMobileNavUnderBand(page) {
  return page.evaluate(() => {
    const nav = document.querySelector(".home-navbar");
    const navBg = nav ? getComputedStyle(nav).backgroundColor : "";
    const navBottom = nav?.getBoundingClientRect().bottom ?? 64;
    const underY = navBottom + 2;
    const hit = document
      .elementsFromPoint(window.innerWidth / 2, underY)
      .map((el) =>
        el.closest(".home-closing-link--mobile, .home-footer"),
      )
      .find(Boolean);
    let bandBg = "";
    let expectedAccent = "";
    if (hit?.classList?.contains("home-closing-link--mobile")) {
      bandBg = getComputedStyle(hit).backgroundColor;
      expectedAccent = hit.getAttribute("data-home-nav-theme") ?? "";
    } else if (hit?.closest?.(".home-footer")) {
      bandBg = "rgb(231, 221, 204)";
      expectedAccent = "closing";
    }
    const pageAccent = document.documentElement.dataset.pageAccent ?? "";
    const accentMatch =
      Boolean(expectedAccent) && pageAccent === expectedAccent;
    return {
      navBg,
      bandBg,
      pageAccent,
      expectedAccent,
      accentMatch,
      scrollY: Math.round(window.scrollY),
      key: hit?.getAttribute?.("data-splash-key") ?? null,
    };
  });
}

async function assertMobileClosingNavMatchesBands(browser, baseUrl) {
  const probes = [];
  let ok = true;

  for (const viewport of MOBILE_CLOSING_NAV_WIDTHS) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
    await waitForUiSettled(page);

    const { tailTop, maxScroll } = await page.evaluate(() => ({
      tailTop: Math.round(
        document.querySelector(".home-closing-tail")?.getBoundingClientRect().top +
          window.scrollY,
      ),
      maxScroll: document.documentElement.scrollHeight - window.innerHeight,
    }));
    const scrollYs = [];
    for (let y = 0; y <= maxScroll; y += y >= tailTop - 900 ? 16 : 64) {
      scrollYs.push(y);
    }
    if (scrollYs.at(-1) !== maxScroll) scrollYs.push(maxScroll);

    for (const y of scrollYs) {
      if (y < tailTop - 64) continue;
      await siteScrollToY(page, y);
      await page.waitForTimeout(160);
      const sample = await sampleMobileNavUnderBand(page);
      if (!sample.bandBg) continue;
      const match = sample.accentMatch;
      if (!match) {
        ok = false;
        probes.push({
          viewport: `${viewport.width}x${viewport.height}`,
          band: "sweep",
          scrollY: sample.scrollY,
          match,
          navBg: sample.navBg,
          bandBg: sample.bandBg,
          key: sample.key,
        });
      }
    }

    const blockKeys = await page.$$eval(".home-closing-link--mobile", (links) =>
      links.map((a) => a.getAttribute("data-splash-key") ?? a.textContent?.trim()),
    );

    for (const key of blockKeys) {
      const targetY = await page.evaluate((bandKey) => {
        const link = document.querySelector(
          `.home-closing-link--mobile[data-splash-key="${bandKey}"]`,
        );
        if (!link) return 0;
        const rect = link.getBoundingClientRect();
        return Math.max(0, window.scrollY + rect.top + rect.height / 2 - 64 - 8);
      }, key);
      await siteScrollToY(page, targetY);
      await waitLayoutSettle(page);
      const sample = await sampleMobileNavUnderBand(page);
      const match =
        sample.accentMatch && navBgClose(sample.navBg, sample.bandBg);
      if (!match) ok = false;
      probes.push({
        viewport: `${viewport.width}x${viewport.height}`,
        band: key,
        match,
        navBg: sample.navBg,
        bandBg: sample.bandBg,
        pageAccent: sample.pageAccent,
        expectedAccent: sample.expectedAccent,
      });
    }

    const footerReachable = await page.evaluate(() => {
      const email = document.querySelector(".home-footer__email");
      if (!email) return false;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const want = email.getBoundingClientRect().top + window.scrollY - 72;
      return want <= max + 1;
    });
    if (footerReachable) {
      const footerY = await page.evaluate(() => {
        const email = document.querySelector(".home-footer__email");
        return Math.max(0, email.getBoundingClientRect().top + window.scrollY - 72);
      });
      await siteScrollToY(page, footerY);
      await waitLayoutSettle(page);
      const footerSample = await page.evaluate(() => {
        const navBg = getComputedStyle(
          document.querySelector(".home-navbar"),
        ).backgroundColor;
        const bandBg = "rgb(231, 221, 204)";
        return { navBg, bandBg };
      });
      const footerMatch = navBgClose(
        footerSample.navBg,
        footerSample.bandBg,
      );
      if (!footerMatch) ok = false;
      probes.push({
        viewport: `${viewport.width}x${viewport.height}`,
        band: "closing-footer",
        match: footerMatch,
        navBg: footerSample.navBg,
        bandBg: footerSample.bandBg,
      });
    }

    await context.close();
  }

  return { ok, probes };
}

async function waitForUiSettled(page) {
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "1";
  });
  await page.waitForFunction(
    () => {
      const root = document.documentElement;
      return (
        root.dataset.logoMorph !== "pending" &&
        (root.dataset.introPhase === "ready" || root.dataset.introSkip === "1")
      );
    },
    { timeout: 20_000 },
  );
}

async function siteScrollToY(page, y) {
  await page.evaluate((scrollY) => {
    if (typeof window.__siteScrollTo === "function") {
      window.__siteScrollTo(scrollY);
    } else {
      window.scrollTo(0, scrollY);
      window.dispatchEvent(new Event("scroll"));
    }
  }, y);
}

async function scrollToClosing(page) {
  await waitForUiSettled(page);
  const max = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  await siteScrollToY(page, Math.max(0, max));
  await waitForUiSettled(page);
}

async function assertViewport(page, expected) {
  const actual = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  }));
  if (
    actual.innerWidth !== expected.width ||
    actual.innerHeight !== expected.height
  ) {
    throw new Error(
      `viewport mismatch: expected ${expected.width}x${expected.height}, got ${actual.innerWidth}x${actual.innerHeight}`,
    );
  }
}

async function tailRect(page, mobileFooterOnly = false) {
  return page.evaluate((footerOnly) => {
    const el = footerOnly
      ? document.querySelector(".home-footer")
      : document.querySelector(".home-closing-tail");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  }, mobileFooterOnly);
}

async function sampleTailPixelsDense(page, rect) {
  const buf = await page.screenshot({
    type: "png",
    clip: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
  });
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== rect.width || info.height !== rect.height) {
    throw new Error(
      `clip/screenshot size mismatch: clip ${rect.width}x${rect.height}, image ${info.width}x${info.height}`,
    );
  }

  const w = info.width;
  const h = info.height;
  const channels = info.channels;
  const insetX = 4;
  const rowSamples = [];
  const allSamples = [];

  for (let y = 0; y < h; y += ROW_STEP_PX) {
    const row = [];
    for (let x = insetX; x < w; x += Math.max(8, Math.floor(w / 32))) {
      const i = (y * w + x) * channels;
      const rgb = [data[i], data[i + 1], data[i + 2]];
      const classified = { x, y, rgb, ...nearestClass(rgb) };
      row.push(classified);
      allSamples.push(classified);
    }
    const beigeInRow = row.filter((s) => isBeigeRgb(s.rgb)).length;
    rowSamples.push({
      y,
      beigeFraction: beigeInRow / row.length,
      dominant: beigeInRow > row.length / 2 ? "beige" : "splash",
    });
  }

  return { allSamples, rowSamples, imageSize: { w, h } };
}

function readPixelRgb(raw, width, channels, x, y) {
  const cx = Math.max(0, Math.min(width - 1, x));
  const cy = Math.max(0, y);
  const i = (cy * width + cx) * channels;
  return [raw[i], raw[i + 1], raw[i + 2]];
}

function sampleBgBehindGlyph(raw, width, channels, x, y, fgRgb) {
  const offsets = [
    [0, 8],
    [0, -8],
    [8, 0],
    [-8, 0],
    [0, 14],
    [0, -14],
    [10, 10],
    [-10, 10],
  ];
  let best = null;
  let bestDist = -1;
  for (const [dx, dy] of offsets) {
    const rgb = readPixelRgb(raw, width, channels, x + dx, y + dy);
    const d = dist(rgb, fgRgb);
    if (d < 42) continue;
    if (d > bestDist) {
      bestDist = d;
      best = rgb;
    }
  }
  if (best) return best;
  return readPixelRgb(raw, width, channels, x, y + 12);
}

async function measureContrastsFromViewportShot(page, word, pngBuffer) {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const probes = await page.evaluate((wordKey) => {
    const primary = [
      ...document.querySelectorAll("a.home-closing-link--primary"),
    ].find((n) => n.textContent?.trim().toLowerCase() === wordKey);
    const targets = [
      { id: "primary", el: primary },
      { id: "email", el: document.querySelector(".home-footer__email-text") },
      {
        id: "pill",
        el: document.querySelector(".home-footer__social-pill-label"),
      },
      { id: "navbar", el: document.querySelector(".home-navbar .home-logo") },
    ];
    return targets
      .map(({ id, el }) => {
        if (!el) return { id, missing: true };
        const r = el.getBoundingClientRect();
        const fg = getComputedStyle(el).color;
        const x = Math.round(r.left + r.width / 2);
        const y = Math.round(r.top + r.height / 2);
        return { id, fg, x, y };
      })
      .filter(Boolean);
  }, word);

  return probes.map((p) => {
    if (p.missing) return { id: p.id, ok: false, reason: "missing" };
    const fgRgb = parseCssRgb(p.fg);
    const bgRgb = sampleBgBehindGlyph(
      data,
      info.width,
      info.channels,
      p.x,
      p.y,
      fgRgb,
    );
    const ratio = contrastRatio(fgRgb, bgRgb);
    return {
      id: p.id,
      fg: p.fg,
      bgRgb,
      ratio: Math.round(ratio * 100) / 100,
      ok: ratio >= MIN_CONTRAST,
    };
  });
}

async function assertSplashBelowChrome(page) {
  return page.evaluate(() => {
    const splash = document.querySelector(".home-splash-overlay");
    const chrome = [
      ...document.querySelectorAll(
        ".home-closing-index__nav, .home-closing-index__primary, .home-closing-tail .home-footer__email, .home-closing-tail .home-footer__social",
      ),
    ];
    if (!splash || chrome.length < 2) {
      return { ok: false, reason: "missing layer" };
    }
    const sz = Number(getComputedStyle(splash).zIndex);
    const chromeZ = chrome.map((el) => Number(getComputedStyle(el).zIndex));
    const minChromeZ = Math.min(...chromeZ);
    return { ok: sz < minChromeZ, sz, chromeZ, minChromeZ };
  });
}

async function assertHitTestContentAboveSplash(page, word) {
  return page.evaluate((wordKey) => {
    const splashRoot = document.querySelector(".home-splash-overlay");
    const stackOrderOk = (x, y, contentEl) => {
      const stack = document.elementsFromPoint(x, y);
      const contentIdx = stack.findIndex(
        (el) => el === contentEl || contentEl.contains(el),
      );
      if (contentIdx === -1) {
        return { ok: false, reason: "content not in paint stack" };
      }
      const splashIdx = stack.findIndex(
        (el) => el === splashRoot || el.closest?.(".home-splash-overlay"),
      );
      if (splashIdx === -1) return { ok: true };
      return {
        ok: contentIdx < splashIdx,
        splashIdx,
        contentIdx,
        top: stack[0]?.className?.toString?.().slice(0, 80) ?? null,
      };
    };
    const primary = [
      ...document.querySelectorAll("a.home-closing-link--primary"),
    ].find((n) => n.textContent?.trim().toLowerCase() === wordKey);
    const probes = [
      { id: "primary", el: primary },
      { id: "email", el: document.querySelector(".home-footer__email-text") },
      {
        id: "pill",
        el: document.querySelector(".home-footer__social-pill-label"),
      },
    ];
    const failures = [];
    for (const { id, el } of probes) {
      if (!el) {
        failures.push({ id, reason: "missing" });
        continue;
      }
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const order = stackOrderOk(x, y, el);
      if (!order.ok) failures.push({ id, ...order });
    }
    return { ok: failures.length === 0, failures };
  }, word);
}

async function auditTailOpaqueBackgrounds(page) {
  return page.evaluate(() => {
    const tail = document.querySelector(".home-closing-tail");
    if (!tail) return { ok: false, offenders: [{ reason: "no tail" }] };

    const parseBg = (css) => {
      const t = css.trim();
      if (!t || t === "transparent" || t === "none") return null;
      const m = t.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!m) return { raw: t, opaque: true };
      const a = m[4] !== undefined ? Number(m[4]) : 1;
      if (a <= 0.02) return null;
      return {
        rgb: [Number(m[1]), Number(m[2]), Number(m[3])],
        alpha: a,
        opaque: a > 0.02,
      };
    };

    const isAllowedOpaque = (el) => {
      if (!(el instanceof Element)) return false;
      if (el.classList.contains("home-splash-overlay")) return true;
      if (el.id === "home-splash-portal") return true;
      if (el.closest(".home-drifting-cursor")) return true;
      return false;
    };

    const isBeigeFill = (bg) => {
      if (!bg?.rgb) return false;
      const [r, g, b] = bg.rgb;
      return (
        Math.abs(r - 231) < 12 &&
        Math.abs(g - 221) < 12 &&
        Math.abs(b - 204) < 12
      );
    };

    const offenders = [];
    const walk = (el) => {
      if (el === tail) {
        for (const child of el.children) walk(child);
        return;
      }
      if (!isAllowedOpaque(el)) {
        const cs = getComputedStyle(el);
        for (const pseudo of ["", "::before", "::after"]) {
          const bg = parseBg(
            pseudo
              ? getComputedStyle(el, pseudo).backgroundColor
              : cs.backgroundColor,
          );
          if (bg?.opaque && isBeigeFill(bg)) {
            const id =
              el.id ||
              [...(el.classList || [])].slice(0, 3).join(".") ||
              el.tagName.toLowerCase();
            offenders.push({
              selector: `${id}${pseudo}`,
              backgroundColor: bg.raw || `rgb(${bg.rgb.join(",")})`,
              alpha: bg.alpha,
            });
          }
        }
      }
      for (const child of el.children) walk(child);
    };
    walk(tail);
    return { ok: offenders.length === 0, offenders };
  });
}

async function assertPillContactLayout(page) {
  return page.evaluate(
    ({ minInset, minGap }) => {
      const vw = window.innerWidth;
      const email = document.querySelector(".home-footer__email");
      const pills = [
        ...document.querySelectorAll(".home-footer__social-pill"),
      ];
      const emailRect = email?.getBoundingClientRect() ?? null;
      const pillRects = pills.map((el, index) => {
        const r = el.getBoundingClientRect();
        return {
          index,
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          insetLeft: r.left,
          insetRight: vw - r.right,
        };
      });

      const failures = [];
      for (const r of pillRects) {
        if (r.insetLeft < minInset - 0.5) {
          failures.push({ type: "viewport-inset-left", ...r });
        }
        if (r.insetRight < minInset - 0.5) {
          failures.push({ type: "viewport-inset-right", ...r });
        }
      }

      const sorted = [...pillRects].sort((a, b) => a.top - b.top);
      for (let i = 0; i < sorted.length; i += 1) {
        for (let j = i + 1; j < sorted.length; j += 1) {
          const a = sorted[i];
          const b = sorted[j];
          const overlap =
            a.left < b.right - 0.5 &&
            a.right > b.left + 0.5 &&
            a.top < b.bottom - 0.5 &&
            a.bottom > b.top + 0.5;
          if (overlap) {
            failures.push({ type: "pill-overlap", a: a.index, b: b.index });
            continue;
          }
          const hGap = Math.max(
            0,
            Math.max(b.left - a.right, a.left - b.right),
          );
          const vGap = Math.max(
            0,
            Math.max(b.top - a.bottom, a.top - b.bottom),
          );
          const gap = Math.min(
            hGap > 0 ? hGap : Number.POSITIVE_INFINITY,
            vGap > 0 ? vGap : Number.POSITIVE_INFINITY,
          );
          if (Number.isFinite(gap) && gap < minGap - 0.5) {
            failures.push({
              type: "pill-gap",
              a: a.index,
              b: b.index,
              gap: Math.round(gap),
            });
          }
        }
      }

      if (emailRect && pillRects.length > 0) {
        const topPill = Math.min(...pillRects.map((r) => r.top));
        const emailBottom = emailRect.bottom;
        if (topPill < emailBottom - 0.5) {
          failures.push({
            type: "email-overlap",
            emailBottom,
            pillTop: topPill,
          });
        } else {
          const emailGap = topPill - emailBottom;
          if (emailGap < minGap - 0.5) {
            failures.push({
              type: "email-gap",
              gap: Math.round(emailGap),
            });
          }
        }
      }

      return {
        ok: failures.length === 0,
        vw,
        pillRects,
        emailRect: emailRect
          ? {
              insetLeft: emailRect.left,
              insetRight: vw - emailRect.right,
              bottom: emailRect.bottom,
            }
          : null,
        failures,
      };
    },
    {
      minInset: MIN_PILL_VIEWPORT_INSET_PX,
      minGap: MIN_PILL_GAP_PX,
    },
  );
}

async function checkNavLogoVisible(page) {
  return page.evaluate(() => {
    const logo = document.querySelector(".home-navbar .home-logo");
    if (!logo) return { ok: false, reason: "missing .home-logo" };
    const cs = getComputedStyle(logo);
    const rect = logo.getBoundingClientRect();
    return {
      ok:
        Number(cs.opacity) > 0.1 &&
        cs.display !== "none" &&
        cs.visibility !== "hidden" &&
        rect.width > 8 &&
        rect.height > 8,
      width: rect.width,
      height: rect.height,
    };
  });
}

async function hoverPrimary(page, word) {
  const link = page.locator(`a.home-closing-link--primary`, { hasText: word });
  await link.first().scrollIntoViewIfNeeded();
  await link.first().hover({ force: true });
  await page
    .waitForFunction(
      (w) => document.documentElement.dataset.homeSplash === w,
      word,
      { timeout: 5000 },
    )
    .catch(() => {});
  await page.waitForTimeout(400);
}

async function screenshotViewport(page, filePath) {
  const buf = await page.screenshot({ type: "png", fullPage: false });
  const meta = await sharp(buf).metadata();
  if (filePath) await writeFile(filePath, buf);
  return { width: meta.width, height: meta.height, buffer: buf };
}

async function mobileNavSemanticProbes(page) {
  return page.evaluate(() => {
    const max = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight,
    );
    const probes = [{ id: "top", y: 0 }];
    for (const id of ["builder", "creator", "educator"]) {
      const band = document.getElementById(id);
      if (band) {
        const y = Math.round(
          band.getBoundingClientRect().top + window.scrollY - 48,
        );
        probes.push({ id, y: Math.max(0, Math.min(max, y)) });
      }
    }
    const buildingRow = document.querySelector(
      'a.home-closing-link--mobile[data-splash-key="building"]',
    );
    if (buildingRow) {
      const y = Math.round(
        buildingRow.getBoundingClientRect().top + window.scrollY - 56,
      );
      probes.push({
        id: "closing-building-row",
        y: Math.max(0, Math.min(max, y)),
      });
    }
    const email = document.querySelector(".home-footer__email");
    if (email) {
      const footerY = Math.round(
        email.getBoundingClientRect().top + window.scrollY - 72,
      );
      if (footerY < max - 4) {
        probes.push({
          id: "closing-footer",
          y: Math.max(0, footerY),
        });
      }
    }
    return probes;
  });
}

async function sampleMobileNavAt(page, scrollY) {
  await siteScrollToY(page, scrollY);
  await page.waitForTimeout(400);
  return page.evaluate((y) => {
    const nav = document.querySelector(".home-navbar");
    const meta = document.querySelector('meta[name="theme-color"]');
    const navBg = nav ? getComputedStyle(nav).backgroundColor : "";
    return {
      scrollY: y,
      pageAccent: document.documentElement.dataset.pageAccent ?? "",
      navBg,
      themeColor: meta?.getAttribute("content") ?? "",
    };
  }, scrollY);
}

async function sampleMobileNavProbe(page, probe) {
  const sample = await sampleMobileNavAt(page, probe.y);
  return { probeId: probe.id, ...sample };
}

async function collect390NavProfile(browser, baseUrl, label) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await waitForUiSettled(page);
  const probes = await mobileNavSemanticProbes(page);
  const samples = [];
  for (const probe of probes) {
    samples.push(await sampleMobileNavProbe(page, probe));
  }
  const buildingProbe =
    probes.find((p) => p.id === "builder") ?? probes.find((p) => p.id === "top");
  await sampleMobileNavAt(page, buildingProbe?.y ?? 0);
  const navShotPath = path.join(OUT, `390-nav-${label}-building-row.png`);
  await screenshotViewport(page, navShotPath);
  await context.close();
  return { label, samples, buildingRowScreenshot: navShotPath };
}

function navBgClose(aCss, bCss) {
  const a = parseCssRgb(aCss);
  const b = parseCssRgb(bCss);
  if (!a || !b) return normalizeCssColor(aCss) === normalizeCssColor(bCss);
  return dist(a, b) <= 36;
}

function navSampleMatchesMain(main, branch) {
  if (main.probeId !== branch.probeId) return false;
  if (main.pageAccent !== branch.pageAccent) return false;
  if (normalizeCssColor(main.themeColor) !== normalizeCssColor(branch.themeColor))
    return false;
  return navBgClose(main.navBg, branch.navBg);
}

function navProfilesMatch(mainSamples, branchSamples) {
  const branchByProbe = new Map(branchSamples.map((s) => [s.probeId, s]));
  const mismatches = [];
  for (const main of mainSamples) {
    const branch = branchByProbe.get(main.probeId);
    if (!branch || !navSampleMatchesMain(main, branch)) {
      mismatches.push({ probeId: main.probeId, main, branch });
    }
  }
  for (const branch of branchSamples) {
    if (!mainSamples.some((m) => m.probeId === branch.probeId)) {
      mismatches.push({ probeId: branch.probeId, main: null, branch });
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

function assert390NavMatchesMain(mainSamples, branchSamples) {
  return navProfilesMatch(mainSamples, branchSamples);
}

async function runProvePass(browser, baseUrl, runLabel, mainBaselines) {
  const results = [];
  let failed = false;

  for (const viewport of VIEWPORTS) {
    const isMobile = viewport.width < 768;
    const viewportLabel = `${viewport.width}x${viewport.height}`;

    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
    await assertViewport(page, viewport);
    await scrollToClosing(page);
    await waitLayoutSettle(page);
    const closingGaps = await assertClosingVerticalGaps(page, isMobile);
    const rect = await tailRect(page, isMobile);
    const tailRectDesktop = isMobile ? null : await tailRect(page, false);
    if (!rect) {
      failed = true;
      results.push({ viewport: viewportLabel, state: "rest", ok: false });
      await context.close();
      continue;
    }

    const { allSamples: restSamples, rowSamples: restRows } =
      await sampleTailPixelsDense(page, rect);
    const restCounts = classifySamples(restSamples);
    const restShot = path.join(OUT, `${runLabel}-${viewportLabel}-rest.png`);
    const restShotMeta = await screenshotViewport(page, restShot);
    const navLogoRest = await checkNavLogoVisible(page);
    const restViewportBuf = restShotMeta.buffer;
    const restContrasts = isMobile
      ? []
      : await measureContrastsFromViewportShot(page, "building", restViewportBuf);

    const restStripe = hasStripeFromRows(restRows);
    const pillLayoutRest = await assertPillContactLayout(page);
    const mobileGapPixels = isMobile
      ? await assertMobileSitemapEmailGapPixels(page)
      : null;
    const navRowInk = !isMobile ? await assertDesktopNavRowInk(page) : null;
    const desktopNavBeige = !isMobile
      ? await assertDesktopNavBeigeAtTailRest(page, viewport)
      : null;
    const cursorCounts = !isMobile
      ? await assertSettledCursorCounts(browser, baseUrl, viewport)
      : null;
    const emailHitArea = !isMobile ? await assertDesktopEmailHitArea(page) : null;
    const desktopPillGap = !isMobile ? await assertDesktopPillGap(page) : null;
    const restOk = isMobile
      ? restCounts.beige >= restSamples.length * 0.85 &&
        pillLayoutRest.ok &&
        closingGaps.ok &&
        mobileGapPixels.ok
      : restCounts.beige >= restSamples.length * 0.85 &&
        !restStripe &&
        restContrasts.every((c) => c.ok) &&
        navLogoRest.ok &&
        pillLayoutRest.ok &&
        closingGaps.ok &&
        navRowInk.ok &&
        desktopNavBeige.ok &&
        cursorCounts.ok &&
        emailHitArea.ok &&
        desktopPillGap.ok;
    if (!restOk) failed = true;
    results.push({
      viewport: viewportLabel,
      state: "rest",
      ok: restOk,
      pixelCounts: restCounts,
      stripe: restStripe,
      contrasts: restContrasts,
      navLogo: navLogoRest,
      pillLayout: pillLayoutRest,
      closingGaps,
      mobileGapPixels,
      navRowInk,
      desktopNavBeige,
      cursorCounts,
      emailHitArea,
      desktopPillGap,
      screenshotPixels: { width: restShotMeta.width, height: restShotMeta.height },
    });

    if (isMobile) {
      const mobileEducating = page.locator("a.home-closing-link--mobile", {
        hasText: "educating",
      });
      if ((await mobileEducating.count()) > 0) {
        await mobileEducating.first().hover({ force: true });
        await page.waitForTimeout(300);
        const pillLayoutHover = await assertPillContactLayout(page);
        const hoverMobileOk = pillLayoutHover.ok;
        if (!hoverMobileOk) failed = true;
        results.push({
          viewport: viewportLabel,
          state: "hover-educating-mobile",
          ok: hoverMobileOk,
          pillLayout: pillLayoutHover,
        });
      }
    }

    if (!isMobile && tailRectDesktop) {
      for (const word of WORDS) {
        await page.evaluate(() => {
          delete document.documentElement.dataset.homeSplash;
        });
        await page.waitForTimeout(150);
        await hoverPrimary(page, word);
        const hitTest = await assertHitTestContentAboveSplash(page, word);
        const zOrder = await assertSplashBelowChrome(page);
        const { allSamples: hoverSamples, rowSamples: hoverRows } =
          await sampleTailPixelsDense(page, tailRectDesktop);
        const hoverCounts = classifySamples(hoverSamples);
        const hoverShotMeta = await screenshotViewport(page, null);
        const hoverContrasts = await measureContrastsFromViewportShot(
          page,
          word,
          hoverShotMeta.buffer,
        );
        const bgAudit = await auditTailOpaqueBackgrounds(page);
        const beigeBand = hasBeigeBandOnHover(hoverRows);
        const xs = hoverSamples.map((s) => s.x);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const centerSamples = hoverSamples.filter(
          (s) => s.x >= minX + (maxX - minX) * 0.25 && s.x <= minX + (maxX - minX) * 0.75,
        );
        const splashFilled =
          hoverCounts[word] >= hoverSamples.length * 0.75 &&
          (centerSamples.length === 0 ||
            centerSamples.filter((s) => s.label === word).length >=
              centerSamples.length * 0.7);
        const pillLayoutHover = await assertPillContactLayout(page);
        const splashKeyOk = await page.evaluate(
          (w) => document.documentElement.dataset.homeSplash === w,
          word,
        );
        const splashHue = assertHoverSplashHue(
          word,
          hoverCounts,
          hoverSamples.length,
          splashKeyOk,
        );
        const hoverOk =
          splashFilled &&
          splashHue.ok &&
          hitTest.ok &&
          zOrder.ok &&
          !beigeBand &&
          !hasStripeFromRows(hoverRows) &&
          bgAudit.ok &&
          hoverContrasts.every((c) => c.ok) &&
          pillLayoutHover.ok &&
          hoverShotMeta.width === viewport.width;
        if (!hoverOk) failed = true;
        results.push({
          viewport: viewportLabel,
          state: `hover-${word}`,
          ok: hoverOk,
          pixelCounts: hoverCounts,
          stripe: beigeBand || hasStripeFromRows(hoverRows),
          beigeBandRows: hoverRows.filter((r) => r.dominant === "beige").length,
          hitTest,
          zOrder,
          pillLayout: pillLayoutHover,
          splashHue,
          opaqueBgOffenders: bgAudit.offenders,
          contrasts: hoverContrasts,
          screenshotPixels: hoverShotMeta,
        });

        await page.mouse.move(8, viewport.height - 8);
        await page.waitForTimeout(400);
        const { allSamples: exitSamples, rowSamples: exitRows } =
          await sampleTailPixelsDense(page, tailRectDesktop);
        const exitStripe = hasStripeFromRows(exitRows);
        const exitOk = !exitStripe;
        if (!exitOk) failed = true;
        results.push({
          viewport: viewportLabel,
          state: `exitfade-${word}`,
          ok: exitOk,
          stripe: exitStripe,
          pixelCounts: classifySamples(exitSamples),
        });
      }
    }

    await context.close();
  }

  return { runLabel, failed, results, table: resultsTable(results) };
}

async function runNegativeSelfTests(browser, baseUrl) {
  const negatives = [];

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await scrollToClosing(page);
  await hoverPrimary(page, "building");
  await page.evaluate(() => {
    const splash = document.querySelector(".home-splash-overlay");
    if (splash) splash.style.zIndex = "50";
  });
  await page.waitForTimeout(80);
  const zHit = await assertHitTestContentAboveSplash(page, "building");
  const zOrderBroken = await assertSplashBelowChrome(page);
  negatives.push({
    name: "inject-splash-z-index-50",
    expectProveFail: true,
    detectedFailure: !zOrderBroken.ok,
    detail: { hitTest: zHit, zOrder: zOrderBroken },
  });
  await context.close();

  const mobileCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const mobilePage = await mobileCtx.newPage();
  await mobilePage.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await waitForUiSettled(mobilePage);
  const buildingY = await mobilePage.evaluate(() => {
    const band = document.getElementById("builder");
    if (!band) return 0;
    return Math.max(
      0,
      Math.round(band.getBoundingClientRect().top + window.scrollY - 48),
    );
  });
  await sampleMobileNavAt(mobilePage, buildingY);
  await mobilePage.evaluate(() => {
    const nav = document.querySelector(".home-navbar");
    if (nav) nav.style.backgroundColor = "rgb(231, 221, 204)";
  });
  const forced = await sampleMobileNavAt(mobilePage, buildingY);
  const mainBaselineAtBuilder = {
    pageAccent: "builder",
    themeColor: "#398fd0",
    navBg: "rgb(57, 143, 208)",
  };
  const navCheckWouldFail = !navSampleMatchesMain(
    { scrollY: buildingY, ...mainBaselineAtBuilder },
    forced,
  );
  negatives.push({
    name: "force-beige-nav-accent-at-390",
    expectProveFail: true,
    detectedFailure: navCheckWouldFail,
    detail: forced,
  });
  await mobileCtx.close();

  const ok = negatives.every((n) => n.detectedFailure === n.expectProveFail);
  return { ok, negatives };
}

await mkdir(OUT, { recursive: true });

if (!MAIN_BASE) {
  console.error("MAIN_PREVIEW_URL is required for cursor baseline comparison");
  process.exit(1);
}

const browser = await chromium.launch();
const stabilityReports = [];

for (let stability = 1; stability <= STABILITY_RUNS; stability += 1) {
  const mainBaselines = await measureMainCursorBaselines(browser, MAIN_BASE);

  const mainProfile = await collect390NavProfile(browser, MAIN_BASE, "main");
  const branchProfile = await collect390NavProfile(browser, BASE, "branch");
  const { ok: match, mismatches } = navProfilesMatch(
    mainProfile.samples,
    branchProfile.samples,
  );
  const mobileNavCompare = {
    ok: match,
    skipped: false,
    main: mainProfile,
    branch: branchProfile,
    mismatches,
  };

  const mobileClosingNavBands = await assertMobileClosingNavMatchesBands(
    browser,
    BASE,
  );
  const mobileOverscrollNav = await runMobileOverscrollNavGate(browser, BASE);
  const desktopVisibleGaps = await runDesktopVisibleGapGate(browser, BASE);
  const stackedPrimaryInk = await runStackedPrimaryInkGate(browser, BASE);
  const cursorKeepOut = await runCursorKeepOutGate(browser, BASE, 16);
  const run1 = await runProvePass(
    browser,
    BASE,
    `s${stability}-run1`,
    mainBaselines,
  );
  const run2 = await runProvePass(
    browser,
    BASE,
    `s${stability}-run2`,
    mainBaselines,
  );
  const negatives = await runNegativeSelfTests(browser, BASE);

  const layoutMetrics = {
    textGapsByWidth: {},
    cursorCountsByWidth: {},
    mainCursorBaselines: mainBaselines,
    emailLinkWidth: {},
    desktopPillGap: {},
    zStackNote: "rows 46, tail 45, splash 40, cursors 1",
    metricsFileDefault: METRICS_OUT,
    artifactsV7: PR40_ARTIFACTS_V7,
  };
  for (const row of desktopVisibleGaps.rows) {
    if (row.gaps) {
      layoutMetrics.textGapsByWidth[row.viewport] = row.gaps;
    }
  }
  for (const row of run1.results) {
    if (!row.viewport || row.state !== "rest") continue;
    if (row.closingGaps?.gaps && !layoutMetrics.textGapsByWidth[row.viewport]) {
      layoutMetrics.textGapsByWidth[row.viewport] = row.closingGaps.gaps;
    }
    if (row.cursorCounts) {
      const settled =
        row.cursorCounts.settled ??
        row.cursorCounts.visible ??
        row.cursorCounts.total ??
        0;
      layoutMetrics.cursorCountsByWidth[row.viewport] = {
        visible: settled,
        expected: row.cursorCounts.expected,
        main: row.cursorCounts.mainBaseline,
      };
    }
    if (row.emailHitArea?.linkWidth != null) {
      layoutMetrics.emailLinkWidth[row.viewport] = row.emailHitArea;
    }
    if (row.desktopPillGap?.gap != null) {
      layoutMetrics.desktopPillGap[row.viewport] = row.desktopPillGap;
    }
  }
  await mkdir(path.dirname(METRICS_OUT), { recursive: true });
  await writeFile(METRICS_OUT, JSON.stringify(layoutMetrics, null, 2));

  const failed =
    !desktopVisibleGaps.ok ||
    !stackedPrimaryInk.ok ||
    !cursorKeepOut.ok ||
    !mobileOverscrollNav.ok ||
    run1.failed ||
    run2.failed ||
    !negatives.ok ||
    !mobileClosingNavBands.ok ||
    !mobileNavCompare.ok;

  const report = {
    stabilityRun: stability,
    mobileNavCompare,
    mobileClosingNavBands,
    mobileOverscrollNav,
    desktopVisibleGaps,
    stackedPrimaryInk,
    cursorKeepOut,
    negatives,
    mainBaselines,
    run1: {
      failed: run1.failed,
      exitCode: run1.failed ? 1 : 0,
      table: run1.table,
    },
    run2: {
      failed: run2.failed,
      exitCode: run2.failed ? 1 : 0,
      table: run2.table,
    },
    ok: !failed,
  };
  stabilityReports.push(report);

  console.log(`=== prove stability run ${stability}/${STABILITY_RUNS} ===`);
  console.log("=== mobile overscroll nav ===");
  console.log(JSON.stringify(mobileOverscrollNav, null, 2));
  console.log("=== desktop visible ink gaps (8 viewports) ===");
  console.log(JSON.stringify(desktopVisibleGaps, null, 2));
  console.log("=== stacked primary ink separation ===");
  console.log(JSON.stringify(stackedPrimaryInk, null, 2));
  console.log("=== prove run 1 (exit", run1.failed ? 1 : 0, ") ===");
  console.table(run1.table);
  console.log("=== prove run 2 (exit", run2.failed ? 1 : 0, ") ===");
  console.table(run2.table);

  if (failed) {
    await browser.close();
    const reportPath = path.join(OUT, "pixel-results.json");
    await writeFile(
      reportPath,
      JSON.stringify({ stabilityReports, failedAt: stability }, null, 2),
    );
    console.error("prove-closing-tail-splash-fill: FAILED");
    process.exit(1);
  }
}

await browser.close();

const reportPath = path.join(OUT, "pixel-results.json");
await writeFile(reportPath, JSON.stringify({ stabilityReports }, null, 2));

console.log("prove-closing-tail-splash-fill: OK");
