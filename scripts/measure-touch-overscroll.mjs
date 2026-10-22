/**
 * Touch overscroll / scroll-jump verification (Playwright touch context).
 * Usage: PREVIEW_URL=http://127.0.0.1:4321 node scripts/measure-touch-overscroll.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4321";
const VIEWPORTS = [
  { width: 390, height: 844, label: "390" },
  { width: 768, height: 1024, label: "768" },
];

const START_POSITIONS = [
  { id: "top", scrollY: 0 },
  { id: "mid", ratio: 0.45 },
  { id: "bottom", ratio: 1 },
];

async function cdpTouchSwipe(page, { startX, startY, endY, samplePull }) {
  const client = await page.context().newCDPSession(page);
  let peakPull = 0;
  const step = async (type, y) => {
    await client.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x: startX, y }],
    });
    if (samplePull && type === "touchMove") {
      const pull = (await readScroll(page)).pullPx;
      peakPull = Math.max(peakPull, pull);
    }
  };
  await step("touchStart", startY);
  for (let i = 1; i <= 12; i += 1) {
    const y = startY + ((endY - startY) * i) / 12;
    await step("touchMove", y);
  }
  await step("touchEnd", endY);
  return peakPull;
}

async function readScroll(page) {
  return page.evaluate(() => ({
    scrollY: Math.round(window.scrollY),
    maxScrollY: Math.round(
      document.documentElement.scrollHeight - window.innerHeight,
    ),
    pullPx:
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--home-overscroll-pull",
        ),
      ) || 0,
  }));
}

async function scrollToPosition(page, position) {
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "1";
  });

  if (position.scrollY === 0) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    return;
  }

  const targetRatio = position.ratio ?? 0;
  if (targetRatio >= 0.99) {
    for (let i = 0; i < 40; i += 1) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(40);
    }
  } else {
    const wheels = Math.max(4, Math.round(targetRatio * 24));
    for (let i = 0; i < wheels; i += 1) {
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(50);
    }
  }
  await page.waitForTimeout(400);
}

async function swipe(page, opts) {
  const peak = await cdpTouchSwipe(page, opts);
  await page.waitForTimeout(450);
  return peak;
}

async function measureViewport(browser, { width, height, label }) {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width, height },
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "1";
  });

  const gestures = [];
  const centerX = Math.round(width / 2);

  for (const start of START_POSITIONS) {
    await scrollToPosition(page, start);
    const beforePos = await readScroll(page);

    for (const direction of ["up", "down"]) {
      const startY = Math.round(height * 0.65);
      const endY =
        direction === "up" ? Math.round(height * 0.25) : Math.round(height * 0.85);
      const before = await readScroll(page);
      await swipe(page, { startX: centerX, startY, endY });
      const after = await readScroll(page);
      gestures.push({
        start: start.id,
        direction,
        scrollYBefore: before.scrollY,
        scrollYAfter: after.scrollY,
        delta: after.scrollY - before.scrollY,
        pullPxAfter: after.pullPx,
        maxScrollY: before.maxScrollY,
      });
    }
  }

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "1";
  });
  await scrollToPosition(page, { ratio: 1 });
  for (let i = 0; i < 8; i += 1) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(35);
  }
  await page.waitForTimeout(250);

  const maxPullPx = await page.evaluate(
    () =>
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--home-overscroll-max-pull",
        ),
      ) || 0,
  );
  const beforeReveal = await readScroll(page);
  const peakTouchPull = await swipe(page, {
    startX: centerX,
    startY: Math.round(height * 0.7),
    endY: Math.round(height * 0.2),
    samplePull: true,
  });
  const afterReveal = await readScroll(page);

  let maxWheelPull = 0;
  for (let i = 0; i < 8; i += 1) {
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(35);
    const pull = (await readScroll(page)).pullPx;
    maxWheelPull = Math.max(maxWheelPull, pull);
  }

  await context.close();

  const midSwipeDown = gestures.find(
    (g) => g.start === "mid" && g.direction === "down",
  );
  const touchJumpGuard = {
    scrollYBefore: midSwipeDown?.scrollYBefore ?? null,
    scrollYAfter: midSwipeDown?.scrollYAfter ?? null,
    delta: midSwipeDown?.delta ?? null,
    pass:
      midSwipeDown != null &&
      Math.abs(midSwipeDown.delta) < 350 &&
      midSwipeDown.scrollYAfter < midSwipeDown.maxScrollY - 80,
  };

  return {
    viewport: label,
    gestures,
    touchJumpGuard,
    bottomOverscrollReveal: {
      scrollYBefore: beforeReveal.scrollY,
      scrollYAfter: afterReveal.scrollY,
      pullPxAfterTouch: Math.round(afterReveal.pullPx * 100) / 100,
      maxPullPxDuringTouch: Math.round(peakTouchPull * 100) / 100,
      maxPullPxDuringWheel: Math.round(maxWheelPull * 100) / 100,
      maxPullPx,
      touchRevealWorks: peakTouchPull > 24,
      overscrollWorks: maxWheelPull > 24,
    },
  };
}

async function main() {
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const vp of VIEWPORTS) {
      results.push(await measureViewport(browser, vp));
    }
  } finally {
    await browser.close();
  }
  const at390 = results.find((r) => r.viewport === "390");
  const summary = {
    preview: BASE,
    touchJump390: at390?.touchJumpGuard ?? null,
    touch: results,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (at390 && !at390.touchJumpGuard?.pass) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
