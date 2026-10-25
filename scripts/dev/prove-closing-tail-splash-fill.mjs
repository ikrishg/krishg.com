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
const ROW_STEP_PX = 8;
const BEIGE_DIST_THRESHOLD = 28;

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

function isBeigeRgb(rgb) {
  return dist(rgb, BEIGE) < BEIGE_DIST_THRESHOLD;
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

async function assertViewport(page, expected) {
  const actual = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  }));
  if (
    actual.innerWidth !== expected.width ||
    actual.innerHeight !== expected.height
  ) {
    throw new Error(
      `viewport mismatch: expected ${expected.width}x${expected.height}, got ${actual.innerWidth}x${actual.innerHeight}`,
    );
  }
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

async function sampleTailPixelsDense(page, rect) {
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

  if (info.width !== rect.width || info.height !== rect.height) {
    throw new Error(
      `clip/screenshot size mismatch: clip ${rect.width}x${rect.height}, image ${info.width}x${info.height}`,
    );
  }

  const w = info.width;
  const h = info.height;
  const channels = info.channels;
  const insetX = 4;
  const rowSamples = [];
  const allSamples = [];

  for (let y = 0; y < h; y += ROW_STEP_PX) {
    const row = [];
    for (let x = insetX; x < w; x += Math.max(8, Math.floor(w / 32))) {
      const i = (y * w + x) * channels;
      const rgb = [data[i], data[i + 1], data[i + 2]];
      const classified = { x, y, rgb, ...nearestClass(rgb) };
      row.push(classified);
      allSamples.push(classified);
    }
    const beigeInRow = row.filter((s) => isBeigeRgb(s.rgb)).length;
    rowSamples.push({
      y,
      beigeFraction: beigeInRow / row.length,
      dominant: beigeInRow > row.length / 2 ? "beige" : "splash",
    });
  }

  return { allSamples, rowSamples, imageSize: { w, h } };
}

function classifySamples(samples) {
  const counts = { beige: 0, building: 0, creating: 0, educating: 0 };
  for (const s of samples) {
    if (s.label === "beige" || s.dBeige < BEIGE_DIST_THRESHOLD) counts.beige += 1;
    else counts[s.label] = (counts[s.label] ?? 0) + 1;
  }
  return counts;
}

/** Any horizontal band that is mostly beige while top/bottom are splash (sandwich). */
function hasStripeFromRows(rowSamples) {
  if (rowSamples.length < 3) return false;
  const splashRows = rowSamples.filter((r) => r.dominant !== "beige");
  const beigeRows = rowSamples.filter((r) => r.dominant === "beige");
  if (beigeRows.length === 0 || splashRows.length === 0) return false;
  const firstBeige = beigeRows[0].y;
  const lastBeige = beigeRows[beigeRows.length - 1].y;
  const hasSplashAbove = rowSamples.some(
    (r) => r.y < firstBeige && r.dominant !== "beige",
  );
  const hasSplashBelow = rowSamples.some(
    (r) => r.y > lastBeige && r.dominant !== "beige",
  );
  return hasSplashAbove && hasSplashBelow;
}

/** On hover: any row that is mostly beige is a forbidden stripe band. */
function hasBeigeBandOnHover(rowSamples) {
  return rowSamples.some((r) => r.dominant === "beige" && r.beigeFraction > 0.55);
}

async function auditTailOpaqueBackgrounds(page) {
  return page.evaluate(() => {
    const tail = document.querySelector(".home-closing-tail");
    if (!tail) return { ok: false, offenders: [{ reason: "no tail" }] };

    const parseBg = (css) => {
      const t = css.trim();
      if (!t || t === "transparent" || t === "none") return null;
      const m = t.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!m) return { raw: t, opaque: true };
      const a = m[4] !== undefined ? Number(m[4]) : 1;
      if (a <= 0.02) return null;
      return {
        rgb: [Number(m[1]), Number(m[2]), Number(m[3])],
        alpha: a,
        opaque: a > 0.02,
      };
    };

    const isAllowedOpaque = (el) => {
      if (!(el instanceof Element)) return false;
      if (el.classList.contains("home-splash-overlay")) return true;
      if (el.id === "home-splash-portal") return true;
      if (el.closest(".home-drifting-cursor")) return true;
      return false;
    };

    const isBeigeFill = (bg) => {
      if (!bg?.rgb) return false;
      const [r, g, b] = bg.rgb;
      return (
        Math.abs(r - 231) < 12 &&
        Math.abs(g - 221) < 12 &&
        Math.abs(b - 204) < 12
      );
    };

    const offenders = [];
    const walk = (el) => {
      if (el === tail) {
        for (const child of el.children) walk(child);
        return;
      }
      if (!isAllowedOpaque(el)) {
        const cs = getComputedStyle(el);
        for (const pseudo of ["", "::before", "::after"]) {
          const bg = parseBg(
            pseudo
              ? getComputedStyle(el, pseudo).backgroundColor
              : cs.backgroundColor,
          );
          if (bg?.opaque && isBeigeFill(bg)) {
            const id =
              el.id ||
              [...(el.classList || [])].slice(0, 3).join(".") ||
              el.tagName.toLowerCase();
            offenders.push({
              selector: `${id}${pseudo}`,
              backgroundColor: bg.raw || `rgb(${bg.rgb.join(",")})`,
              alpha: bg.alpha,
            });
          }
        }
      }
      for (const child of el.children) walk(child);
    };
    walk(tail);
    return { ok: offenders.length === 0, offenders };
  });
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

async function checkNavLogoVisible(page) {
  return page.evaluate(() => {
    const logo = document.querySelector(".home-navbar .home-logo");
    if (!logo) return { ok: false, reason: "missing .home-logo" };
    const svg = logo.querySelector("svg, .home-logo__svg");
    const cs = getComputedStyle(logo);
    const opacity = Number(cs.opacity);
    const display = cs.display;
    const visibility = cs.visibility;
    const rect = logo.getBoundingClientRect();
    return {
      ok:
        opacity > 0.1 &&
        display !== "none" &&
        visibility !== "hidden" &&
        rect.width > 8 &&
        rect.height > 8,
      opacity,
      display,
      visibility,
      width: rect.width,
      height: rect.height,
      hasSvg: Boolean(svg),
    };
  });
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

async function screenshotViewport(page, filePath) {
  const buf = await page.screenshot({ type: "png", fullPage: false });
  const meta = await sharp(buf).metadata();
  await writeFile(filePath, buf);
  return { width: meta.width, height: meta.height };
}

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const results = [];
let failed = false;

for (const viewport of VIEWPORTS) {
  const isMobile = viewport.width < 768;
  const viewportLabel = `${viewport.width}x${viewport.height}`;

  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120_000 });
  await assertViewport(page, viewport);
  await scrollToClosing(page);
  const rect = await tailRect(page, isMobile);
  const tailRectDesktop = isMobile ? null : await tailRect(page, false);
  if (!rect) {
    failed = true;
    results.push({ viewport: viewportLabel, state: "rest", ok: false });
    await context.close();
    continue;
  }

  const { allSamples: restSamples, rowSamples: restRows } =
    await sampleTailPixelsDense(page, rect);
  const restCounts = classifySamples(restSamples);
  const restShot = path.join(OUT, `${viewportLabel}-rest.png`);
  const restShotMeta = await screenshotViewport(page, restShot);
  const navLogoRest = await checkNavLogoVisible(page);
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
      const m = getComputedStyle(email).color.match(
        /rgba?\((\d+),\s*(\d+),\s*(\d+)/,
      );
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
  const restStripe = hasStripeFromRows(restRows);
  const restOk =
    !isMobile &&
    restCounts.beige >= restSamples.length * 0.85 &&
    !restStripe &&
    restContrasts.every((c) => c.ok) &&
    navLogoRest.ok;
  const mobileRestOk =
    isMobile &&
    restCounts.beige >= restSamples.length * 0.85 &&
    restContrasts.every((c) => c.ok);
  const okRest = isMobile ? mobileRestOk : restOk;
  if (!okRest) failed = true;
  results.push({
    viewport: viewportLabel,
    state: "rest",
    ok: okRest,
    pixelCounts: restCounts,
    stripe: restStripe,
    contrasts: restContrasts,
    navLogo: navLogoRest,
    screenshot: restShot,
    screenshotPixels: restShotMeta,
  });

  if (!isMobile && tailRectDesktop) {
    for (const word of WORDS) {
      await page.evaluate(() => {
        delete document.documentElement.dataset.homeSplash;
      });
      await page.waitForTimeout(150);
      await hoverPrimary(page, word);
      const { allSamples: hoverSamples, rowSamples: hoverRows } =
        await sampleTailPixelsDense(page, tailRectDesktop);
      const hoverCounts = classifySamples(hoverSamples);
      const hoverShot = path.join(OUT, `${viewportLabel}-${word}.png`);
      const hoverShotMeta = await screenshotViewport(page, hoverShot);
      const bgAudit = await auditTailOpaqueBackgrounds(page);
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
      const beigeBand = hasBeigeBandOnHover(hoverRows);
      const splashFilled = hoverCounts[word] >= hoverSamples.length * 0.85;
      const hoverOk =
        splashFilled &&
        !beigeBand &&
        !hasStripeFromRows(hoverRows) &&
        bgAudit.ok &&
        hoverContrasts.every((c) => c.ok) &&
        hoverShotMeta.width === viewport.width;
      if (!hoverOk) failed = true;
      results.push({
        viewport: viewportLabel,
        state: `hover-${word}`,
        ok: hoverOk,
        pixelCounts: hoverCounts,
        stripe: beigeBand || hasStripeFromRows(hoverRows),
        beigeBandRows: hoverRows.filter((r) => r.dominant === "beige").length,
        opaqueBgOffenders: bgAudit.offenders,
        contrasts: hoverContrasts,
        screenshot: hoverShot,
        screenshotPixels: hoverShotMeta,
      });

      await page.mouse.move(8, viewport.height - 8);
      await page.waitForTimeout(400);
      const { allSamples: exitSamples, rowSamples: exitRows } =
        await sampleTailPixelsDense(page, tailRectDesktop);
      const exitShot = path.join(OUT, `${viewportLabel}-${word}-exitfade.png`);
      await screenshotViewport(page, exitShot);
      const exitStripe = hasStripeFromRows(exitRows);
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

  await context.close();
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
