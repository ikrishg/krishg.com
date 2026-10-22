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

for (let i = 0; i < 4; i += 1) {
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(50);
}

await page.waitForTimeout(60);

const metrics = await page.evaluate(() => {
  const pull = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--home-overscroll-pull",
    ) || "0",
  );
  const painting = document.querySelector(".home-overscroll-painting");
  const surface = document.querySelector(".home-scroll-surface");
  const root = document.documentElement;
  return {
    pull,
    paintingVisible: painting?.dataset.visible === "true",
    transform: surface?.style.transform ?? "",
    scrollY: window.scrollY,
    scrollHeight: root.scrollHeight,
    atBottom:
      window.scrollY + window.innerHeight >= root.scrollHeight - 2,
  };
});

if (metrics.pull < 24) {
  throw new Error(`Expected active pull for screenshot, got ${metrics.pull}`);
}

const file = path.join(outDir, "homepage-starry-wheel-1440.png");
await page.screenshot({ path: file, animations: "disabled" });
console.log(`Wrote ${file}`);
console.log(JSON.stringify(metrics, null, 2));

await page.waitForTimeout(400);

await browser.close();
