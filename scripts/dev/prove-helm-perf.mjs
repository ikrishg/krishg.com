/**
 * Helm perf proof: 0 WebGL setSize during scroll; 0 drift-cursor rAF offscreen/touch/reduce.
 * Usage: PREVIEW_URL=http://127.0.0.1:4321 node scripts/dev/prove-helm-perf.mjs
 */
import { chromium, devices } from "playwright";

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4321";

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
  await page.waitForTimeout(2000);
  const frames = await page.evaluate(() => window.__driftCursorRafFrames ?? 0);
  const mounted = await page.evaluate(
    () => document.querySelector(".home-drifting-cursors") != null,
  );
  await context.close();
  await browser.close();
  return { frames, mounted };
}

async function main() {
  const setSizeCalls = await measureDesktopScroll();
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

  const summary = {
    preview: BASE,
    webglSetSizeDuring4sScroll: setSizeCalls,
    driftRafOffscreen: offscreen,
    driftRafTouch: touch,
    driftRafReducedMotion: reduced,
    pass:
      setSizeCalls === 0 &&
      offscreen.frames === 0 &&
      touch.frames === 0 &&
      reduced.frames === 0 &&
      !touch.mounted &&
      !reduced.mounted,
    helmBaseline4255ac2: {
      webglSetSizeDuring4sScroll: "20-25",
      styleRecalcsPerSecond: "41-55 (main 15-25)",
    },
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
