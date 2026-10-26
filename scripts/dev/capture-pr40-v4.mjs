/**
 * PR40 v4 screenshots + metrics (1.5s settle).
 * PREVIEW_URL=http://127.0.0.1:4321 node scripts/dev/capture-pr40-v4.mjs
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4321";
const OUT = "/opt/cursor/artifacts/pr40-v4";
const SETTLE_MS = 1500;

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
  await page.waitForTimeout(SETTLE_MS);
}

async function measureGaps(page, isMobile) {
  return page.evaluate((mobile) => {
    const navBottom =
      document.querySelector(".home-navbar")?.getBoundingClientRect().bottom ??
      64;
    const vh = window.innerHeight;
    if (mobile) {
      const last = document.querySelector(
        ".home-closing-link--mobile:last-of-type",
      );
      const email = document.querySelector(".home-footer__email");
      const pills = [...document.querySelectorAll(".home-footer__social-pill")];
      const lr = last?.getBoundingClientRect();
      const er = email?.getBoundingClientRect();
      const pr = pills.map((p) => p.getBoundingClientRect());
      return {
        gaps: [er.top - lr.bottom, pr[0].top - er.bottom, vh - pr[pr.length - 1].bottom],
        pillGap: pr[1].top - pr[0].bottom,
      };
    }
    const navRow = document.querySelector(".home-closing-nav-row");
    const primary = document.querySelector(".home-closing-primary-row");
    const email = document.querySelector(".home-footer__email");
    const social = document.querySelector(".home-footer__social");
    const pills = [...document.querySelectorAll(".home-footer__social-pill")];
    const nr = navRow.getBoundingClientRect();
    const pr = primary.getBoundingClientRect();
    const er = email.getBoundingClientRect();
    const sr = social.getBoundingClientRect();
    const tail = document.querySelector(".home-closing-tail").getBoundingClientRect();
    const pb = Math.max(...pills.map((p) => p.getBoundingClientRect().bottom));
    return {
      gaps: [nr.top - navBottom, pr.top - nr.bottom, er.top - pr.bottom, sr.top - er.bottom, tail.bottom - sr.bottom],
    };
  }, isMobile);
}

function gapStats(gaps) {
  const rounded = gaps.map((g) => Math.round(g));
  const min = Math.min(...rounded);
  const max = Math.max(...rounded);
  return { gaps: rounded, min, max, ratio: max / min };
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}`, fullPage: false });
}

async function scrollBandUnderNav(page, key) {
  await page.evaluate((bandKey) => {
    const link = document.querySelector(
      `.home-closing-link--mobile[data-splash-key="${bandKey}"]`,
    );
    if (!link) return;
    const rect = link.getBoundingClientRect();
    window.scrollTo(
      0,
      Math.max(0, window.scrollY + rect.top + rect.height / 2 - 72),
    );
    window.dispatchEvent(new Event("scroll"));
  }, key);
  await page.waitForTimeout(SETTLE_MS);
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const measurements = [];

for (const { w, h, mobile } of [
  { w: 1280, h: 800, mobile: false },
  { w: 1440, h: 900, mobile: false },
  { w: 1024, h: 768, mobile: false },
  { w: 768, h: 1024, mobile: false },
  { w: 390, h: 844, mobile: true },
]) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120_000 });
  await scrollToClosing(page);
  const raw = await measureGaps(page, mobile);
  measurements.push({
    viewport: `${w}x${h}`,
    ...gapStats(raw.gaps),
    pillGap: raw.pillGap ? Math.round(raw.pillGap) : undefined,
  });
  if (w === 1280) {
    await shot(page, "1280x800-rest.png");
    await page
      .locator("a.home-closing-link--primary", { hasText: "educating" })
      .first()
      .hover();
    await page.waitForTimeout(SETTLE_MS);
    await shot(page, "1280x800-hover-educating.png");
  }
  if (w === 1440) await shot(page, "1440x900-rest.png");
  if (w === 390) {
    await shot(page, "390x844-rest.png");
    const edu = page.locator("a.home-closing-link--mobile", {
      hasText: "educating",
    });
    await edu.first().hover({ force: true });
    await page.waitForTimeout(SETTLE_MS);
    await shot(page, "390x844-hover-educating.png");
    await scrollBandUnderNav(page, "creating");
    await shot(page, "390x844-nav-over-creating-red.png");
    await scrollBandUnderNav(page, "educating");
    await shot(page, "390x844-nav-over-educating-yellow.png");
  }
  await ctx.close();
}

await writeFile(
  `${OUT}/layout-metrics.json`,
  JSON.stringify({ measurements }, null, 2),
);
console.log(JSON.stringify({ measurements }, null, 2));
await browser.close();
