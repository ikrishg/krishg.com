import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.PREVIEW_URL ?? "http://127.0.0.1:4321";
const artifactRoot =
  process.env.ARTIFACT_DIR ?? "/opt/cursor/artifacts/krishg-polish";
const proofDir = path.join(artifactRoot, "proof");
const videoDir = path.join(proofDir, "video");
const logDir = path.join(proofDir, "logs");

async function ensureDirs() {
  await mkdir(videoDir, { recursive: true });
  await mkdir(logDir, { recursive: true });
}

async function scrollWholePageWithWheel(page, maxMs = 14000) {
  const start = Date.now();
  await page.mouse.move(720, 450);
  while (Date.now() - start < maxMs) {
    const atBottom = await page.evaluate(
      () =>
        window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 4,
    );
    if (atBottom) break;
    await page.mouse.wheel(0, 72);
    await page.waitForTimeout(48);
  }
}

async function recordScrollPass(browser, width, height, fileName) {
  const context = await browser.newContext({
    recordVideo: { dir: videoDir, size: { width, height } },
  });
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await scrollWholePageWithWheel(page);
  await page.waitForTimeout(600);
  await context.close();
  const raw = await page.video()?.path();
  const out = path.join(videoDir, fileName);
  if (raw) {
    const { rename } = await import("node:fs/promises");
    await rename(raw, out).catch(() => {});
  }
  return out;
}

async function flickNoSnapBack(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.evaluate(() => window.scrollTo(0, 1800));
  await page.waitForTimeout(600);

  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 420);
  await page.waitForTimeout(120);
  const mid = await page.evaluate(() => window.scrollY);
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => window.scrollY);

  const snapBack =
    Math.abs(after - mid) > 80 &&
    Math.abs(after - before) < Math.abs(mid - before) * 0.5;

  return {
    before,
    mid,
    after,
    snapBack,
    pass: !snapBack && after >= mid - 40,
  };
}

async function measureScrollPerf(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

  const cls = await page.evaluate(() => {
    return new Promise((resolve) => {
      let score = 0;
      const po = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) score += entry.value;
        }
      });
      po.observe({ type: "layout-shift", buffered: true });
      const frames = [];
      let last = performance.now();
      let count = 0;
      const sample = (now) => {
        frames.push(now - last);
        last = now;
        count += 1;
        if (count < 90) {
          requestAnimationFrame(sample);
        } else {
          po.disconnect();
          const sorted = frames.slice(1).sort((a, b) => a - b);
          const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
          resolve({ layoutShiftSum: score, frameP50Ms: p50 });
        }
      };
      requestAnimationFrame(sample);
      const scrollHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      let y = 0;
      const tick = () => {
        y += scrollHeight / 45;
        window.scrollTo(0, y);
        if (y < scrollHeight) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  });

  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(2500);

  const idleR3f = await page.evaluate(() => {
    const samples = [];
    return new Promise((resolve) => {
      let i = 0;
      const tick = () => {
        samples.push(window.__KRISH_R3F_FLUSH ?? 0);
        i += 1;
        if (i < 30) requestAnimationFrame(tick);
        else resolve({ samples, max: Math.max(...samples), sum: samples.reduce((a, b) => a + b, 0) });
      };
      requestAnimationFrame(tick);
    });
  });

  return { cls, idleR3f };
}

async function main() {
  await ensureDirs();
  const report = { items: {} };

  const browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });

  const page = await browser.newPage();
  report.items.scrollVideos = {
    desktop: await recordScrollPass(browser, 1440, 900, "10-scroll-home-1440.webm"),
    mobile: await recordScrollPass(browser, 390, 844, "10-scroll-home-390.webm"),
  };

  report.items.flick = await flickNoSnapBack(page);
  report.items.perf = await measureScrollPerf(page);

  const logFile = path.join(logDir, "10-scroll-proof.json");
  await writeFile(logFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await browser.close();

  const frameOk =
    report.items.perf.cls.frameP50Ms >= 12 &&
    report.items.perf.cls.frameP50Ms <= 22;
  report.items.perf.frameOk = frameOk;

  const failed =
    report.items.flick.pass === false ||
    report.items.perf.cls.layoutShiftSum > 0.01 ||
    report.items.perf.idleR3f.sum > 0 ||
    !frameOk;
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
