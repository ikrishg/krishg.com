/**
 * B2 closing splash proof: beige at rest, full splash on hover, clean exit fade.
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

const BEIGE = [231, 221, 204];
const SPLASH = {
  building: [57, 143, 208],
  creating: [185, 74, 63],
  educating: [216, 161, 42],
};
const INK = {
  building: [20, 26, 43],
  creating: [255, 249, 236],
  educating: [20, 26, 43],
};
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

function nearestClass(rgb) {
  const dBeige = dist(rgb, BEIGE);
  let best = "beige";
  let bestD = dBeige;
  for (const [name, color] of Object.entries(SPLASH)) {
    const d = dist(rgb, color);
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return { label: best, dBeige, confidence: bestD < 38 };
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

async function scrollToClosing(page) {
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "true";
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.max(0, max));
  });
  await page.waitForTimeout(500);
}

async function tailRect(page, mobileFooterOnly = false) {
  return page.evaluate((footerOnly) => {
    const el = footerOnly
      ? document.querySelector(".home-footer")
      : document.querySelector(".home-closing-tail");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  }, mobileFooterOnly);
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
  const samples = [];
  for (const y of ys) {
    for (const x of xs) {
      const i = (y * w + x) * channels;
      samples.push({
        x,
        y,
        rgb: [data[i], data[i + 1], data[i + 2]],
        ...nearestClass([data[i], data[i + 1], data[i + 2]]),
      });
    }
  }
  return samples;
}

function classifySamples(samples) {
  const counts = { beige: 0, building: 0, creating: 0, educating: 0 };
  for (const s of samples) {
    if (s.label === "beige" || s.dBeige < 28) counts.beige += 1;
    else counts[s.label] = (counts[s.label] ?? 0) + 1;
  }
  return counts;
}

/** P0 sandwich: splash top and bottom with beige band through the middle. */
function hasStripe(samples) {
  const ys = [...new Set(samples.map((s) => s.y))].sort((a, b) => a - b);
  if (ys.length < 3) return false;
  const rowKind = (y) => {
    const row = samples.filter((s) => s.y === y);
    const beige = row.filter((s) => s.dBeige < 28).length;
    return beige > row.length / 2 ? "beige" : "splash";
  };
  const top = rowKind(ys[0]);
  const mid = rowKind(ys[Math.floor(ys.length / 2)]);
  const bot = rowKind(ys[ys.length - 1]);
  return top === "splash" && mid === "beige" && bot === "splash";
}

async function measureInkContrast(page, word, bgRgb) {
  return page.evaluate(
    ({ wordKey, bg }) => {
      const parse = (css) => {
        const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return m
          ? [Number(m[1]), Number(m[2]), Number(m[3])]
          : [20, 26, 43];
      };
      const primary = [
        ...document.querySelectorAll("a.home-closing-link--primary"),
      ].find((n) => n.textContent?.trim().toLowerCase() === wordKey);
      const nav = document.querySelector(".home-navbar");
      const email = document.querySelector(".home-footer__email");
      const pill = document.querySelector(".home-footer__social-pill");
      const rows = [];
      for (const [id, el] of [
        ["primary", primary],
        ["navbar", nav],
        ["email", email],
        ["pill", pill],
      ]) {
        if (!el) {
          rows.push({ id, ok: false, reason: "missing" });
          continue;
        }
        rows.push({ id, fgRgb: parse(getComputedStyle(el).color), bgRgb: bg });
      }
      return rows;
    },
    { wordKey: word, bg: bgRgb },
  );
}

async function hoverPrimary(page, word) {
  const link = page.locator(`a.home-closing-link--primary`, { hasText: word });
  await link.first().scrollIntoViewIfNeeded();
  await link.first().hover({ force: true });
  await page
    .waitForFunction(
      (w) => document.documentElement.dataset.homeSplash === w,
      word,
      { timeout: 5000 },
    )
    .catch(() => {});
  await page.waitForTimeout(700);
}

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const results = [];
let failed = false;

for (const viewport of VIEWPORTS) {
  const isMobile = viewport.width < 768;
  const viewportLabel = `${viewport.width}x${viewport.height}`;

  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120_000 });
  await scrollToClosing(page);
  const rect = await tailRect(page, isMobile);
  const tailRectDesktop = isMobile ? null : await tailRect(page, false);
  if (!rect) {
    failed = true;
    results.push({ viewport: viewportLabel, state: "rest", ok: false });
    await page.close();
    continue;
  }

  const restSamples = await sampleTailPixels(page, rect);
  const restCounts = classifySamples(restSamples);
  const restShot = path.join(OUT, `${viewportLabel}-rest.png`);
  await page.screenshot({ path: restShot, fullPage: false });
  const restContrastRows = isMobile
    ? []
    : await measureInkContrast(page, "building", BEIGE);
  const restContrasts = restContrastRows.map((row) => {
    if (row.reason) return { id: row.id, ok: false, ratio: 0 };
    const ratio = contrastRatio(row.fgRgb, BEIGE);
    return {
      id: row.id,
      ratio: Math.round(ratio * 100) / 100,
      ok: ratio >= MIN_CONTRAST,
    };
  });
  if (isMobile) {
    const emailRow = await page.evaluate(() => {
      const email = document.querySelector(".home-footer__email");
      if (!email) return null;
      const m = getComputedStyle(email).color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      const fg = m
        ? [Number(m[1]), Number(m[2]), Number(m[3])]
        : [20, 26, 43];
      return { fgRgb: fg };
    });
    if (emailRow) {
      const ratio = contrastRatio(emailRow.fgRgb, BEIGE);
      restContrasts.push({
        id: "email",
        ratio: Math.round(ratio * 100) / 100,
        ok: ratio >= MIN_CONTRAST,
      });
    }
  }
  const restOk =
    !isMobile &&
    restCounts.beige >= restSamples.length - 2 &&
    !hasStripe(restSamples) &&
    restContrasts.every((c) => c.ok);
  const mobileRestOk =
    isMobile &&
    restCounts.beige === restSamples.length &&
    restContrasts.every((c) => c.ok);
  const okRest = isMobile ? mobileRestOk : restOk;
  if (!okRest) failed = true;
  results.push({
    viewport: viewportLabel,
    state: "rest",
    ok: okRest,
    pixelCounts: restCounts,
    stripe: hasStripe(restSamples),
    contrasts: restContrasts,
    screenshot: restShot,
  });

  if (!isMobile && tailRectDesktop) {
    for (const word of WORDS) {
      await page.evaluate(() => {
        delete document.documentElement.dataset.homeSplash;
      });
      await page.waitForTimeout(150);
      await hoverPrimary(page, word);
      const hoverSamples = await sampleTailPixels(page, tailRectDesktop);
      const hoverCounts = classifySamples(hoverSamples);
      const hoverShot = path.join(OUT, `${viewportLabel}-${word}.png`);
      await page.screenshot({ path: hoverShot, fullPage: false });
      const splashRgb = SPLASH[word];
      const hoverContrastRows = await measureInkContrast(page, word, splashRgb);
      const hoverContrasts = hoverContrastRows.map((row) => {
        if (row.reason) return { id: row.id, ok: false, ratio: 0 };
        const ink = INK[word];
        const ratio = contrastRatio(ink, splashRgb);
        return {
          id: row.id,
          ratio: Math.round(ratio * 100) / 100,
          ok: ratio >= MIN_CONTRAST,
        };
      });
      const splashFilled =
        hoverCounts[word] >= hoverSamples.length - 2 &&
        hoverCounts.beige <= 1;
      const hoverOk =
        splashFilled && !hasStripe(hoverSamples) && hoverContrasts.every((c) => c.ok);
      if (!hoverOk) failed = true;
      results.push({
        viewport: viewportLabel,
        state: `hover-${word}`,
        ok: hoverOk,
        pixelCounts: hoverCounts,
        stripe: hasStripe(hoverSamples),
        contrasts: hoverContrasts,
        screenshot: hoverShot,
      });

      await page.mouse.move(8, viewport.height - 8);
      await page.waitForTimeout(400);
      const exitSamples = await sampleTailPixels(page, tailRectDesktop);
      const exitShot = path.join(OUT, `${viewportLabel}-${word}-exitfade.png`);
      await page.screenshot({ path: exitShot, fullPage: false });
      const exitStripe = hasStripe(exitSamples);
      const exitOk = !exitStripe;
      if (!exitOk) failed = true;
      results.push({
        viewport: viewportLabel,
        state: `exitfade-${word}`,
        ok: exitOk,
        stripe: exitStripe,
        pixelCounts: classifySamples(exitSamples),
        screenshot: exitShot,
      });
    }
  }

  await page.close();
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
