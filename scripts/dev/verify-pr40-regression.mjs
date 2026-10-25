/**
 * Read-only PR #40 / #38 regression check at closing viewports.
 * Usage: PREVIEW_URL=http://127.0.0.1:4321 node scripts/dev/verify-pr40-regression.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4321";
const VIEWPORTS = [
  { width: 768, height: 1024 },
  { width: 1024, height: 776 },
  { width: 1440, height: 900 },
];

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

async function scrollToClosing(page) {
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "true";
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.max(0, max));
  });
  await page.waitForTimeout(600);
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
      index: z("#home-closing-index"),
      footer: z(".home-closing-tail .home-footer"),
      footerLayout: z(".home-closing-tail .home-footer__layout"),
    };
  });
}

async function measureCursors(page) {
  const snapshot = () =>
    page.evaluate(() => {
      const root = document.querySelector(".home-drifting-cursors");
      const transforms = root
        ? [...root.querySelectorAll(".home-drifting-cursor")].map(
            (el) => getComputedStyle(el).transform,
          )
        : [];
      return {
        mounted: Boolean(root),
        cursorCount: transforms.length,
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
    driftDetected: moved,
  };
}

async function sampleContactKeepHits(page, samples = 20, intervalMs = 100) {
  let totalHits = 0;
  for (let i = 0; i < samples; i += 1) {
    const hits = await page.evaluate(() => {
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
      const cursors = [
        ...document.querySelectorAll(".home-drifting-cursor"),
      ].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 2 && r.height > 2;
      });
      let n = 0;
      for (const cur of cursors) {
        const r = cur.getBoundingClientRect();
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
  return { samples, totalContactKeepHits: totalHits };
}

async function heroSplashWhenTailOffScreen(page) {
  await scrollToEducator(page);
  const pre = await page.evaluate(() => ({
    closingView: document.documentElement.dataset.homeClosingView ?? "",
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
    const overlayBg = splash
      ? getComputedStyle(splash).backgroundColor
      : "";
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
      overlayBg,
      samplePoint: { x, y },
      topElementClass: el?.className?.slice?.(0, 80) ?? String(el?.tagName),
      splashActive: ds === "educating" && overlayOpacity > 0.5,
    };
  }, pre);
}

const browser = await chromium.launch();
const report = { viewports: [], heroSplash: null, ok: true };

for (const viewport of VIEWPORTS) {
  const page = await browser.newPage({ viewport });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120_000 });
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "true";
    window.__driftCursorRafFrames = 0;
  });
  await scrollToClosing(page);

  const zOrder = await measureZOrder(page);
  const cursors = await measureCursors(page);
  const keepHits = await sampleContactKeepHits(page);

  const zOk =
    Number(zOrder.cursors.zIndex) === 1 &&
    Number(zOrder.splash.zIndex) <= 40 &&
    Number(zOrder.tail.zIndex) === 45 &&
    Number(zOrder.index.zIndex) >= 46 &&
    Number(zOrder.footerLayout.zIndex) >= 46;

  const cursorOk =
    cursors.mounted &&
    cursors.cursorCount >= 4 &&
    cursors.driftDetected;

  const keepOk = keepHits.totalContactKeepHits === 0;

  const row = {
    viewport: `${viewport.width}x${viewport.height}`,
    zOrder,
    zOk,
    cursors,
    cursorOk,
    keepHits,
    keepOk,
    ok: zOk && cursorOk && keepOk,
  };
  if (!row.ok) report.ok = false;
  report.viewports.push(row);
  await page.close();
}

const heroPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await heroPage.goto(BASE, { waitUntil: "networkidle", timeout: 120_000 });
report.heroSplash = await heroSplashWhenTailOffScreen(heroPage);
if (
  !report.heroSplash.splashActive ||
  report.heroSplash.portalVisibility === "hidden" ||
  (report.heroSplash.tailTop ?? 0) < 400
) {
  report.ok = false;
  report.heroSplash.ok = false;
} else {
  report.heroSplash.ok = true;
}
await heroPage.close();
await browser.close();

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
