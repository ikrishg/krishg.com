/**
 * Helm perf proof: WebGL setSize, drift-cursor rAF rates, footer cursor visibility.
 * Usage: PREVIEW_URL=http://127.0.0.1:4321 node scripts/dev/prove-helm-perf.mjs
 */
import { chromium, devices } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4321";
const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "out",
  "screenshots",
);

async function patchSetSize(page) {
  await page.evaluate(() => {
    window.__webglSetSizeCount = 0;
    const patchGl = (gl) => {
      if (!gl?.setSize || gl.__sizePatched) return;
      const orig = gl.setSize.bind(gl);
      gl.setSize = (...args) => {
        window.__webglSetSizeCount += 1;
        return orig(...args);
      };
      gl.__sizePatched = true;
    };
    for (const canvas of document.querySelectorAll(".artifact-stage canvas")) {
      const store = canvas.__r3f;
      if (store?.getState) patchGl(store.getState().gl);
    }
  });
}

async function scrollHomeFor(page, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(40);
  }
}

async function measureDesktopScroll() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "1";
  });
  await patchSetSize(page);
  await page.evaluate(() => {
    window.__webglSetSizeCount = 0;
  });
  await scrollHomeFor(page, 4000);
  const setSizeCalls = await page.evaluate(() => window.__webglSetSizeCount ?? 0);
  await context.close();
  await browser.close();
  return setSizeCalls;
}

async function measureDriftRaf({ touch, reducedMotion, offscreen }) {
  const browser = await chromium.launch();
  const context = await browser.newContext(
    touch
      ? { ...devices["iPhone 13"], hasTouch: true }
      : { viewport: { width: 1440, height: 900 } },
  );
  const page = await context.newPage();
  if (reducedMotion) {
    await page.emulateMedia({ reducedMotion: "reduce" });
  }
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "1";
    window.__driftCursorRafFrames = 0;
  });
  if (offscreen) {
    await page.evaluate(() => window.scrollTo(0, 0));
  } else {
    await page.evaluate(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, max);
    });
  }
  await page.waitForTimeout(1800);
  const before = await page.evaluate(() => window.__driftCursorRafFrames ?? 0);
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => window.__driftCursorRafFrames ?? 0);
  const stats = await page.evaluate(() => {
    const root = document.querySelector(".home-drifting-cursors");
    return {
      mounted: Boolean(root),
      cursorChildren: root?.children.length ?? 0,
    };
  });
  await context.close();
  await browser.close();
  return {
    framesPerSecond: after - before,
    ...stats,
  };
}

async function captureCursors1440() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "1";
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, max);
  });
  await page.waitForTimeout(2200);
  const file = path.join(OUT, "drifting-cursors-1440.png");
  await page.screenshot({ path: file, fullPage: false });
  const visible = await page.evaluate(() => {
    const root = document.querySelector(".home-drifting-cursors");
    return (root?.children.length ?? 0) >= 3;
  });
  await context.close();
  await browser.close();
  return { screenshot: file, cursorsVisible: visible };
}

async function main() {
  const setSizeCalls = await measureDesktopScroll();
  const inView = await measureDriftRaf({
    touch: false,
    reducedMotion: false,
    offscreen: false,
  });
  const offscreen = await measureDriftRaf({
    touch: false,
    reducedMotion: false,
    offscreen: true,
  });
  const touch = await measureDriftRaf({
    touch: true,
    reducedMotion: false,
    offscreen: false,
  });
  const reduced = await measureDriftRaf({
    touch: false,
    reducedMotion: true,
    offscreen: false,
  });
  const capture = await captureCursors1440();

  const summary = {
    preview: BASE,
    webglSetSizeDuring4sScroll: setSizeCalls,
    driftRafInViewDesktop: inView,
    driftRafOffscreen: offscreen,
    driftRafTouch: touch,
    driftRafReducedMotion: reduced,
    cursorsCapture1440: capture,
    pass:
      setSizeCalls === 0 &&
      inView.framesPerSecond >= 45 &&
      inView.cursorChildren >= 3 &&
      offscreen.framesPerSecond === 0 &&
      touch.framesPerSecond === 0 &&
      reduced.framesPerSecond === 0 &&
      touch.cursorChildren === 0 &&
      reduced.cursorChildren === 0 &&
      capture.cursorsVisible,
    helmBaseline4255ac2: {
      webglSetSizeDuring4sScroll: "20-25",
      driftInView: "~60/s",
    },
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
