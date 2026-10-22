import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.PREVIEW_URL ?? "http://127.0.0.1:4321";
const outDir =
  process.env.SCREENSHOT_DIR ?? "/opt/cursor/artifacts/screenshots";

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "no-preference",
});

await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
await page.evaluate(() => {
  document.documentElement.dataset.introSkip = "true";
});

async function scrollToIndex() {
  await page.evaluate(() => {
    const tail = document.querySelector(".home-closing-tail");
    const nav = document.querySelector(".home-navbar");
    const navBottom = nav.getBoundingClientRect().bottom;
    for (let i = 0; i < 48; i++) {
      const d = tail.getBoundingClientRect().top - navBottom;
      if (Math.abs(d) < 2) return;
      window.scrollBy(0, d);
    }
  });
  await page.waitForTimeout(300);
}

async function scrollToBottom() {
  await page.locator(".home-footer").scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const footer = document.querySelector(".home-footer");
    const nav = document.querySelector(".home-navbar");
    const navBottom = nav.getBoundingClientRect().bottom;
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const delta = footer.getBoundingClientRect().top - navBottom;
      if (Math.abs(delta) < 2) return;
      window.scrollBy(0, delta);
    }
  });
  await page.waitForSelector('.home-overscroll-painting[data-loaded="true"]', {
    timeout: 60_000,
  });
}

await scrollToIndex();
await page.locator('[data-splash-key="building"]').first().hover();
await page.waitForTimeout(400);
await page.locator('[data-splash-key="creating"]').first().hover();
await page.waitForTimeout(700);
const splashPath = path.join(
  outDir,
  "homepage-closing-splash-gap400-building-creating-1440.png",
);
await page.screenshot({ path: splashPath, animations: "disabled" });
console.log(`Wrote ${splashPath}`);

await scrollToBottom();
for (let i = 0; i < 4; i += 1) {
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(35);
}
await page.waitForTimeout(60);
const pull = await page.evaluate(() =>
  Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--home-overscroll-pull",
    ) || "0",
  ),
);
if (pull < 24) {
  throw new Error(`Expected pull for Starry shot, got ${pull}`);
}
const starryPath = path.join(outDir, "homepage-starry-wheel-1440.png");
await page.screenshot({ path: starryPath, animations: "disabled" });
console.log(`Wrote ${starryPath}`);

await browser.close();
