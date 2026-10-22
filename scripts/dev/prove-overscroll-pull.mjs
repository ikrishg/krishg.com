/**
 * Desole proof: no yellow seam during pull, stable touch release at 390.
 * Usage: PREVIEW_URL=http://127.0.0.1:4321 node scripts/dev/prove-overscroll-pull.mjs
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4321";

const DEV_ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT =
  process.env.SCREENSHOT_DIR ||
  path.join(DEV_ROOT, "out", "screenshots");
const VIEWPORTS = [
  { width: 1440, height: 900, label: "1440" },
  { width: 1024, height: 776, label: "1024" },
  { width: 820, height: 1180, label: "820" },
  { width: 768, height: 1024, label: "768" },
  { width: 390, height: 844, label: "390" },
];

async function scrollToBottom(page) {
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "1";
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, max);
  });
  await page.waitForTimeout(400);
}

async function cdpTouchSwipe(page, { startX, startY, endY, holdBeforeEndMs = 0 }) {
  const client = await page.context().newCDPSession(page);
  const step = async (type, y) => {
    await client.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x: startX, y }],
    });
  };
  await step("touchStart", startY);
  for (let i = 1; i <= 14; i += 1) {
    const y = startY + ((endY - startY) * i) / 14;
    await step("touchMove", y);
    await page.waitForTimeout(16);
  }
  if (holdBeforeEndMs > 0) {
    await page.waitForTimeout(holdBeforeEndMs);
  }
  await step("touchEnd", endY);
}

async function readPullState(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const pull =
      parseFloat(
        getComputedStyle(root).getPropertyValue("--home-overscroll-pull"),
      ) || 0;
    const educatorPaint = document.querySelector("#educator .hero-band-paint");
    const educatorScale = educatorPaint
      ? getComputedStyle(educatorPaint).transform
      : "";
    const pulling =
      root.dataset.overscrollPulling === "true" ||
      root.dataset.overscrollReveal === "true";
    const footer = document.querySelector(".home-footer");
    const seamOk = (() => {
      if (!footer || pull < 20) return false;
      const rect = footer.getBoundingClientRect();
      const y = Math.max(0, Math.floor(rect.top) - 3);
      const x = Math.floor(rect.left + rect.width / 2);
      const hit = document.elementFromPoint(x, y);
      if (!hit) return true;
      const band = hit.closest("[data-home-scroll-band]");
      if (!band || band.id === "educator") return true;
      const bg = getComputedStyle(hit).backgroundColor;
      return !bg.includes("216, 161, 42") && !bg.includes("d8a12a");
    })();
    return {
      ok: pull > 20 && pulling && seamOk,
      pullPx: pull,
      educatorTransform: educatorScale,
      seamOk,
      pulling,
    };
  });
}

async function capturePullFrame(page, vp, outDir) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await scrollToBottom(page);
  const cx = Math.round(vp.width / 2);
  const client = await page.context().newCDPSession(page);
  const startY = Math.round(vp.height * 0.72);
  const endY = Math.round(vp.height * 0.18);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: cx, y: startY }],
  });
  for (let i = 1; i <= 14; i += 1) {
    const y = startY + ((endY - startY) * i) / 14;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: cx, y }],
    });
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(80);
  const stripe = await readPullState(page);
  const file = path.join(outDir, `overscroll-pull-${vp.label}.png`);
  await page.screenshot({ path: file, fullPage: false });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  return { viewport: vp.label, stripe, screenshot: file };
}

async function touchReleaseTrace(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await scrollToBottom(page);
  const samples = [];
  await page.exposeFunction("recordPull", (pull) => {
    samples.push(pull);
  });
  const cx = 195;
  const client = await page.context().newCDPSession(page);
  const startY = 590;
  const endY = 110;
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: cx, y: startY }],
  });
  for (let i = 1; i <= 14; i += 1) {
    const y = startY + ((endY - startY) * i) / 14;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: cx, y }],
    });
    await page.waitForTimeout(16);
  }
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.evaluate(() => {
    const root = document.documentElement;
    let last = -1;
    const until = performance.now() + 1400;
    const tick = () => {
      if (performance.now() > until) return;
      const pull =
        parseFloat(
          getComputedStyle(root).getPropertyValue("--home-overscroll-pull"),
        ) || 0;
      if (Math.abs(pull - last) > 0.4) {
        last = pull;
        window.recordPull(Math.round(pull * 10) / 10);
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
  await page.waitForTimeout(1500);
  const reopen = [];
  let peak = 0;
  let seenZero = false;
  for (const v of samples) {
    peak = Math.max(peak, v);
    if (v < 1) seenZero = true;
    if (seenZero && v > 8) reopen.push(v);
  }
  return {
    peakPull: peak,
    reopenAfterSettle: reopen,
    pass: reopen.length === 0,
    sampleCount: samples.length,
    trace: samples,
  };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const pullFrames = [];
  try {
    const page = await browser.newPage();
    for (const vp of VIEWPORTS) {
      pullFrames.push(await capturePullFrame(page, vp, OUT));
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      document.documentElement.dataset.introSkip = "1";
    });
    await page.locator("#builder").scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const bandTitles = path.join(OUT, "band-titles-inter-tight.png");
    await page.screenshot({ path: bandTitles, fullPage: false });
    const trace = await touchReleaseTrace(await browser.newPage());
    const summary = {
      preview: BASE,
      pullFrames,
      touchRelease390: trace,
      bandTitlesScreenshot: bandTitles,
      pass:
        pullFrames.every((f) => f.stripe.ok) && trace.pass,
    };
    await writeFile(
      path.join(OUT, "prove-overscroll-pull.json"),
      JSON.stringify(summary, null, 2),
    );
    console.log(JSON.stringify(summary, null, 2));
    if (!summary.pass) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
