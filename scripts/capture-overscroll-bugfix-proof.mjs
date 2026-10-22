import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.PREVIEW_URL ?? "http://127.0.0.1:4321";
const root = process.env.ARTIFACT_DIR ?? "/opt/cursor/artifacts/krishg-polish";
const proof = path.join(root, "proof");
const shots = path.join(proof, "screenshots");
const video = path.join(proof, "video");

async function ensure() {
  await mkdir(shots, { recursive: true });
  await mkdir(video, { recursive: true });
}

async function scrollBottom(page) {
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 35; i++) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await sleep(55);
    }
  });
  await page.waitForTimeout(500);
  await page.waitForSelector('.home-overscroll-painting[data-loaded="true"]', {
    timeout: 60_000,
    state: "attached",
  });
}

async function midOverscroll(page) {
  const width = page.viewportSize()?.width ?? 820;
  await page.mouse.move(Math.floor(width * 0.55), 500);
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, 110);
    await page.waitForTimeout(35);
  }
  await page.waitForTimeout(60);
  let metrics = await page.evaluate(() => {
    const pull = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--home-overscroll-pull",
      ),
    );
    const art = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--home-overscroll-art-opacity",
      ),
    );
    const visible = document.querySelector(".home-overscroll-painting")?.dataset
      .visible;
    return { pull, art, visible };
  });
  if (metrics.pull < 80 || metrics.visible !== "true") {
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(55);
    metrics = await page.evaluate(() => {
      const pull = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--home-overscroll-pull",
        ),
      );
      const visible = document.querySelector(".home-overscroll-painting")?.dataset
        .visible;
      return { pull, visible };
    });
  }
  if (metrics.pull < 80 || metrics.visible !== "true") {
    throw new Error(`overscroll not active: ${JSON.stringify(metrics)}`);
  }
}

async function shotMidOverscroll(browser, width, height, name) {
  const page = await browser.newPage();
  await page.setViewportSize({ width, height });
  await scrollBottom(page);
  await midOverscroll(page);
  const out = path.join(shots, name);
  await page.screenshot({ path: out, fullPage: false });
  await page.close();
  return out;
}

async function recordScrollPastIndex(browser) {
  const ctx = await browser.newContext({
    recordVideo: { dir: video, size: { width: 1440, height: 900 } },
  });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.locator("#home-closing-index").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const link = page.getByRole("link", { name: /^building$/i }).first();
  const box = await link.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  }
  await page.waitForTimeout(200);
  for (let i = 0; i < 35; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(1200);
  await ctx.close();
  const raw = await page.video()?.path();
  const out = path.join(video, "12-scroll-over-links-no-splash-1440.webm");
  if (raw) {
    const { rename } = await import("node:fs/promises");
    await rename(raw, out).catch(() => {});
  }
  return out;
}

async function main() {
  await ensure();
  const browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const report = {
    overscroll820: await shotMidOverscroll(
      browser,
      820,
      900,
      "12-overscroll-mid-820.png",
    ),
    overscroll1440: await shotMidOverscroll(
      browser,
      1440,
      900,
      "12-overscroll-mid-1440.png",
    ),
    overscroll390: await shotMidOverscroll(
      browser,
      390,
      844,
      "12-overscroll-mid-390.png",
    ),
    scrollNoSplash: await recordScrollPastIndex(browser),
  };
  await browser.close();
  const reportPath = path.join(proof, "12-overscroll-bugfix-report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
