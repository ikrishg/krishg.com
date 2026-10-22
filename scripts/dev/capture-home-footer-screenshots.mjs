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

async function scrollToFooter(page) {
  await page.evaluate(() => {
    const footer = document.querySelector(".home-footer");
    const nav = document.querySelector(".home-navbar");
    if (!footer || !nav) return;
    const navBottom = nav.getBoundingClientRect().bottom;
    footer.scrollIntoView({ block: "start", behavior: "instant" });
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const delta = footer.getBoundingClientRect().top - navBottom;
      if (Math.abs(delta) < 2) return;
      window.scrollBy(0, delta);
    }
  });
  await page.waitForTimeout(450);
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
    reducedMotion: "reduce",
  });
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await skipIntro(page);
  await scrollToFooter(page);

  const file = path.join(outDir, `homepage-footer-${label}.png`);
  await page.screenshot({ path: file, animations: "disabled" });
  console.log(`Wrote ${file}`);

  await page.close();
}

await browser.close();
console.log("Done.");
