/**
 * Settled drifting-cursor counts at closing tail (matches verify/prove).
 */
import { chromium } from "playwright";

export const CURSOR_VIEWPORTS = [
  { width: 768, height: 1024 },
  { width: 1024, height: 776 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
];

export async function scrollToClosing(page) {
  await page.waitForFunction(
    () => document.documentElement.dataset.logoMorph !== "pending",
    { timeout: 20_000 },
  );
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "true";
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.max(0, max));
  });
  await page.waitForTimeout(1500);
}

export async function countSettledCursors(page) {
  return page.evaluate(() => {
    const root = document.querySelector(".home-drifting-cursors");
    const cursors = root
      ? [...root.querySelectorAll(".home-drifting-cursor")]
      : [];
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
    return visible;
  });
}

export async function waitForStableMountedCount(page, target, attempts = 80) {
  let best = 0;
  for (let i = 0; i < attempts; i += 1) {
    const n = await page.evaluate(
      () => document.querySelectorAll(".home-drifting-cursor").length,
    );
    best = Math.max(best, n);
    if (best >= target) break;
    await page.waitForTimeout(300);
  }
  return best;
}

export async function waitForStableCursorCount(page, target, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    const n = await countSettledCursors(page);
    if (n === target) return n;
    await page.waitForTimeout(250);
  }
  return countSettledCursors(page);
}

/** Settled when the same count is observed several ticks in a row. */
export async function measureStableCursorCount(page, {
  ticks = 5,
  intervalMs = 200,
  maxAttempts = 80,
} = {}) {
  let last = -1;
  let stable = 0;
  for (let i = 0; i < maxAttempts; i += 1) {
    const n = await countSettledCursors(page);
    if (n === last) {
      stable += 1;
      if (stable >= ticks) return n;
    } else {
      last = n;
      stable = 1;
    }
    await page.waitForTimeout(intervalMs);
  }
  return last >= 0 ? last : await countSettledCursors(page);
}

const MIN_MOUNTED_AT_768 = 5;

/** Branch mounted cursors vs main; 768 allows main−1 (branch cap) with a hard floor. */
export function cursorVisibleMeetsMainBaseline(
  branchCount,
  mainCount,
  viewportWidth,
) {
  const min = Math.max(0, mainCount - 1);
  if (viewportWidth <= 768) {
    return branchCount >= MIN_MOUNTED_AT_768 && branchCount >= min;
  }
  return branchCount === mainCount;
}

export function formatCursorCountFailure({
  viewport = "unknown",
  branchVisible,
  mainCount,
  branchMounted,
} = {}) {
  const branch = branchMounted ?? branchVisible;
  return (
    `cursor-count failure at ${viewport}: branch mounted=${branch}, ` +
    `main baseline=${mainCount} (768: min 5 and main−1; wider: exact match)`
  );
}

export async function measureMountedCursorAt(
  browser,
  baseUrl,
  viewport,
  { reducedMotion = "no-preference" } = {},
) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.emulateMedia({ reducedMotion });
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "true";
  });
  await scrollToClosing(page);
  await measureStableCursorCount(page);
  const mounted = await page.evaluate(
    () => document.querySelectorAll(".home-drifting-cursor").length,
  );
  await ctx.close();
  return mounted;
}

export async function measureMainMountedBaselines(browser, mainUrl, {
  samplesPerViewport = 3,
} = {}) {
  const baselines = {};
  for (const viewport of CURSOR_VIEWPORTS) {
    const samples = [];
    for (let i = 0; i < samplesPerViewport; i += 1) {
      samples.push(
        await measureMountedCursorAt(browser, mainUrl, viewport),
      );
    }
    baselines[viewport.width] = Math.max(...samples);
  }
  return baselines;
}

export async function measureCursorCountAt(
  browser,
  baseUrl,
  viewport,
  { pollTarget = null, reducedMotion = "no-preference" } = {},
) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.emulateMedia({ reducedMotion });
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "true";
  });
  await scrollToClosing(page);
  let count = await measureStableCursorCount(page);
  if (pollTarget != null && count !== pollTarget) {
    count = await waitForStableCursorCount(page, pollTarget);
  }
  await ctx.close();
  return count;
}

export function modeCount(samples) {
  const tallies = new Map();
  for (const n of samples) {
    tallies.set(n, (tallies.get(n) ?? 0) + 1);
  }
  let best = samples[0] ?? 0;
  let bestTally = 0;
  for (const [n, tally] of tallies) {
    if (tally > bestTally) {
      bestTally = tally;
      best = n;
    }
  }
  return best;
}

export async function measureMainCursorBaselines(browser, mainUrl, {
  samplesPerViewport = 1,
} = {}) {
  const baselines = {};
  for (const viewport of CURSOR_VIEWPORTS) {
    const samples = [];
    for (let i = 0; i < samplesPerViewport; i += 1) {
      samples.push(
        await measureCursorCountAt(browser, mainUrl, viewport),
      );
    }
    baselines[viewport.width] =
      samplesPerViewport > 1 ? Math.max(...samples) : samples[0];
  }
  return baselines;
}

export async function measureBranchCursorCounts(browser, branchUrl, mainBaselines) {
  const rows = [];
  let ok = true;
  for (const viewport of CURSOR_VIEWPORTS) {
    const expected = mainBaselines[viewport.width];
    const count = await measureCursorCountAt(browser, branchUrl, viewport, {
      pollTarget: expected,
    });
    const match = cursorVisibleMeetsMainBaseline(
      count,
      expected,
      viewport.width,
    );
    if (!match) ok = false;
    const viewportLabel = `${viewport.width}x${viewport.height}`;
    rows.push({
      viewport: viewportLabel,
      branch: count,
      main: expected,
      expected,
      ok: match,
      failureMessage: match
        ? null
        : formatCursorCountFailure({
            viewport: viewportLabel,
            branchVisible: count,
            mainCount: expected,
          }),
    });
  }
  return { ok, rows };
}
