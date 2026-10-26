/**
 * Layout metrics + screenshots for PR #40 closing screen.
 * PREVIEW_URL=http://127.0.0.1:4321 node scripts/dev/capture-pr40-layout.mjs
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4321";
const OUT = "/opt/cursor/artifacts/pr40-layout";

const VIEWPORTS = [
  { label: "1280x800", width: 1280, height: 800 },
  { label: "1440x900", width: 1440, height: 900 },
  { label: "390x844", width: 390, height: 844 },
];

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

async function measureGaps(page) {
  return page.evaluate(() => {
    const nav = document.querySelector(".home-closing-nav-row");
    const primary = document.querySelector(".home-closing-primary-row");
    const email = document.querySelector(".home-footer__email");
    const pills = document.querySelector(".home-footer__social-list");
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    };
    const gap = (a, b) => {
      if (!a || !b) return null;
      return Math.round(b.top - a.bottom);
    };
    const csMargin = (el) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      return {
        marginTop: parseFloat(s.marginTop) || 0,
        marginRight: parseFloat(s.marginRight) || 0,
        marginBottom: parseFloat(s.marginBottom) || 0,
        marginLeft: parseFloat(s.marginLeft) || 0,
      };
    };
    return {
      gaps: {
        navToPrimary: gap(rect(nav), rect(primary)),
        primaryToEmail: gap(rect(primary), rect(email)),
        emailToPills: gap(rect(email), rect(pills)),
      },
      emailMargin: csMargin(email),
      pillMargin: csMargin(
        document.querySelector(".home-footer__social-pill"),
      ),
      tailHeight: document
        .querySelector(".home-closing-tail")
        ?.getBoundingClientRect().height,
    };
  });
}

async function hoverEducating(page) {
  const link = page.locator("a.home-closing-link--primary", {
    hasText: "educating",
  });
  if ((await link.count()) === 0) {
    const mobile = page.locator('a.home-closing-link--mobile', {
      hasText: "educating",
    });
    await mobile.first().hover({ force: true });
    return;
  }
  await link.first().hover({ force: true });
  await page.waitForTimeout(500);
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const report = { viewports: [] };

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120_000 });
  await scrollToClosing(page);
  const restMetrics = await measureGaps(page);
  const restPath = path.join(OUT, `${vp.label}-rest.png`);
  await page.screenshot({ path: restPath, fullPage: false });
  const shots = { rest: restPath };
  if (vp.label !== "1440x900") {
    await hoverEducating(page);
    const hoverPath = path.join(OUT, `${vp.label}-hover-educating.png`);
    await page.screenshot({ path: hoverPath, fullPage: false });
    shots.hover = hoverPath;
  }
  report.viewports.push({
    label: vp.label,
    rest: restMetrics,
    screenshots: shots,
  });
  await context.close();
}

await browser.close();
await writeFile(path.join(OUT, "layout-metrics.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
