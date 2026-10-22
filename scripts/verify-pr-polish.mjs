import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const baseUrl = process.env.PREVIEW_URL ?? "http://127.0.0.1:4321";
const artifactRoot =
  process.env.ARTIFACT_DIR ?? "/opt/cursor/artifacts/krishg-polish";
const screenshotDir = path.join(artifactRoot, "screenshots");
const videoDir = path.join(artifactRoot, "video");

const widths = [1440, 1024, 768, 390];

async function ensureDirs() {
  await mkdir(screenshotDir, { recursive: true });
  await mkdir(videoDir, { recursive: true });
}

async function scrollToClosing(page) {
  await page.evaluate(() => {
    document.getElementById("home-closing-index")?.scrollIntoView({
      block: "center",
    });
  });
  await page.waitForTimeout(600);
}

async function captureSplashBlobProof(page) {
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await scrollToClosing(page);

  const educating = page.getByRole("link", { name: /^educating$/i }).first();
  await educating.waitFor({ state: "visible" });

  const box = await educating.boundingBox();
  if (!box) throw new Error("educating link box missing");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(700);
  await page.mouse.move(40, 40);
  await page.waitForTimeout(400);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);

  const diagnostics = await page.evaluate(() => {
    const organic = document.querySelector(".home-splash-organic");
    const overlay = document.querySelector(".home-splash-overlay");
    const organicVisible =
      organic &&
      getComputedStyle(organic).opacity !== "0" &&
      organic.getBoundingClientRect().width > 24;
    return {
      mask: document.documentElement.dataset.homeSplashMask ?? "circle",
      organicInDom: Boolean(organic),
      organicVisible: Boolean(organicVisible),
      overlayOpacity: overlay ? getComputedStyle(overlay).opacity : null,
    };
  });

  const shotPath = path.join(
    screenshotDir,
    "splash-rehover-no-blob-1024x600.png",
  );
  await page.screenshot({ path: shotPath, fullPage: false });

  const pass =
    diagnostics.mask === "circle" &&
    !diagnostics.organicInDom &&
    !diagnostics.organicVisible;

  return { pass, shotPath, diagnostics };
}

async function captureSet(page, width) {
  await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

  await page.screenshot({
    path: path.join(screenshotDir, `home-${width}.png`),
    fullPage: false,
  });

  await scrollToClosing(page);
  await page.screenshot({
    path: path.join(screenshotDir, `closing-${width}.png`),
  });

  const builder = page.locator("#builder");
  await builder.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(screenshotDir, `builder-artifact-${width}.png`),
  });
}

async function recordCursors(browser) {
  const out = path.join(videoDir, "drifting-cursors.webm");
  const context = await browser.newContext({
    recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await scrollToClosing(page);
  await page.waitForTimeout(2500);
  await context.close();
  const video = await page.video()?.path();
  if (video) {
    const { rename } = await import("node:fs/promises");
    await rename(video, out).catch(() => {});
  }
  return out;
}

async function recordSplash(browser) {
  const out = path.join(videoDir, "splash-rehover.webm");
  const context = await browser.newContext({
    recordVideo: { dir: videoDir, size: { width: 1024, height: 768 } },
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await scrollToClosing(page);
  const creating = page.getByRole("link", { name: /^creating$/i }).first();
  const educating = page.getByRole("link", { name: /^educating$/i }).first();
  const box1 = await creating.boundingBox();
  const box2 = await educating.boundingBox();
  if (box1 && box2) {
    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2);
    await page.waitForTimeout(400);
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
    await page.waitForTimeout(400);
    await page.mouse.move(30, 30);
    await page.waitForTimeout(300);
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
    await page.waitForTimeout(500);
  }
  await context.close();
  const video = await page.video()?.path();
  if (video) {
    const { rename } = await import("node:fs/promises");
    await rename(video, out).catch(() => {});
  }
  return out;
}

async function grepInstagram(page) {
  const html = await page.content();
  return /instagram/i.test(html);
}

async function main() {
  await ensureDirs();
  const results = [];

  let preview;
  if (!process.env.PREVIEW_URL) {
    preview = spawn("pnpm", ["preview", "--host", "127.0.0.1", "--port", "4321"], {
      cwd: process.cwd(),
      stdio: "pipe",
    });
    await new Promise((r) => setTimeout(r, 2500));
  }

  const browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    const splashProof = await captureSplashBlobProof(page);
    results.push({
      check: "Splash re-hover no organic blob (1024×600)",
      pass: splashProof.pass,
      path: splashProof.shotPath,
      detail: splashProof.diagnostics,
    });

    for (const width of widths) {
      await captureSet(page, width);
      results.push({
        check: `Responsive captures @${width}`,
        pass: true,
        path: path.join(screenshotDir, `home-${width}.png`),
      });
    }

    const hasIg = await grepInstagram(page);
    results.push({
      check: "No Instagram in DOM",
      pass: !hasIg,
      path: null,
    });

    await context.close();

    const cursorVideo = await recordCursors(browser);
    results.push({
      check: "Drifting cursors recording",
      pass: true,
      path: cursorVideo,
    });

    const splashVideo = await recordSplash(browser);
    results.push({
      check: "Splash re-hover recording",
      pass: true,
      path: splashVideo,
    });
  } finally {
    await browser.close();
    preview?.kill("SIGTERM");
  }

  const reportPath = path.join(artifactRoot, "verify-report.json");
  await writeFile(reportPath, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.pass);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
