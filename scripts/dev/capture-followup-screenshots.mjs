import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.PREVIEW_URL ?? "http://127.0.0.1:4321";
const outDir =
  process.env.SCREENSHOT_DIR ?? "/opt/cursor/artifacts/screenshots";

await mkdir(outDir, { recursive: true });

async function scrollToClosing(page) {
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "true";
    const tail = document.querySelector(".home-closing-tail");
    const nav = document.querySelector(".home-navbar");
    if (!tail || !nav) return;
    const navBottom = nav.getBoundingClientRect().bottom;
    for (let i = 0; i < 64; i++) {
      const delta = tail.getBoundingClientRect().top - navBottom;
      if (Math.abs(delta) < 2) break;
      window.scrollBy(0, delta);
    }
  });
  await page.waitForTimeout(400);
}

async function pullStarry(page, maxPull) {
  await page.waitForSelector('.home-overscroll-painting[data-loaded="true"]', {
    timeout: 60_000,
  });
  const steps = 12;
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, Math.ceil(maxPull / steps));
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(200);
}

const browser = await chromium.launch();

for (const { width, height, label } of [
  { width: 1440, height: 900, label: "1440" },
  { width: 390, height: 844, label: "390" },
]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await scrollToClosing(page);
  await page.locator(".home-footer").scrollIntoViewIfNeeded();
  await pullStarry(page, 400);
  const starryPath = path.join(outDir, `homepage-starry-full-${label}.png`);
  await page.screenshot({ path: starryPath, animations: "disabled" });
  console.log(`Wrote ${starryPath}`);

  if (width >= 768) {
    await scrollToClosing(page);
    const building = page.locator(
      "#home-closing-index .home-closing-link--primary[data-splash-key='building']",
    );
    await building.hover({ force: true });
    await page.waitForTimeout(350);
    await page.screenshot({
      path: path.join(outDir, `homepage-splash-mid-${label}.png`),
      animations: "disabled",
    });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(outDir, `homepage-splash-full-${label}.png`),
      animations: "disabled",
    });
  }

  await page.close();
}

await browser.close();
