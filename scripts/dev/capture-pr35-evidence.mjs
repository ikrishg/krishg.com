import { chromium, devices } from "playwright";
import { copyFile, mkdir, rename, readdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const baseUrl =
  process.env.PREVIEW_URL ??
  "https://krishg-hkgvriik0-sineveritas.vercel.app/?_vercel_share=1UKgJuTqgZsiSalkHrwYcIWHN5v2WCAh";
const outDir =
  process.env.SCREENSHOT_DIR ?? "/opt/cursor/artifacts/screenshots";
const videoDir = process.env.VIDEO_DIR ?? "/opt/cursor/artifacts";

await mkdir(outDir, { recursive: true });
await mkdir(videoDir, { recursive: true });

async function md5(filePath) {
  const buf = await readFile(filePath);
  return createHash("md5").update(buf).digest("hex");
}

async function skipIntro(page) {
  await page.addInitScript(() => {
    document.documentElement.dataset.introSkip = "true";
  });
}

async function scrollToDocumentBottom(page) {
  await page.evaluate(async () => {
    document.documentElement.dataset.introSkip = "true";
    const maxY = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: maxY, left: 0, behavior: "instant" });
    for (let i = 0; i < 24; i += 1) {
      const y = document.documentElement.scrollHeight - window.innerHeight;
      if (Math.abs(window.scrollY - y) < 2) break;
      window.scrollTo(0, y);
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  await page.waitForTimeout(350);
}

async function scrollToClosingIndex(page) {
  await page.evaluate(async () => {
    document.documentElement.dataset.introSkip = "true";
    const section = document.querySelector("#home-closing-index");
    const nav = document.querySelector(".home-navbar");
    if (!section || !nav) return;
    const navBottom = nav.getBoundingClientRect().bottom;
    for (let i = 0; i < 48; i += 1) {
      const top = section.getBoundingClientRect().top;
      const delta = top - navBottom;
      if (Math.abs(delta) < 3) break;
      window.scrollBy(0, delta);
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  await page.waitForTimeout(300);
}

async function waitForStarryLoaded(page) {
  await page.waitForSelector('.home-overscroll-painting[data-loaded="true"]', {
    timeout: 90_000,
  });
}

/** Keep overscroll pull alive: reset fires 120ms after the last wheel tick. */
async function wheelPullHold(page, { ticks = 48, deltaY = 85, stepMs = 18 } = {}) {
  const vp = page.viewportSize();
  const x = vp.width / 2;
  const y = vp.height - 72;
  await page.mouse.move(x, y);
  for (let i = 0; i < ticks; i += 1) {
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(stepMs);
  }
  await page.mouse.wheel(0, deltaY);
}

async function touchPullHold(page, { steps = 28, stepPx = 14 } = {}) {
  const vp = page.viewportSize();
  const x = vp.width / 2;
  const y0 = vp.height - 48;
  await page.evaluate(
    async ({ x, y0, steps, stepPx }) => {
      const target = document.elementFromPoint(x, y0) ?? document.body;
      const touch = (cy) =>
        new Touch({
          identifier: 1,
          target,
          clientX: x,
          clientY: cy,
          pageX: x,
          pageY: cy,
        });
      window.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          cancelable: true,
          touches: [touch(y0)],
        }),
      );
      for (let i = 1; i <= steps; i += 1) {
        const cy = y0 - stepPx * i;
        window.dispatchEvent(
          new TouchEvent("touchmove", {
            bubbles: true,
            cancelable: true,
            touches: [touch(cy)],
          }),
        );
        await new Promise((r) => setTimeout(r, 16));
      }
    },
    { x, y0, steps, stepPx },
  );
}

async function readPullMetrics(page) {
  return page.evaluate(() => {
    const pull = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--home-overscroll-pull",
      ) || "0",
    );
    const painting = document.querySelector(".home-overscroll-painting");
    const bgSize = painting
      ? getComputedStyle(painting).backgroundSize
      : "";
    const bgImage = painting
      ? getComputedStyle(painting).backgroundImage
      : "";
    return {
      pull,
      reveal: document.documentElement.dataset.overscrollReveal === "true",
      paintingVisible: painting?.dataset.visible === "true",
      atBottom:
        window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 3,
      bgSize,
      hasArt: bgImage.includes("starry-night"),
      transform:
        document.querySelector(".home-scroll-surface")?.style.transform ?? "",
    };
  });
}

async function captureStarry(page, label, input) {
  await scrollToDocumentBottom(page);
  await waitForStarryLoaded(page);
  if (input === "wheel") {
    await wheelPullHold(page);
  } else {
    await touchPullHold(page);
  }
  const metrics = await readPullMetrics(page);
  const file = path.join(outDir, `homepage-starry-full-${label}-${input}.png`);
  await page.screenshot({ path: file, animations: "disabled" });
  console.log(JSON.stringify({ file, metrics }, null, 2));
  if (metrics.pull < 80 || !metrics.paintingVisible) {
    throw new Error(`Starry capture failed for ${label}/${input}: ${JSON.stringify(metrics)}`);
  }
  return file;
}

async function activateSplash(page, key) {
  await page.evaluate((splashKey) => {
    const link = document.querySelector(
      `#home-closing-index [data-splash-key="${splashKey}"]`,
    );
    if (!link) throw new Error(`missing link ${splashKey}`);
    const rect = link.getBoundingClientRect();
    window.dispatchEvent(
      new CustomEvent("home-splash:activate", {
        detail: {
          key: splashKey,
          origin: {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          },
        },
      }),
    );
    window.dispatchEvent(new CustomEvent("home-splash:cancel-clear"));
  }, key);
}

async function captureSplashSequence(page, maskLabel) {
  await scrollToClosingIndex(page);

  const prefix = `homepage-splash-${maskLabel}`;
  const SHRINK_WAIT = 560;

  async function splashFrameAt(ms, fileName) {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("home-splash:immediate-clear"));
    });
    await page.waitForTimeout(SHRINK_WAIT);
    await activateSplash(page, "building");
    await page.waitForTimeout(ms);
    await page.evaluate(() => {
      document.getAnimations().forEach((anim) => {
        anim.pause();
      });
    });
    const file = path.join(outDir, fileName);
    await page.screenshot({ path: file, animations: "allow" });
    console.log(`Wrote ${file}`);
  }

  await splashFrameAt(100, `${prefix}-building-100ms.png`);
  await splashFrameAt(300, `${prefix}-building-300ms.png`);
  await splashFrameAt(620, `${prefix}-building-620ms.png`);

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("home-splash:immediate-clear"));
  });
  await page.waitForTimeout(120);
  await activateSplash(page, "building");
  await page.waitForTimeout(220);
  await activateSplash(page, "creating");
  await page.waitForTimeout(180);
  const retarget = path.join(outDir, `${prefix}-retarget-creating-midgrow.png`);
  await page.screenshot({ path: retarget, animations: "allow" });
  console.log(`Wrote ${retarget}`);

  await page.mouse.move(8, 8);
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("home-splash:schedule-clear"));
  });
  await page.waitForTimeout(280);
  const leave = path.join(outDir, `${prefix}-mouse-leave.png`);
  await page.screenshot({ path: leave, animations: "allow" });
  console.log(`Wrote ${leave}`);
}

const browser = await chromium.launch();

for (const { width, height, label } of [
  { width: 1440, height: 900, label: "1440" },
  { width: 390, height: 844, label: "390" },
]) {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: label === "390",
    isMobile: label === "390",
    userAgent: label === "390" ? devices["Pixel 5"].userAgent : undefined,
  });
  const page = await context.newPage();
  await skipIntro(page);
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await captureStarry(page, label, "wheel");
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await captureStarry(page, label, "touch");
  await context.close();
}

const desktop = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } },
});
const splashPage = await desktop.newPage();
await skipIntro(splashPage);
await splashPage.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
await captureSplashSequence(splashPage, "circle");

await splashPage.goto(
  `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}splashMask=organic`,
  { waitUntil: "networkidle", timeout: 120_000 },
);
await scrollToClosingIndex(splashPage);
await activateSplash(splashPage, "building");
await activateSplash(splashPage, "building");
await splashPage.waitForTimeout(300);
await splashPage.screenshot({
  path: path.join(outDir, "homepage-splash-organic-building-300ms.png"),
  animations: "allow",
});
await activateSplash(splashPage, "building");
await splashPage.waitForTimeout(300);
await splashPage.screenshot({
  path: path.join(outDir, "homepage-splash-circle-building-300ms-compare.png"),
  animations: "allow",
});

const keys = [
  "building",
  "creating",
  "educating",
  "about",
  "now",
  "sitemap",
];
for (const key of keys) {
  const link = splashPage.locator(`#home-closing-index [data-splash-key="${key}"]`).first();
  await link.hover({ force: true });
  await splashPage.waitForTimeout(650);
}

await desktop.close();
const videos = (await readdir(videoDir)).filter((f) => f.endsWith(".webm"));
if (videos.length) {
  const latest = videos.sort().at(-1);
  await rename(
    path.join(videoDir, latest),
    path.join(videoDir, "homepage-splash-hover-six-links.webm"),
  );
  console.log(`Wrote ${path.join(videoDir, "homepage-splash-hover-six-links.webm")}`);
}

await browser.close();

const mid = path.join(outDir, "homepage-splash-circle-building-300ms.png");
const full = path.join(outDir, "homepage-splash-circle-building-620ms.png");
if ((await md5(mid)) === (await md5(full))) {
  console.warn("WARNING: 300ms and 620ms splash frames are still identical");
}

await copyFile(
  path.join(outDir, "homepage-starry-full-1440-wheel.png"),
  path.join(outDir, "homepage-starry-full-1440.png"),
);
await copyFile(
  path.join(outDir, "homepage-starry-full-390-wheel.png"),
  path.join(outDir, "homepage-starry-full-390.png"),
);
console.log("Canonical starry copies written (wheel pull).");
