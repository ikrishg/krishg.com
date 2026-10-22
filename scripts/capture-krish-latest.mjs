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
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 30; i++) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await sleep(60);
    }
  });
  await page.waitForTimeout(500);
}

async function overscrollPull(page) {
  await page.mouse.move(720, 500);
  for (let i = 0; i < 28; i++) {
    await page.mouse.wheel(0, 90);
    await page.waitForTimeout(55);
  }
  await page.waitForTimeout(700);
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, -40);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(1200);
}

async function recordOverscroll(browser, width, height, name) {
  const ctx = await browser.newContext({
    recordVideo: { dir: video, size: { width, height } },
  });
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await scrollBottom(page);
  await overscrollPull(page);
  await ctx.close();
  const raw = await page.video()?.path();
  const out = path.join(video, name);
  if (raw) {
    const { rename } = await import("node:fs/promises");
    await rename(raw, out).catch(() => {});
  }
  return out;
}

async function recordSplashHover(browser) {
  const ctx = await browser.newContext({
    recordVideo: { dir: video, size: { width: 1440, height: 900 } },
  });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.locator("#home-closing-index").scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const link = page.getByRole("link", { name: /^educating$/i }).first();
  const box = await link.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(700);
    await page.mouse.move(40, 40);
    await page.waitForTimeout(500);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(400);
    await page.mouse.move(40, 40);
    await page.waitForTimeout(700);
  }
  await ctx.close();
  const raw = await page.video()?.path();
  const out = path.join(video, "11-splash-hover-in-out-1440.webm");
  if (raw) {
    const { rename } = await import("node:fs/promises");
    await rename(raw, out).catch(() => {});
  }
  return out;
}

async function footerShot(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.locator(".home-footer").scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const out = path.join(shots, "11-footer-no-email-icon-1440.png");
  const box = await page.locator(".home-footer__layout").boundingBox();
  if (box) {
    await page.screenshot({
      path: out,
      clip: { x: box.x, y: box.y, width: box.width, height: box.height },
    });
  } else {
    await page.screenshot({ path: out });
  }
  const hasMailIcon = await page.locator(".home-footer__mail-icon").count();
  return { out, hasMailIcon };
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
    overscroll1440: await recordOverscroll(browser, 1440, 900, "11-overscroll-framed-1440.webm"),
    overscroll390: await recordOverscroll(browser, 390, 844, "11-overscroll-framed-390.webm"),
    splashHover: await recordSplashHover(browser),
  };
  const page = await browser.newPage();
  report.footer = await footerShot(page);
  await browser.close();
  const reportPath = path.join(proof, "11-krish-latest-report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.footer.hasMailIcon > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
