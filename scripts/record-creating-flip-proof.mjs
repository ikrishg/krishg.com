#!/usr/bin/env node
import { chromium, devices } from "playwright";
import { mkdir, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const preview = process.env.PREVIEW_URL ?? "http://localhost:4321";
const outDir =
  process.env.VIDEO_DIR ?? path.join(process.cwd(), "artifacts/creating-verify");

await mkdir(outDir, { recursive: true });

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
  const url = preview.includes("/creating")
    ? preview.replace(/\/$/, "")
    : `${preview.replace(/\/$/, "")}/creating`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForSelector(".creating-page", { timeout: 90_000 });
  await page.waitForFunction(
    () => document.querySelectorAll(".creating-card").length > 0,
    { timeout: 90_000 },
  );
  await page.waitForTimeout(1200);

  const click = async (label) => {
    await page.getByRole("button", { name: label }).click();
    await page.waitForTimeout(1300);
  };

  await click(/^Design$/i);
  await click(/^All$/i);
  await click(/^Gallery$/i);
  await click(/^Timeline$/i);

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
  JSON.stringify({ preview, results }, null, 2),
);
console.log(JSON.stringify({ preview, results }, null, 2));
