#!/usr/bin/env node
/**
 * Headed walkthrough recordings for /creating (1440×900 + 390×844 touch).
 * Requires PREVIEW_URL (default http://localhost:4321) and a display (xvfb-run).
 */
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
  consoleErrors.length = 0;

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

  const enter = page.getByRole("button", { name: "Enter" });
  await enter.waitFor({ state: "visible", timeout: 60_000 });
  await enter.click();
  await page.getByRole("button", { name: /^Gallery$/i }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);

  const canvas = page.locator(".creating-canvas-wrap canvas");
  await canvas.waitFor({ state: "visible" });
  const box = await canvas.boundingBox();
  if (!box) throw new Error("no canvas box");

  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.5;

  if (touch) {
    await page.touchscreen.tap(cx, cy);
    for (let i = 0; i < 6; i += 1) {
      await page.touchscreen.tap(box.x + box.width * 0.35, box.y + box.height * 0.55);
      await page.waitForTimeout(120);
    }
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 80, cy, { steps: 12 });
    await page.mouse.up();
  } else {
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(400);
    await page.mouse.down();
    await page.mouse.move(cx - 120, cy, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(400);
  }

  const pick = await page.evaluate(() => {
    const v = window.__creatingVerify?.();
    const tiles = v?.projectedTiles ?? [];
    const t = tiles[3] ?? tiles[0];
    if (!t) return null;
    return { x: t.x, y: t.y };
  });
  if (pick) {
    if (touch) {
      await page.touchscreen.tap(pick.x, pick.y);
    } else {
      await page.mouse.click(pick.x, pick.y);
    }
    await page.waitForTimeout(1200);
    const close = page.getByRole("button", { name: /close/i });
    if (await close.isVisible().catch(() => false)) {
      await close.click();
      await page.waitForTimeout(800);
    }
  }

  await page.getByRole("button", { name: /^Poetry$/i }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /^All$/i }).click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /^Listicle$/i }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /^Timeline$/i }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /^Gallery$/i }).click();
  await page.waitForTimeout(800);

  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(60);
  }
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1000);
  const close2 = page.getByRole("button", { name: /close/i });
  if (await close2.isVisible().catch(() => false)) {
    await close2.click();
  }

  await page.waitForTimeout(500);
  await context.close();
  await browser.close();

  const webms = (await readdir(videoDir)).filter((f) => f.endsWith(".webm"));
  const dest = path.join(outDir, `creating-walkthrough-${name}.webm`);
  if (webms[0]) {
    await rename(path.join(videoDir, webms[0]), dest);
  }
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
const anyErr = results.some((r) => r.consoleErrors.length > 0);
process.exit(anyErr ? 1 : 0);
