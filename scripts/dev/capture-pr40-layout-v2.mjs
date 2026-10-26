/**
 * Layout v2 screenshots + rect-based measurements.
 * PREVIEW_URL=http://127.0.0.1:4321 node scripts/dev/capture-pr40-layout-v2.mjs
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4321";
const OUT = "/opt/cursor/artifacts/pr40-layout-v2";

async function waitSettled(page) {
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "1";
  });
  await page.waitForFunction(
    () => document.documentElement.dataset.logoMorph !== "pending",
    { timeout: 20_000 },
  );
}

async function scrollToClosing(page) {
  await waitSettled(page);
  await page.evaluate(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.max(0, max));
  });
  await waitSettled(page);
}

async function measureRects(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const nav = document.querySelector(".home-closing-nav-row");
    const primary = document.querySelector(".home-closing-primary-row");
    const email = document.querySelector(".home-footer__email");
    const pills = [...document.querySelectorAll(".home-footer__social-pill")];
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        left: Math.round(r.left),
        right: Math.round(r.right),
      };
    };
    const gap = (a, b) => {
      if (!a || !b) return null;
      return Math.round(b.top - a.bottom);
    };
    const pillRects = pills.map((el, i) => {
      const r = el.getBoundingClientRect();
      return {
        index: i,
        insetLeft: Math.round(r.left),
        insetRight: Math.round(vw - r.right),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
      };
    });
    const emailR = email?.getBoundingClientRect();
    return {
      viewportWidth: vw,
      blockGaps: {
        navToPrimary: gap(rect(nav), rect(primary)),
        primaryToEmail: gap(rect(primary), rect(email)),
        emailToFirstPill:
          emailR && pillRects[0]
            ? Math.round(pillRects[0].top - emailR.bottom)
            : null,
        pillToPill:
          pillRects.length >= 2
            ? Math.round(pillRects[1].top - pillRects[0].bottom)
            : null,
      },
      email: emailR
        ? {
            insetLeft: Math.round(emailR.left),
            insetRight: Math.round(vw - emailR.right),
          }
        : null,
      pills: pillRects,
    };
  });
}

const shots = [
  { file: "1280x800-rest.png", width: 1280, height: 800, hover: false },
  { file: "1280x800-hover-educating.png", width: 1280, height: 800, hover: true },
  { file: "390x844-rest.png", width: 390, height: 844, hover: false },
  { file: "390x844-hover-educating.png", width: 390, height: 844, hover: true },
  { file: "1440x900-rest.png", width: 1440, height: 900, hover: false },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const report = { measurements: [] };

for (const spec of shots) {
  const context = await browser.newContext({
    viewport: { width: spec.width, height: spec.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120_000 });
  await scrollToClosing(page);
  if (spec.hover) {
    const desktop = page.locator("a.home-closing-link--primary", {
      hasText: "educating",
    });
    const mobile = page.locator("a.home-closing-link--mobile", {
      hasText: "educating",
    });
    if ((await desktop.count()) > 0) {
      await desktop.first().hover({ force: true });
    } else {
      await mobile.first().hover({ force: true });
    }
    await page.waitForTimeout(450);
  }
  const metrics = await measureRects(page);
  const outPath = path.join(OUT, spec.file);
  await page.screenshot({ path: outPath, fullPage: false });
  report.measurements.push({ screenshot: spec.file, ...metrics });
  await context.close();
}

await browser.close();
await writeFile(path.join(OUT, "layout-metrics.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
