#!/usr/bin/env node
import { chromium, devices } from "playwright";
import { mkdir, readdir, rename } from "node:fs/promises";
import path from "node:path";

const preview = process.env.PREVIEW_URL ?? "http://localhost:4321";
const outDir =
  process.env.VIDEO_DIR ?? path.join(process.cwd(), "artifacts/creating-verify");

await mkdir(outDir, { recursive: true });

const consoleErrors = [];

async function runViewport({ name, width, height, touch }) {
  const videoDir = path.join(outDir, `_video-${name}`);
  await mkdir(videoDir, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width, height },
    ...(touch ? { ...devices["iPhone 12 Pro"], viewport: { width, height } } : {}),
    recordVideo: { dir: videoDir, size: { width, height } },
  });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  const url = `${preview.replace(/\/$/, "")}/creating`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForSelector(".creating-surface", { timeout: 30_000 });
  await page.waitForTimeout(1200);

  const clickBtn = async (label) => {
    const btn = page.getByRole("button", { name: label });
    await btn.click();
    await page.waitForTimeout(900);
  };

  await clickBtn(/^Poetry$/i);
  await clickBtn(/^All$/i);
  await clickBtn(/^Listicle$/i);
  await clickBtn(/^Timeline$/i);
  await clickBtn(/^Gallery$/i);

  const card = page.locator(".creating-card__open").first();
  await card.scrollIntoViewIfNeeded();
  if (touch) {
    const box = await card.boundingBox();
    if (box) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  } else {
    await card.click();
  }
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: /close/i }).click();
  await page.waitForTimeout(800);

  for (let i = 0; i < 14; i += 1) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(50);
  }
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  const close2 = page.getByRole("button", { name: /close/i });
  if (await close2.isVisible().catch(() => false)) await close2.click();

  await page.goBack().catch(() => {});
  await page.waitForTimeout(500);

  await page.waitForTimeout(400);
  await context.close();
  await browser.close();

  const webms = (await readdir(videoDir)).filter((f) => f.endsWith(".webm"));
  const dest = path.join(outDir, `creating-walkthrough-${name}.webm`);
  if (webms[0]) await rename(path.join(videoDir, webms[0]), dest);
  return { dest, consoleErrors: [...consoleErrors] };
}

const results = [];
for (const vp of [
  { name: "1440", width: 1440, height: 900, touch: false },
  { name: "390", width: 390, height: 844, touch: true },
]) {
  console.log(`Recording ${vp.name}…`);
  results.push({ viewport: vp.name, ...(await runViewport(vp)) });
}

console.log(JSON.stringify({ preview, results }, null, 2));
process.exit(results.some((r) => r.consoleErrors.length > 0) ? 1 : 0);
