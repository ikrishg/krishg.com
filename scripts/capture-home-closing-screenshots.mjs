import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.PREVIEW_URL ?? "http://127.0.0.1:4321";
const outDir =
  process.env.SCREENSHOT_DIR ?? "/opt/cursor/artifacts/screenshots";

const viewports = [
  { width: 1440, height: 900, label: "desktop" },
  { width: 1024, height: 776, label: "tablet" },
  { width: 390, height: 844, label: "mobile" },
];

async function scrollToClosing(page) {
  const aligned = await page.evaluate(() => {
    const tail = document.querySelector(".home-closing-tail");
    const nav = document.querySelector(".home-navbar");
    if (!tail || !nav) return false;
    const navBottom = nav.getBoundingClientRect().bottom;
    for (let attempt = 0; attempt < 48; attempt += 1) {
      const delta = tail.getBoundingClientRect().top - navBottom;
      if (Math.abs(delta) < 2) return true;
      window.scrollBy(0, delta);
    }
    return Math.abs(tail.getBoundingClientRect().top - navBottom) < 6;
  });
  await page.waitForTimeout(500);
  if (!aligned) {
    console.warn("Could not align closing index under navbar");
  }
}

async function skipIntro(page) {
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "true";
  });
}

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();

for (const { width, height, label } of viewports) {
  const page = await browser.newPage({
    viewport: { width, height },
    reducedMotion: "no-preference",
  });
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await skipIntro(page);
  await scrollToClosing(page);

  const restPath = path.join(outDir, `homepage-closing-rest-${label}.png`);
  await page.screenshot({ path: restPath, animations: "disabled" });
  console.log(`Wrote ${restPath}`);

  const link = page.locator(
    "#home-closing-index [data-splash-key='building']",
  );
  await link.hover({ force: true });
  await page.waitForTimeout(180);

  const midPath = path.join(outDir, `homepage-closing-splash-mid-${label}.png`);
  await page.screenshot({ path: midPath, animations: "disabled" });
  console.log(`Wrote ${midPath}`);

  await page.waitForTimeout(680);
  const fullPath = path.join(
    outDir,
    `homepage-closing-splash-full-${label}.png`,
  );
  await page.screenshot({ path: fullPath, animations: "disabled" });
  console.log(`Wrote ${fullPath}`);

  await page.close();
}

await browser.close();
console.log("Done.");
