/**
 * Closing-index CLS: scroll into view before hydration, then measure SSR vs applied.
 * Usage: PREVIEW_URL=http://127.0.0.1:4321 node scripts/measure-closing-primary-cls.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4321";
const VIEWPORTS = [
  { width: 1440, height: 900, label: "1440" },
  { width: 1024, height: 768, label: "1024" },
  { width: 390, height: 844, label: "390" },
  { width: 360, height: 800, label: "360" },
];

async function measureSsrNoJs(browser, { width, height }) {
  const page = await browser.newPage({ javaScriptEnabled: false });
  await page.setViewportSize({ width, height });
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  const metrics = await page.evaluate(() => {
    document.getElementById("home-closing-index")?.scrollIntoView({
      block: "center",
    });
    const primary = [
      ...document.querySelectorAll(".home-closing-link--primary span"),
    ].map(
      (el) =>
        Math.round(parseFloat(getComputedStyle(el).fontSize) * 1000) / 1000,
    );
    const mobile = [
      ...document.querySelectorAll(".home-closing-link--mobile span"),
    ].map(
      (el) =>
        Math.round(parseFloat(getComputedStyle(el).fontSize) * 1000) / 1000,
    );
    return { primary, mobile };
  });
  await page.close();
  return metrics;
}

async function measureViewport(browser, { width, height, label }) {
  const ssr = await measureSsrNoJs(browser, { width, height });

  const page = await browser.newPage();
  await page.setViewportSize({ width, height });

  await page.addInitScript(() => {
    document.documentElement.dataset.introSkip = "1";
    window.__closingHydration = {
      ssrPrimaryPx: [],
      ssrMobilePx: [],
      clsInView: 0,
    };

    const captureSsr = () => {
      const primaries = document.querySelectorAll(
        ".home-closing-link--primary span",
      );
      if (primaries.length > 0) {
        const blocked = [...primaries].some((el) => el.style.fontSize);
        if (!blocked) {
          window.__closingHydration.ssrPrimaryPx = [...primaries].map(
            (el) =>
              Math.round(parseFloat(getComputedStyle(el).fontSize) * 1000) /
              1000,
          );
        }
      }
      const mobile = document.querySelectorAll(".home-closing-link--mobile span");
      if (mobile.length > 0) {
        const blocked = [...mobile].some((el) => el.style.fontSize);
        if (!blocked) {
          window.__closingHydration.ssrMobilePx = [...mobile].map(
            (el) =>
              Math.round(parseFloat(getComputedStyle(el).fontSize) * 1000) /
              1000,
          );
        }
      }
    };

    const scrollClosing = () => {
      document.getElementById("home-closing-index")?.scrollIntoView({
        block: "center",
      });
      captureSsr();
    };

    const boot = () => {
      scrollClosing();
      requestAnimationFrame(scrollClosing);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
      boot();
    }

    new MutationObserver(() => {
      scrollClosing();
      captureSsr();
    }).observe(document.documentElement, { childList: true, subtree: true });

    const layoutObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        const closing = document.getElementById("home-closing-index");
        if (!closing) continue;
        const rect = closing.getBoundingClientRect();
        const inView = rect.top < window.innerHeight && rect.bottom > 0;
        if (!inView) continue;
        window.__closingHydration.clsInView += entry.value;
      }
    });
    layoutObserver.observe({ type: "layout-shift", buffered: true });
  });

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

  await page.waitForFunction(
    () => {
      const row = document.querySelector(".home-closing-primary-row");
      const primaries = document.querySelectorAll(
        ".home-closing-link--primary span",
      );
      if (primaries.length >= 3) {
        return Boolean(row?.dataset.closingPrimaryApplied);
      }
      const mobile = document.querySelectorAll(".home-closing-link--mobile span");
      return mobile.length >= 6;
    },
    { timeout: 60_000 },
  );

  await page.waitForTimeout(500);

  const report = await page.evaluate(() => {
    const row = document.querySelector(".home-closing-primary-row");
    const hydration = window.__closingHydration || {
      ssrPrimaryPx: [],
      ssrMobilePx: [],
      clsInView: 0,
    };

    const postPrimary = [
      ...document.querySelectorAll(".home-closing-link--primary span"),
    ].map(
      (el) =>
        Math.round(parseFloat(getComputedStyle(el).fontSize) * 1000) / 1000,
    );

    const postMobile = [
      ...document.querySelectorAll(".home-closing-link--mobile span"),
    ].map(
      (el) =>
        Math.round(parseFloat(getComputedStyle(el).fontSize) * 1000) / 1000,
    );

    return {
      ssrPrimaryPx: hydration.ssrPrimaryPx,
      ssrMobilePx: hydration.ssrMobilePx,
      fittedPx: row?.dataset.closingPrimaryFittedMin
        ? parseFloat(row.dataset.closingPrimaryFittedMin)
        : null,
      clampPx: row?.dataset.closingPrimaryClamp
        ? parseFloat(row.dataset.closingPrimaryClamp)
        : null,
      appliedPx: row?.dataset.closingPrimaryApplied
        ? parseFloat(row.dataset.closingPrimaryApplied)
        : null,
      postPrimaryPx: postPrimary,
      postMobilePx: postMobile,
      clsInView: Math.round(hydration.clsInView * 10000) / 10000,
    };
  });

  return {
    viewport: label,
    ssrPrimaryPx: ssr.primary,
    ssrMobilePx: ssr.mobile,
    fittedPx: report.fittedPx,
    clampPx: report.clampPx,
    appliedPx: report.appliedPx,
    postPrimaryPx: report.postPrimaryPx,
    postMobilePx: report.postMobilePx,
    clsInView: report.clsInView,
  };
}

async function main() {
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const vp of VIEWPORTS) {
      results.push(await measureViewport(browser, vp));
    }
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify({ preview: BASE, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
