#!/usr/bin/env node
import { chromium, devices } from "playwright";
import { mkdir, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const preview = process.env.PREVIEW_URL ?? "http://localhost:4321";
const outDir =
  process.env.VIDEO_DIR ?? path.join(process.cwd(), "artifacts/creating-verify");

await mkdir(outDir, { recursive: true });
const framesDir = path.join(outDir, "flip-frames");
await mkdir(framesDir, { recursive: true });

async function recordViewport({ name, width, height, touch }) {
  const videoDir = path.join(outDir, `_flip-video-${name}`);
  await mkdir(videoDir, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width, height },
    ...(touch ? { ...devices["iPhone 12 Pro"], viewport: { width, height } } : {}),
    recordVideo: { dir: videoDir, size: { width, height } },
  });
  const page = await context.newPage();
  const url = `${preview.replace(/\/$/, "")}/creating`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForSelector(".creating-surface", { timeout: 30_000 });
  await page.waitForTimeout(800);

  const click = async (label) => {
    await page.getByRole("button", { name: label }).click();
    await page.waitForTimeout(1100);
  };

  await click(/^Poetry$/i);
  await page.screenshot({
    path: path.join(framesDir, `${name}-after-poetry.png`),
  });
  await click(/^Photography$/i);
  await click(/^Design$/i);
  await click(/^All$/i);
  await click(/^Listicle$/i);
  await page.screenshot({
    path: path.join(framesDir, `${name}-view-listicle-mid.png`),
  });
  await click(/^Timeline$/i);
  await click(/^Gallery$/i);

  await page.waitForTimeout(600);
  await context.close();
  await browser.close();

  const webms = (await readdir(videoDir)).filter((f) => f.endsWith(".webm"));
  const dest = path.join(outDir, `creating-flip-proof-${name}.webm`);
  if (webms[0]) await rename(path.join(videoDir, webms[0]), dest);
  return dest;
}

const results = [];
for (const spec of [
  { name: "1440", width: 1440, height: 900, touch: false },
  { name: "390", width: 390, height: 844, touch: true },
]) {
  results.push({
    viewport: spec.name,
    webm: await recordViewport(spec),
  });
}

await writeFile(
  path.join(outDir, "flip-proof.json"),
  JSON.stringify({ results, framesDir }, null, 2),
);
console.log(JSON.stringify({ results, framesDir }, null, 2));
