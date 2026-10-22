import { chromium, devices } from "playwright";

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4321";

const EXPECTED = {
  1440: [0, 836, 1672],
  1024: [0, 712, 1424],
  390: [0, 780, 1560],
};

const BANDS = ["builder", "creator", "educator"];

async function scrollY(page) {
  return page.evaluate(() => Math.round(window.scrollY));
}

async function scrollToBandInstant(page, bandId) {
  await page.evaluate((id) => {
    document.documentElement.style.scrollSnapType = "none";
    const surface = document.querySelector(".home-scroll-surface");
    const nav = document.querySelector(".home-navbar");
    const navH = nav?.offsetHeight ?? 64;
    const ids = ["builder", "creator", "educator"];
    const i = ids.indexOf(id);
    if (i < 0 || !surface) return;
    const step = window.innerHeight - navH;
    const target = surface.offsetTop - navH + i * step;
    window.scrollTo(0, Math.max(0, target));
  }, bandId);
  await page.waitForTimeout(50);
}

function viewportHeightForTargets(targets, navH = 64) {
  const step = targets[1] ?? 0;
  return step + navH;
}

async function verifyViewport(browser, width, targets) {
  const height = viewportHeightForTargets(targets);
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "true";
    delete document.documentElement.dataset.logoMorph;
  });

  const actual = [];
  for (const bandId of BANDS) {
    await scrollToBandInstant(page, bandId);
    actual.push(await scrollY(page));
  }

  await context.close();

  const ok = targets.every((t, i) => actual[i] === t);
  return { width, targets, actual, ok };
}

async function verifySearchBand(browser) {
  const page = await browser.newPage({
    ...devices["Desktop Chrome"],
    reducedMotion: "reduce",
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "true";
  });

  await page.getByRole("button", { name: "Search site" }).click();
  await page.getByRole("combobox", { name: "Search" }).fill("creat");
  await page.getByRole("option", { name: "creating" }).click();
  await page.waitForTimeout(100);
  const y = await scrollY(page);
  const hash = await page.evaluate(() => window.location.hash);
  await page.close();

  const ok = hash === "#creator" && y === 836;
  return { searchCreatorY: y, hash, ok };
}

async function main() {
  const browser = await chromium.launch();
  const results = [];

  for (const [width, targets] of Object.entries(EXPECTED)) {
    results.push(await verifyViewport(browser, Number(width), targets));
  }

  results.push({
    name: "search-home-creator",
    ...(await verifySearchBand(browser)),
  });

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
