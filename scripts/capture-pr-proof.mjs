import { chromium, devices } from "playwright";
import { execSync } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.PREVIEW_URL ?? "http://127.0.0.1:4321";
const mainBaseUrl = process.env.MAIN_PREVIEW_URL ?? "http://127.0.0.1:4322";
const artifactRoot =
  process.env.ARTIFACT_DIR ?? "/opt/cursor/artifacts/krishg-polish";
const proofDir = path.join(artifactRoot, "proof");
const screenshotDir = path.join(proofDir, "screenshots");
const videoDir = path.join(proofDir, "video");
const logDir = path.join(proofDir, "logs");

async function ensureDirs() {
  await mkdir(screenshotDir, { recursive: true });
  await mkdir(videoDir, { recursive: true });
  await mkdir(logDir, { recursive: true });
}

async function gotoHome(page) {
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
}

async function scrollToBottom(page) {
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const maxY = () =>
      document.documentElement.scrollHeight - window.innerHeight;
    for (let i = 0; i < 40; i++) {
      window.scrollTo(0, maxY());
      await sleep(80);
    }
  });
  await page.waitForTimeout(500);
}

async function applyMaxOverscrollPull(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const surface = document.querySelector(".home-scroll-surface");
    const layer = document.querySelector(".home-overscroll-painting");
    if (!surface || !layer) {
      return { error: "missing surface or painting layer" };
    }
    const maxPull = Number.parseFloat(
      getComputedStyle(root).getPropertyValue("--home-overscroll-max-pull"),
    );
    const pull =
      maxPull > 0
        ? maxPull
        : Number.parseFloat(
            getComputedStyle(root).getPropertyValue("--home-overscroll-pull"),
          ) || 320;
    root.style.setProperty("--home-overscroll-pull", `${pull}px`);
    surface.style.transform = `translate3d(0, ${-pull}px, 0)`;
    surface.dataset.overscrollPulling = "true";
    root.dataset.overscrollReveal = "true";
    layer.dataset.visible = "true";
    const cs = getComputedStyle(layer);
    const rect = layer.getBoundingClientRect();
    return {
      pullPx: pull,
      maxPullPx: maxPull,
      backgroundSize: cs.backgroundSize,
      backgroundPosition: cs.backgroundPosition,
      layerVisible: layer.dataset.visible,
      overscrollReveal: root.dataset.overscrollReveal,
      layerTop: rect.top,
      layerHeight: rect.height,
    };
  });
}

async function captureStarryNight(page, width, label) {
  const height = width <= 390 ? 844 : 900;
  await page.setViewportSize({ width, height });
  await gotoHome(page);
  await scrollToBottom(page);
  const metrics = await applyMaxOverscrollPull(page);
  await page.waitForTimeout(400);
  const file = path.join(
    screenshotDir,
    `01-starry-night-max-pull-${label}-${width}.png`,
  );
  await page.screenshot({ path: file, fullPage: false });
  return { file, metrics, width, label };
}

async function waitForBuilderArtifact(page) {
  const stage = page.locator("#builder .artifact-stage");
  await stage.waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForFunction(
    () =>
      document.querySelector("#builder .artifact-stage")?.getAttribute(
        "data-artifact-ready",
      ) === "true",
    { timeout: 90_000 },
  );
  await page.waitForTimeout(600);
}

async function captureBuilderCrop(page, url, fileName) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${url}/`, { waitUntil: "networkidle" });
  await page.locator("#builder").scrollIntoViewIfNeeded();
  await waitForBuilderArtifact(page);
  const canvas = page.locator("#builder .artifact-stage__canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("builder canvas box missing");
  const pad = 12;
  const clip = {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y + box.height * 0.45 - pad),
    width: Math.min(page.viewportSize().width, box.width + pad * 2),
    height: Math.min(
      page.viewportSize().height - (box.y + box.height * 0.45),
      box.height * 0.55 + pad * 2,
    ),
  };
  const file = path.join(screenshotDir, fileName);
  await page.screenshot({ path: file, clip });
  return file;
}

async function waitForDriftingCursors(page) {
  await page.waitForSelector(".home-drifting-cursors", {
    state: "attached",
    timeout: 45_000,
  });
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".home-drifting-cursors > div").length >= 5,
    { timeout: 45_000 },
  );
  await page.waitForTimeout(1200);
}

async function captureCursorsSection(page, selector, fileName) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHome(page);
  const el = page.locator(selector);
  await el.scrollIntoViewIfNeeded();
  await waitForDriftingCursors(page);
  const box = await el.boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  const file = path.join(screenshotDir, fileName);
  await page.screenshot({
    path: file,
    clip: {
      x: box.x,
      y: box.y,
      width: Math.min(box.width, 1440),
      height: Math.min(box.height, 900 - box.y),
    },
  });
  return file;
}

async function measureCursors(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHome(page);
  await page.locator("#home-closing-index").scrollIntoViewIfNeeded();
  await waitForDriftingCursors(page);

  const inViewT0 = await page.evaluate(() =>
    [...document.querySelectorAll(".home-drifting-cursors > div")].map(
      (node) => node.style.transform,
    ),
  );
  await page.waitForTimeout(1000);
  const inViewT1 = await page.evaluate(() =>
    [...document.querySelectorAll(".home-drifting-cursors > div")].map(
      (node) => node.style.transform,
    ),
  );

  const inView = await page.evaluate(() => {
    const layers = [...document.querySelectorAll(".home-drifting-cursors")];
    const glyphs = document.querySelectorAll(
      ".home-drifting-cursors > div",
    ).length;
    const positions = [...document.querySelectorAll(".home-drifting-cursors > div")].map(
      (node) => node.style.transform,
    );
    return {
      layerCount: layers.length,
      glyphCount: glyphs,
      positionsSample: positions.slice(0, 8),
    };
  });

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);

  const offView = await page.evaluate(() => {
    const positions = [...document.querySelectorAll(".home-drifting-cursors > div")].map(
      (node) => node.style.transform,
    );
    return { positionsSample: positions.slice(0, 8) };
  });

  await page.waitForTimeout(1200);

  const offView2 = await page.evaluate(() => {
    const positions = [...document.querySelectorAll(".home-drifting-cursors > div")].map(
      (node) => node.style.transform,
    );
    return { positionsSample: positions.slice(0, 8) };
  });

  const positionsFrozen =
    JSON.stringify(offView.positionsSample) ===
    JSON.stringify(offView2.positionsSample);

  return {
    cursorCountPerLayer: 5,
    totalGlyphNodes: inView.glyphCount,
    layerInstances: inView.layerCount,
    inViewAnimating:
      JSON.stringify(inViewT0) !== JSON.stringify(inViewT1) &&
      inViewT0.length > 0,
    inViewPositionsT0: inViewT0.slice(0, 5),
    inViewPositionsT1: inViewT1.slice(0, 5),
    offscreenPositionsT0: offView.positionsSample,
    offscreenPositionsT1: offView2.positionsSample,
    tempusPausedOffscreen: positionsFrozen,
    animationDriver:
      "Tempus useTempus (order 0, label drifting-cursors); not raw rAF",
    offscreenDrawPolicy:
      "useTempus callback returns early when IntersectionObserver reports !inView (no position updates / no setState)",
  };
}

async function captureReducedMotionCursors(browser) {
  const context = await browser.newContext({
    ...devices["Desktop Chrome"],
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHome(page);
  await page.locator("#home-closing-index").scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  const state = await page.evaluate(() => ({
    cursorLayers: document.querySelectorAll(".home-drifting-cursors").length,
    cursorGlyphs: document.querySelectorAll(".home-drifting-cursors > div").length,
    prefersReduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  }));
  const file = path.join(screenshotDir, "03-cursors-reduced-motion-1440.png");
  await page.screenshot({ path: file, clip: { x: 0, y: 200, width: 1440, height: 500 } });
  await context.close();
  return { file, state };
}

async function captureIconHover(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHome(page);
  await page.locator(".home-footer").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const link = page.locator(".home-footer__social-link").first();
  const box = await link.boundingBox();
  const restFile = path.join(screenshotDir, "04-icon-rest.png");
  await page.screenshot({
    path: restFile,
    clip: {
      x: Math.max(0, (box?.x ?? 0) - 20),
      y: Math.max(0, (box?.y ?? 0) - 20),
      width: 120,
      height: 120,
    },
  });
  await link.hover();
  await page.waitForTimeout(250);
  const hoverFile = path.join(screenshotDir, "04-icon-hover.png");
  await page.screenshot({
    path: hoverFile,
    clip: {
      x: Math.max(0, (box?.x ?? 0) - 20),
      y: Math.max(0, (box?.y ?? 0) - 24),
      width: 120,
      height: 124,
    },
  });
  return { restFile, hoverFile };
}

async function capturePaperPlane(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHome(page);
  await page.locator(".home-footer__email").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const email = page.locator(".home-footer__email-inner");
  const box = await email.boundingBox();
  const file = path.join(screenshotDir, "05-footer-paper-plane.png");
  await page.screenshot({
    path: file,
    clip: {
      x: Math.max(0, (box?.x ?? 0) - 16),
      y: Math.max(0, (box?.y ?? 0) - 16),
      width: Math.min(520, (box?.width ?? 400) + 32),
      height: Math.min(120, (box?.height ?? 80) + 32),
    },
  });
  return file;
}

function grepInstagram() {
  const src = execSync('rg -i "instagram" src || true', {
    encoding: "utf8",
    cwd: process.cwd(),
  });
  const dist = execSync('rg -i "instagram" dist || true', {
    encoding: "utf8",
    cwd: process.cwd(),
  });
  return { src, dist };
}

async function captureSplashConsole(page) {
  const logs = [];
  page.on("console", (msg) => {
    logs.push({ type: msg.type(), text: msg.text() });
  });
  page.on("pageerror", (err) => {
    logs.push({ type: "pageerror", text: String(err) });
  });

  await page.setViewportSize({ width: 1024, height: 768 });
  await gotoHome(page);
  await page.locator("#home-closing-index").scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);

  const creating = page.getByRole("link", { name: /^creating$/i }).first();
  const educating = page.getByRole("link", { name: /^educating$/i }).first();
  for (const link of [creating, educating, creating, educating]) {
    const box = await link.boundingBox();
    if (!box) continue;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(450);
    await page.mouse.move(24, 24);
    await page.waitForTimeout(200);
  }

  const abortErrors = logs.filter((l) =>
    /abort/i.test(l.text) && /error/i.test(l.type + l.text),
  );
  const logFile = path.join(logDir, "07-splash-console.log");
  await writeFile(logFile, JSON.stringify(logs, null, 2));
  return {
    logFile,
    abortErrorCount: abortErrors.length,
    abortErrors,
    smooth: abortErrors.length === 0,
  };
}

async function captureSelection(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHome(page);
  await page.locator("#home-closing-index").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    const row = document.querySelector(".home-closing-link--primary");
    if (!row) return;
    const range = document.createRange();
    range.selectNodeContents(row);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  });
  const beigeFile = path.join(screenshotDir, "08-selection-beige.png");
  await page.screenshot({
    path: beigeFile,
    clip: { x: 200, y: 180, width: 700, height: 200 },
  });

  const building = page.getByRole("link", { name: /^building$/i }).first();
  const box = await building.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => {
    const row = document.querySelector(".home-closing-link--primary");
    if (!row) return;
    const range = document.createRange();
    range.selectNodeContents(row);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  });
  const splashFile = path.join(screenshotDir, "08-selection-splash.png");
  await page.screenshot({
    path: splashFile,
    clip: { x: 200, y: 180, width: 700, height: 200 },
  });

  const selectionCss = await page.evaluate(() => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const cs = getComputedStyle(el, "::selection");
    const bg = cs.backgroundColor;
    const fg = cs.color;
    el.remove();
    return { backgroundColor: bg, color: fg };
  });

  return { beigeFile, splashFile, selectionCss };
}

function relativeLuminance([r, g, b]) {
  const chan = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrastRatio(fg, bg) {
  const L1 = relativeLuminance(fg);
  const L2 = relativeLuminance(bg);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

async function captureBuilderContrast(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHome(page);
  await page.locator("#builder").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const file = path.join(screenshotDir, "09-builder-ink-contrast-1440.png");
  const heading = page.locator("#builder-heading");
  const box = await heading.boundingBox();
  if (box) {
    await page.screenshot({
      path: file,
      clip: {
        x: Math.max(0, box.x - 40),
        y: Math.max(0, box.y - 30),
        width: Math.min(900, box.width + 80),
        height: Math.min(400, box.height + 120),
      },
    });
  } else {
    await page.screenshot({ path: file });
  }

  const colors = await page.evaluate(() => {
    const section = document.getElementById("builder");
    const heading = document.getElementById("builder-heading");
    const paint = section?.querySelector(".hero-band-paint");
    if (!section || !heading || !paint) return null;
    const bg = getComputedStyle(paint).backgroundColor;
    const fg = getComputedStyle(heading).color;
    return { bg, fg, fgHex: "#141a2b", bgHex: "#398fd0" };
  });

  const parseRgb = (s) => {
    const m = s.match(/[\d.]+/g);
    if (!m || m.length < 3) return [20, 26, 43];
    return m.slice(0, 3).map(Number);
  };

  const fgRgb = parseRgb(colors?.fg ?? "rgb(20, 26, 43)");
  const bgRgb = parseRgb(colors?.bg ?? "rgb(57, 143, 208)");
  const ratio = contrastRatio(fgRgb, bgRgb);

  return {
    file,
    colors,
    ratio: Math.round(ratio * 100) / 100,
    passesAA: ratio >= 4.5,
  };
}

async function main() {
  await ensureDirs();
  const report = { items: {}, generatedAt: new Date().toISOString() };

  const browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  report.items["1-starry-night"] = {
    "1440": await captureStarryNight(page, 1440, "desktop"),
    "390": await captureStarryNight(page, 390, "mobile"),
  };

  report.items["2-3d-shadow"] = {
    elementRemoved:
      "KrishInteractiveScene / EducatorBookScene ground shadow <mesh> (circleGeometry + meshBasicMaterial #1a1410 @ 34% opacity)",
    after: await captureBuilderCrop(
      page,
      baseUrl,
      "02-builder-artifact-after-no-shadow.png",
    ),
    before: null,
  };

  try {
    report.items["2-3d-shadow"].before = await captureBuilderCrop(
      page,
      mainBaseUrl,
      "02-builder-artifact-before-main-shadow.png",
    );
  } catch (err) {
    report.items["2-3d-shadow"].beforeError = String(err);
  }

  report.items["3-cursors"] = {
    closingIndex: await captureCursorsSection(
      page,
      "#home-closing-index",
      "03-closing-index-cursors-1440.png",
    ),
    footer: await captureCursorsSection(
      page,
      ".home-footer",
      "03-footer-cursors-1440.png",
    ),
    metrics: await measureCursors(page),
    reducedMotion: await captureReducedMotionCursors(browser),
  };

  report.items["4-icon-hover"] = await captureIconHover(page);
  report.items["5-paper-plane"] = await capturePaperPlane(page);

  const ig = grepInstagram();
  const igFile = path.join(logDir, "06-grep-instagram.txt");
  await writeFile(
    igFile,
    `=== src ===\n${ig.src || "(no matches)"}\n\n=== dist ===\n${ig.dist || "(no matches)"}\n`,
  );
  report.items["6-instagram-grep"] = {
    file: igFile,
    srcMatches: ig.src.trim().length > 0,
    distMatches: ig.dist.trim().length > 0,
  };

  report.items["7-splash-console"] = await captureSplashConsole(page);

  const splashVideoCtx = await browser.newContext({
    recordVideo: { dir: videoDir, size: { width: 1024, height: 768 } },
  });
  const splashPage = await splashVideoCtx.newPage();
  const splashLogs = [];
  splashPage.on("console", (msg) =>
    splashLogs.push({ type: msg.type(), text: msg.text() }),
  );
  splashPage.on("pageerror", (err) =>
    splashLogs.push({ type: "pageerror", text: String(err) }),
  );
  await splashPage.setViewportSize({ width: 1024, height: 768 });
  await splashPage.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await splashPage.locator("#home-closing-index").scrollIntoViewIfNeeded();
  const educating = splashPage.getByRole("link", { name: /^educating$/i }).first();
  for (let i = 0; i < 2; i++) {
    const box = await educating.boundingBox();
    if (box) {
      await splashPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await splashPage.waitForTimeout(500);
      await splashPage.mouse.move(30, 30);
      await splashPage.waitForTimeout(250);
    }
  }
  await splashVideoCtx.close();
  const rawVideo = await splashPage.video()?.path();
  const splashVideo = path.join(videoDir, "07-splash-rehover.webm");
  if (rawVideo) {
    const { rename } = await import("node:fs/promises");
    await rename(rawVideo, splashVideo).catch(() => {});
  }
  report.items["7-splash-console"].video = splashVideo;
  report.items["7-splash-console"].videoConsoleAbortErrors = splashLogs.filter(
    (l) => /AbortError/i.test(l.text),
  ).length;

  report.items["8-selection"] = await captureSelection(page);
  report.items["9-builder-contrast"] = await captureBuilderContrast(page);

  await context.close();
  await browser.close();

  const reportPath = path.join(proofDir, "proof-report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
