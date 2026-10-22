import { chromium, devices } from "playwright";
import {
  HOME_BAND_IDS,
  measureHomeBandScrollTarget,
  measureHomeBandScrollTargets,
} from "./home-band-scroll-target.mjs";

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4321";

const VIEWPORT_WIDTHS = [1440, 1024, 390];

async function scrollY(page) {
  return page.evaluate(() => Math.round(window.scrollY));
}

async function prepareHome(page) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "true";
    delete document.documentElement.dataset.logoMorph;
  });
}

async function scrollToBandInstant(page, bandId) {
  await page.evaluate((id) => {
    document.documentElement.style.scrollSnapType = "none";
    const surface = document.querySelector(".home-scroll-surface");
    const nav = document.querySelector(".home-navbar");
    const navH = nav?.offsetHeight > 0 ? nav.offsetHeight : 64;
    const ids = ["builder", "creator", "educator"];
    const i = ids.indexOf(id);
    if (i < 0 || !surface) return;
    let prior = 0;
    for (let j = 0; j < i; j++) {
      const band = document.getElementById(ids[j]);
      if (band) prior += band.offsetHeight;
    }
    const target = Math.max(0, surface.offsetTop - navH + prior);
    window.scrollTo(0, target);
  }, bandId);
  await page.waitForTimeout(50);
}

async function verifyViewport(browser, width) {
  const height = width === 390 ? 844 : width === 1024 ? 776 : 900;
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await prepareHome(page);

  const targets = await page.evaluate(measureHomeBandScrollTargets);
  const actual = [];
  for (const bandId of HOME_BAND_IDS) {
    await scrollToBandInstant(page, bandId);
    actual.push(await scrollY(page));
  }

  await context.close();

  const ok =
    targets.length === actual.length &&
    targets.every((t, i) => Math.round(t) === actual[i]);
  return { width, targets: targets.map(Math.round), actual, ok };
}

async function verifySnapSettle1024(browser) {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 776 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await prepareHome(page);

  const rows = [];
  let ok = true;

  for (const bandId of HOME_BAND_IDS) {
    const target = await page.evaluate(measureHomeBandScrollTarget, bandId);
    await page.evaluate((y) => {
      document.documentElement.style.scrollSnapType = "";
      window.scrollTo({ top: y, behavior: "auto" });
    }, target);
    await page.waitForTimeout(80);

    const row = await page.evaluate((id) => {
      const nav = document.querySelector(".home-navbar");
      const navH = nav?.offsetHeight ?? 64;
      const band = document.getElementById(id);
      const top = band ? Math.round(band.getBoundingClientRect().top) : -1;
      return {
        scrollY: Math.round(window.scrollY),
        bandTop: top,
        navH,
        target: Math.round(
          (() => {
            const surface = document.querySelector(".home-scroll-surface");
            const ids = ["builder", "creator", "educator"];
            const i = ids.indexOf(id);
            let prior = 0;
            for (let j = 0; j < i; j++) {
              const el = document.getElementById(ids[j]);
              if (el) prior += el.offsetHeight;
            }
            return Math.max(0, surface.offsetTop - navH + prior);
          })(),
        ),
      };
    }, bandId);

    const settled =
      row.scrollY === row.target && row.bandTop === row.navH;
    if (!settled) ok = false;
    rows.push({ bandId, ...row, settled });
  }

  await context.close();
  return { name: "snap-1024", rows, ok };
}

async function verifySearchBand(browser) {
  const page = await browser.newPage({
    ...devices["Desktop Chrome"],
    reducedMotion: "reduce",
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepareHome(page);

  const expectedCreator = await page.evaluate(measureHomeBandScrollTarget, "creator");

  await page.getByRole("button", { name: "Search site" }).click();
  await page.getByRole("combobox", { name: "Search" }).fill("creat");
  await page.getByRole("option", { name: "creating" }).click();
  await page.waitForTimeout(200);
  const y = await scrollY(page);
  const hash = await page.evaluate(() => window.location.hash);
  await page.close();

  const rounded = Math.round(expectedCreator);
  const ok = hash === "#creator" && y === rounded;
  return { name: "search-home-creator", searchCreatorY: y, expected: rounded, hash, ok };
}

async function main() {
  const browser = await chromium.launch();
  const results = [];

  for (const width of VIEWPORT_WIDTHS) {
    results.push(await verifyViewport(browser, width));
  }

  results.push(await verifySnapSettle1024(browser));
  results.push(await verifySearchBand(browser));

  await browser.close();

  let failed = false;
  for (const r of results) {
    if (r.ok === false) {
      failed = true;
      console.error("FAIL", JSON.stringify(r));
    } else {
      console.log("OK", JSON.stringify(r));
    }
  }

  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
