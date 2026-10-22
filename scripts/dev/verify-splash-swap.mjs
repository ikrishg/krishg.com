import { chromium } from "playwright";

const baseUrl = process.env.PREVIEW_URL ?? "http://127.0.0.1:4321";
const COLORS = {
  building: "#398fd0",
  creating: "#b94a3f",
  educating: "#d8a12a",
};

async function scrollToIndex(page) {
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "true";
    const tail = document.querySelector(".home-closing-tail");
    const nav = document.querySelector(".home-navbar");
    const navBottom = nav.getBoundingClientRect().bottom;
    for (let i = 0; i < 48; i++) {
      const d = tail.getBoundingClientRect().top - navBottom;
      if (Math.abs(d) < 2) return;
      window.scrollBy(0, d);
    }
  });
}

async function topColor(page) {
  return page.evaluate((colors) => {
    const splash = document.documentElement.dataset.homeSplash;
    const layers = [
      ...document.querySelectorAll(".home-splash-overlay [data-splash-layer]"),
    ];
    const top = layers.at(-1);
    const key = top?.getAttribute("data-splash-layer") ?? null;
    let fill = null;
    if (top) {
      const path = top.querySelector("path");
      if (path) fill = path.getAttribute("fill");
      else fill = getComputedStyle(top).backgroundColor;
    }
    const expected = splash ? colors[splash] : null;
    const hexToRgb = (hex) => {
      const n = hex.replace("#", "");
      const r = Number.parseInt(n.slice(0, 2), 16);
      const g = Number.parseInt(n.slice(2, 4), 16);
      const b = Number.parseInt(n.slice(4, 6), 16);
      return `rgb(${r}, ${g}, ${b})`;
    };
    const okColor =
      !expected || fill === expected || fill === hexToRgb(expected);
    return { splash, key, fill, expected, okColor };
  }, COLORS);
}

async function hoverGap(page, gapMs) {
  const building = page.locator('[data-splash-key="building"]').first();
  const creating = page.locator('[data-splash-key="creating"]').first();
  await building.hover();
  await page.waitForTimeout(gapMs);
  await creating.hover();
  await page.waitForTimeout(1500);
  const state = await topColor(page);
  const ok =
    state.splash === "creating" &&
    state.key === "creating" &&
    state.okColor;
  return { gapMs, state, ok };
}

async function sampleSplashKey(page) {
  return page.evaluate(() => {
    const layers = [
      ...document.querySelectorAll(".home-splash-overlay [data-splash-layer]"),
    ];
    return layers.at(-1)?.getAttribute("data-splash-layer") ?? null;
  });
}

async function rapidHover(page) {
  const keys = [
    "building",
    "creating",
    "educating",
    "about",
    "now",
    "sitemap",
  ];
  const changes = [];
  let lastKey = null;
  const start = Date.now();

  for (const key of keys) {
    await page.locator(`[data-splash-key="${key}"]`).first().hover();
    await page.waitForTimeout(80);
    const splash = await page.evaluate(
      () => document.documentElement.dataset.homeSplash ?? null,
    );
    const t = Date.now() - start;
    if (splash && splash !== lastKey) {
      changes.push({ t, splash });
      lastKey = splash;
    }
  }

  for (let round = 0; round < 3; round++) {
    for (const key of keys) {
      await page.locator(`[data-splash-key="${key}"]`).first().hover();
      await page.waitForTimeout(80);
    }
  }
  await page.waitForTimeout(900);

  const finalSplash = await page.evaluate(
    () => document.documentElement.dataset.homeSplash,
  );
  const finalKey = await sampleSplashKey(page);

  const windowMs = 1000;
  let maxInWindow = 0;
  for (let i = 0; i < changes.length; i++) {
    const t0 = changes[i].t;
    const count = changes.filter((c) => c.t >= t0 && c.t < t0 + windowMs).length;
    maxInWindow = Math.max(maxInWindow, count);
  }

  const staleRevert = changes.some((c, i) => {
    if (i < 2) return false;
    return (
      changes[i - 2].splash === c.splash &&
      changes[i - 1].splash !== c.splash &&
      changes[i - 1].splash !== changes[i - 2].splash
    );
  });

  return {
    changes,
    finalSplash,
    finalKey,
    maxInWindow,
    staleRevert,
    throttleOk: maxInWindow <= 3 && !staleRevert,
    lastKey: keys[keys.length - 1],
    finalOk: finalSplash === keys[keys.length - 1] && finalKey === "sitemap",
  };
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
});
await page.goto(baseUrl, { waitUntil: "networkidle" });
await scrollToIndex(page);

const gaps = [];
for (const gap of [400, 450, 600]) {
  await page.reload({ waitUntil: "networkidle" });
  await scrollToIndex(page);
  gaps.push(await hoverGap(page, gap));
}

await page.reload({ waitUntil: "networkidle" });
await scrollToIndex(page);
const rapid = await rapidHover(page);

await browser.close();

const report = { gaps, rapid };
console.log(JSON.stringify(report, null, 2));

const gapsOk = gaps.every((g) => g.ok);
const rapidOk = rapid.finalOk && !rapid.staleRevert && rapid.maxInWindow <= 3;
if (!gapsOk || !rapidOk) process.exit(1);
