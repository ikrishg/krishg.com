/**
 * Forge hairline proof: 0 warm pixels on scroll-surface bottom row during pull.
 * Usage: PREVIEW_URL=http://127.0.0.1:4321 node scripts/dev/prove-overscroll-hairline.mjs
 */
import { chromium } from "playwright";
import sharp from "sharp";

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4321";

const isHairline = (r, g, b, a) => {
  if (a < 16) return false;
  return (
    r >= 185 &&
    r <= 210 &&
    g >= 80 &&
    g <= 135 &&
    b >= 65 &&
    b <= 100
  );
};

async function sampleSurfaceBottomRow(page) {
  const meta = await page.evaluate(() => {
    const surface = document.querySelector(".home-scroll-surface");
    if (!surface) return null;
    const rect = surface.getBoundingClientRect();
    const pull =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--home-overscroll-pull",
        ),
      ) || 0;
    const pulling =
      document.documentElement.dataset.overscrollPulling === "true" ||
      surface.dataset.overscrollPulling === "true";
    const y = Math.max(0, rect.bottom - 1);
    return {
      x: rect.left,
      y,
      width: Math.max(1, rect.width),
      height: 1,
      pull,
      pulling,
    };
  });
  if (!meta) return { ok: false, reason: "no surface", hits: -1 };

  const buffer = await page.screenshot({
    clip: {
      x: meta.x,
      y: meta.y,
      width: meta.width,
      height: meta.height,
    },
    type: "png",
    animations: "disabled",
  });

  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hits = 0;
  const channels = info.channels;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (isHairline(r, g, b, a)) hits += 1;
  }

  const pullActive = meta.pull >= 12 || meta.pulling;
  return {
    ok: hits === 0 && pullActive,
    hits,
    pullPx: meta.pull,
    pulling: meta.pulling,
    pullActive,
    width: info.width,
  };
}

async function scrollToBottom(page) {
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "1";
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, max);
  });
  await page.waitForTimeout(350);
}

async function cdpTouchHold(page, { width, height, holds }) {
  const client = await page.context().newCDPSession(page);
  const cx = Math.round(width / 2);
  const results = [];
  for (let h = 0; h < holds; h += 1) {
    const startY = Math.round(height * 0.72);
    const endY = Math.round(height * 0.2);
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
    await page.waitForTimeout(90);
    results.push(await sampleSurfaceBottomRow(page));
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForTimeout(200);
  }
  return results;
}

async function wheelPullSamples(page, pulls) {
  const results = [];
  for (let i = 0; i < pulls; i += 1) {
    for (let w = 0; w < 6; w += 1) {
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(35);
    }
    await page.waitForTimeout(80);
    results.push(await sampleSurfaceBottomRow(page));
    await page.waitForTimeout(120);
  }
  return results;
}

async function runViewport(browser, { width, height, label, mode }) {
  const context = await browser.newContext({
    hasTouch: mode === "touch",
    viewport: { width, height },
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await scrollToBottom(page);
  const samples =
    mode === "touch"
      ? await cdpTouchHold(page, { width, height, holds: 3 })
      : await wheelPullSamples(page, 4);
  await context.close();
  const hairlineHits = samples.filter((s) => s.hits > 0).length;
  const inactivePull = samples.filter((s) => !s.pullActive).length;
  return {
    viewport: label,
    mode,
    samples,
    hairlineHits,
    inactivePull,
    pass: hairlineHits === 0 && inactivePull === 0,
  };
}

async function main() {
  const browser = await chromium.launch();
  try {
    const results = [
      await runViewport(browser, {
        width: 390,
        height: 844,
        label: "390",
        mode: "touch",
      }),
      await runViewport(browser, {
        width: 768,
        height: 1024,
        label: "768",
        mode: "touch",
      }),
      await runViewport(browser, {
        width: 1440,
        height: 900,
        label: "1440",
        mode: "wheel",
      }),
    ];
    const summary = {
      preview: BASE,
      results,
      pass: results.every((r) => r.pass),
    };
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
