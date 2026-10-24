/**
 * State A: splash under tail (body portal); tail stays beige; ink contrast holds.
 * Usage: PREVIEW_URL=http://127.0.0.1:4321 node scripts/dev/prove-closing-tail-splash-fill.mjs
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4321";
const DEV_ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT =
  process.env.SCREENSHOT_DIR ||
  path.join(DEV_ROOT, "out", "closing-tail-splash-proof");

const CLOSING_BG = [231, 221, 204];
const CLOSING_FG = [20, 26, 43];
const SPLASH_RGB = [
  [57, 143, 208],
  [185, 74, 63],
  [216, 161, 42],
];
const MIN_CONTRAST = 4.5;

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 776 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];

const WORDS = ["building", "creating", "educating"];

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function isSplashHue(rgb) {
  const dBeige = dist(rgb, CLOSING_BG);
  for (const splash of SPLASH_RGB) {
    const dSplash = dist(rgb, splash);
    if (dSplash < 42 && dSplash < dBeige - 8) return true;
  }
  return false;
}

function srgbToLinear(c) {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg, bg) {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgb(css) {
  const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

async function scrollToClosing(page) {
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "true";
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.max(0, max));
  });
  await page.waitForTimeout(500);
}

async function tailRect(page) {
  return page.evaluate(() => {
    const tail = document.querySelector(".home-closing-tail");
    if (!tail) return null;
    const r = tail.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  });
}

async function sampleTailPixels(page, rect) {
  const buf = await page.screenshot({
    type: "png",
    clip: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
  });
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const samples = [];
  const w = info.width;
  const h = info.height;
  const channels = info.channels;
  const inset = 6;
  const xs = [
    inset,
    Math.floor(w / 4),
    Math.floor(w / 2),
    Math.floor((3 * w) / 4),
    Math.max(inset, w - inset - 1),
  ];
  const ys = [inset, Math.floor(h / 2), Math.max(inset, h - inset - 1)];

  for (const y of ys) {
    for (const x of xs) {
      const i = (y * w + x) * channels;
      samples.push({
        x,
        y,
        rgb: [data[i], data[i + 1], data[i + 2]],
      });
    }
  }
  return samples;
}

async function measureContrast(page, isMobile) {
  return page.evaluate((mobile) => {
    const bg = getComputedStyle(document.documentElement).getPropertyValue(
      "--home-closing-bg",
    );
    const parse = (css) => {
      const el = document.createElement("div");
      el.style.color = css.trim() || "#e7ddcc";
      document.body.appendChild(el);
      const rgb = getComputedStyle(el).color;
      el.remove();
      const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [231, 221, 204];
    };
    const bgRgb = parse(bg || "#e7ddcc");

    const selectors = mobile
      ? [
          ["mobile-educating", "a.home-closing-link--mobile", "educating"],
          ["email", ".home-footer__email", null],
          ["pill-x", ".home-footer__social-pill", null],
          ["navbar", ".home-navbar", null],
        ]
      : [
          ["primary-building", "a.home-closing-link--primary", "building"],
          ["primary-creating", "a.home-closing-link--primary", "creating"],
          ["primary-educating", "a.home-closing-link--primary", "educating"],
          ["nav-about", "a.home-closing-link--nav", "about"],
          ["email", ".home-footer__email", null],
          ["pill-x", ".home-footer__social-pill", null],
          ["navbar", ".home-navbar", null],
        ];

    const rows = [];
    for (const [id, sel, text] of selectors) {
      const nodes = [...document.querySelectorAll(sel)];
      const el = text
        ? nodes.find((n) => n.textContent?.trim().toLowerCase() === text)
        : nodes[0];
      if (!el) {
        rows.push({ id, ok: false, reason: "missing" });
        continue;
      }
      const fgCss = getComputedStyle(el).color;
      const m = fgCss.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      const fgRgb = m
        ? [Number(m[1]), Number(m[2]), Number(m[3])]
        : [20, 26, 43];
      rows.push({ id, fgRgb, bgRgb });
    }
    return rows;
  }, isMobile);
}

async function hoverPrimary(page, word) {
  const link = page.locator(`a.home-closing-link--primary`, {
    hasText: word,
  });
  await link.first().scrollIntoViewIfNeeded();
  await link.first().hover({ force: true });
  await page.waitForTimeout(750);
}

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const results = [];
let failed = false;

for (const viewport of VIEWPORTS) {
  for (const word of WORDS) {
    const page = await browser.newPage({
      viewport,
      deviceScaleFactor: 1,
    });
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 120_000 });
    await scrollToClosing(page);

    const rect = await tailRect(page);
    if (!rect || rect.width < 10 || rect.height < 10) {
      failed = true;
      results.push({
        viewport: `${viewport.width}x${viewport.height}`,
        word,
        ok: false,
        reason: "missing tail rect",
      });
      await page.close();
      continue;
    }

    if (viewport.width >= 768) {
      await hoverPrimary(page, word);
      await page
        .waitForFunction(
          (w) => document.documentElement.dataset.homeSplash === w,
          word,
          { timeout: 5000 },
        )
        .catch(() => {});
      await page.waitForTimeout(400);
    }

    const label = `${viewport.width}x${viewport.height}-${word}`;
    const shotPath = path.join(OUT, `${label}.png`);
    await page.screenshot({ path: shotPath, fullPage: false });

    const samples = await sampleTailPixels(page, rect);
    const splashHits = samples.filter((s) => isSplashHue(s.rgb));

    const contrastRows = await measureContrast(page, viewport.width < 768);
    const contrasts = contrastRows.map((row) => {
      if (row.reason) return { ...row, ratio: 0, ok: false };
      const ratio = contrastRatio(row.fgRgb, row.bgRgb);
      const ok = ratio >= MIN_CONTRAST;
      return { id: row.id, ratio: Math.round(ratio * 100) / 100, ok };
    });
    const contrastFail = contrasts.some((c) => !c.ok);

    const ok = splashHits.length === 0 && !contrastFail;
    if (!ok) failed = true;

    results.push({
      viewport: `${viewport.width}x${viewport.height}`,
      word,
      ok,
      splashHits,
      sampleCount: samples.length,
      contrasts,
      screenshot: shotPath,
    });

    await page.close();
  }
}

await browser.close();

const reportPath = path.join(OUT, "pixel-results.json");
await writeFile(reportPath, JSON.stringify(results, null, 2));

console.log(JSON.stringify(results, null, 2));
if (failed) {
  console.error("prove-closing-tail-splash-fill: FAILED");
  process.exit(1);
}
console.log("prove-closing-tail-splash-fill: OK");
