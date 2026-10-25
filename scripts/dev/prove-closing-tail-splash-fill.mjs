/**
 * B2 closing splash proof: beige at rest, full splash on hover, clean exit fade.
 * Usage:
 *   PREVIEW_URL=http://127.0.0.1:4321 node scripts/dev/prove-closing-tail-splash-fill.mjs
 *   MAIN_PREVIEW_URL=http://127.0.0.1:4322 node scripts/dev/prove-closing-tail-splash-fill.mjs
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4321";
const MAIN_BASE = process.env.MAIN_PREVIEW_URL || "";
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

function parseCssRgb(css) {
  const m = String(css).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function normalizeCssColor(css) {
  const rgb = parseCssRgb(css);
  return rgb ? rgb.join(",") : String(css).trim().toLowerCase();
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

function classifySamples(samples) {
  const counts = { beige: 0, building: 0, creating: 0, educating: 0 };
  for (const s of samples) {
    if (s.label === "beige" || s.dBeige < BEIGE_DIST_THRESHOLD) counts.beige += 1;
    else counts[s.label] = (counts[s.label] ?? 0) + 1;
  }
  return counts;
}

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

function hasBeigeBandOnHover(rowSamples) {
  return rowSamples.some((r) => r.dominant === "beige" && r.beigeFraction > 0.55);
}

function resultsTable(results) {
  return results.map((x) => ({
    vp: x.viewport,
    state: x.state,
    ok: x.ok,
    stripe: x.stripe ?? "-",
    hit: x.hitTest?.ok ?? "-",
    beigeBand: x.beigeBandRows ?? "-",
  }));
}

async function waitForUiSettled(page) {
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "1";
  });
  await page.waitForFunction(
    () => {
      const root = document.documentElement;
      return (
        root.dataset.logoMorph !== "pending" &&
        (root.dataset.introPhase === "ready" || root.dataset.introSkip === "1")
      );
    },
    { timeout: 20_000 },
  );
}

async function scrollToClosing(page) {
  await waitForUiSettled(page);
  await page.evaluate(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.max(0, max));
  });
  await waitForUiSettled(page);
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

function readPixelRgb(raw, width, channels, x, y) {
  const cx = Math.max(0, Math.min(width - 1, x));
  const cy = Math.max(0, y);
  const i = (cy * width + cx) * channels;
  return [raw[i], raw[i + 1], raw[i + 2]];
}

function sampleBgBehindGlyph(raw, width, channels, x, y, fgRgb) {
  const offsets = [
    [0, 8],
    [0, -8],
    [8, 0],
    [-8, 0],
    [0, 14],
    [0, -14],
    [10, 10],
    [-10, 10],
  ];
  let best = null;
  let bestDist = -1;
  for (const [dx, dy] of offsets) {
    const rgb = readPixelRgb(raw, width, channels, x + dx, y + dy);
    const d = dist(rgb, fgRgb);
    if (d < 42) continue;
    if (d > bestDist) {
      bestDist = d;
      best = rgb;
    }
  }
  if (best) return best;
  return readPixelRgb(raw, width, channels, x, y + 12);
}

async function measureContrastsFromViewportShot(page, word, pngBuffer) {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const probes = await page.evaluate((wordKey) => {
    const primary = [
      ...document.querySelectorAll("a.home-closing-link--primary"),
    ].find((n) => n.textContent?.trim().toLowerCase() === wordKey);
    const targets = [
      { id: "primary", el: primary },
      { id: "email", el: document.querySelector(".home-footer__email-text") },
      {
        id: "pill",
        el: document.querySelector(".home-footer__social-pill-label"),
      },
      { id: "navbar", el: document.querySelector(".home-navbar .home-logo") },
    ];
    return targets
      .map(({ id, el }) => {
        if (!el) return { id, missing: true };
        const r = el.getBoundingClientRect();
        const fg = getComputedStyle(el).color;
        const x = Math.round(r.left + r.width / 2);
        const y = Math.round(r.top + r.height / 2);
        return { id, fg, x, y };
      })
      .filter(Boolean);
  }, word);

  return probes.map((p) => {
    if (p.missing) return { id: p.id, ok: false, reason: "missing" };
    const fgRgb = parseCssRgb(p.fg);
    const bgRgb = sampleBgBehindGlyph(
      data,
      info.width,
      info.channels,
      p.x,
      p.y,
      fgRgb,
    );
    const ratio = contrastRatio(fgRgb, bgRgb);
    return {
      id: p.id,
      fg: p.fg,
      bgRgb,
      ratio: Math.round(ratio * 100) / 100,
      ok: ratio >= MIN_CONTRAST,
    };
  });
}

async function assertSplashBelowChrome(page) {
  return page.evaluate(() => {
    const splash = document.querySelector(".home-splash-overlay");
    const index = document.querySelector("#home-closing-index");
    const footerLayout = document.querySelector(
      ".home-closing-tail .home-footer__layout",
    );
    if (!splash || !index || !footerLayout) {
      return { ok: false, reason: "missing layer" };
    }
    const sz = Number(getComputedStyle(splash).zIndex);
    const iz = Number(getComputedStyle(index).zIndex);
    const fz = Number(getComputedStyle(footerLayout).zIndex);
    return { ok: sz < iz && sz < fz, sz, iz, fz };
  });
}

async function assertHitTestContentAboveSplash(page, word) {
  return page.evaluate((wordKey) => {
    const splashRoot = document.querySelector(".home-splash-overlay");
    const stackOrderOk = (x, y, contentEl) => {
      const stack = document.elementsFromPoint(x, y);
      const contentIdx = stack.findIndex(
        (el) => el === contentEl || contentEl.contains(el),
      );
      if (contentIdx === -1) {
        return { ok: false, reason: "content not in paint stack" };
      }
      const splashIdx = stack.findIndex(
        (el) => el === splashRoot || el.closest?.(".home-splash-overlay"),
      );
      if (splashIdx === -1) return { ok: true };
      return {
        ok: contentIdx < splashIdx,
        splashIdx,
        contentIdx,
        top: stack[0]?.className?.toString?.().slice(0, 80) ?? null,
      };
    };
    const primary = [
      ...document.querySelectorAll("a.home-closing-link--primary"),
    ].find((n) => n.textContent?.trim().toLowerCase() === wordKey);
    const probes = [
      { id: "primary", el: primary },
      { id: "email", el: document.querySelector(".home-footer__email-text") },
      {
        id: "pill",
        el: document.querySelector(".home-footer__social-pill-label"),
      },
    ];
    const failures = [];
    for (const { id, el } of probes) {
      if (!el) {
        failures.push({ id, reason: "missing" });
        continue;
      }
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const order = stackOrderOk(x, y, el);
      if (!order.ok) failures.push({ id, ...order });
    }
    return { ok: failures.length === 0, failures };
  }, word);
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

async function checkNavLogoVisible(page) {
  return page.evaluate(() => {
    const logo = document.querySelector(".home-navbar .home-logo");
    if (!logo) return { ok: false, reason: "missing .home-logo" };
    const cs = getComputedStyle(logo);
    const rect = logo.getBoundingClientRect();
    return {
      ok:
        Number(cs.opacity) > 0.1 &&
        cs.display !== "none" &&
        cs.visibility !== "hidden" &&
        rect.width > 8 &&
        rect.height > 8,
      width: rect.width,
      height: rect.height,
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
  await page.waitForTimeout(400);
}

async function screenshotViewport(page, filePath) {
  const buf = await page.screenshot({ type: "png", fullPage: false });
  const meta = await sharp(buf).metadata();
  if (filePath) await writeFile(filePath, buf);
  return { width: meta.width, height: meta.height, buffer: buf };
}

async function mobileNavScrollPositions(page) {
  return page.evaluate(() => {
    const max = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight,
    );
    const out = new Set([0, Math.round(max * 0.33), Math.round(max * 0.66), max]);
    for (const id of ["builder", "creator", "educator"]) {
      const band = document.getElementById(id);
      if (band) {
        const y = Math.round(
          band.getBoundingClientRect().top + window.scrollY - 48,
        );
        out.add(Math.max(0, Math.min(max, y)));
      }
    }
    const buildingRow = document.querySelector(
      'a.home-closing-link--mobile[data-splash-key="building"]',
    );
    if (buildingRow) {
      const y = Math.round(
        buildingRow.getBoundingClientRect().top + window.scrollY - 56,
      );
      out.add(Math.max(0, Math.min(max, y)));
    }
    return [...out].sort((a, b) => a - b);
  });
}

async function sampleMobileNavAt(page, scrollY) {
  await page.evaluate((y) => window.scrollTo(0, y), scrollY);
  await page.waitForTimeout(280);
  return page.evaluate((y) => {
    const nav = document.querySelector(".home-navbar");
    const meta = document.querySelector('meta[name="theme-color"]');
    const navBg = nav ? getComputedStyle(nav).backgroundColor : "";
    return {
      scrollY: y,
      pageAccent: document.documentElement.dataset.pageAccent ?? "",
      navBg,
      themeColor: meta?.getAttribute("content") ?? "",
    };
  }, scrollY);
}

async function collect390NavProfile(browser, baseUrl, label) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await waitForUiSettled(page);
  const positions = await mobileNavScrollPositions(page);
  const samples = [];
  for (const y of positions) {
    samples.push(await sampleMobileNavAt(page, y));
  }
  const buildingY = positions.find((y) => y > 0) ?? 0;
  await sampleMobileNavAt(page, buildingY);
  const navShotPath = path.join(OUT, `390-nav-${label}-building-row.png`);
  await screenshotViewport(page, navShotPath);
  await context.close();
  return { label, samples, buildingRowScreenshot: navShotPath };
}

function navBgClose(aCss, bCss) {
  const a = parseCssRgb(aCss);
  const b = parseCssRgb(bCss);
  if (!a || !b) return normalizeCssColor(aCss) === normalizeCssColor(bCss);
  return dist(a, b) <= 36;
}

function navSampleMatchesMain(main, branch) {
  if (main.scrollY !== branch.scrollY) return false;
  if (main.pageAccent !== branch.pageAccent) return false;
  if (normalizeCssColor(main.themeColor) !== normalizeCssColor(branch.themeColor))
    return false;
  return navBgClose(main.navBg, branch.navBg);
}

function navProfilesMatch(mainSamples, branchSamples) {
  if (mainSamples.length !== branchSamples.length) return false;
  const mismatches = [];
  for (let i = 0; i < mainSamples.length; i += 1) {
    if (!navSampleMatchesMain(mainSamples[i], branchSamples[i])) {
      mismatches.push({
        scrollY: mainSamples[i].scrollY,
        main: mainSamples[i],
        branch: branchSamples[i],
      });
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

function assert390NavMatchesMain(mainSamples, branchSamples) {
  return navProfilesMatch(mainSamples, branchSamples);
}

async function runProvePass(browser, baseUrl, runLabel) {
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
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
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
    const restShot = path.join(OUT, `${runLabel}-${viewportLabel}-rest.png`);
    const restShotMeta = await screenshotViewport(page, restShot);
    const navLogoRest = await checkNavLogoVisible(page);
    const restViewportBuf = restShotMeta.buffer;
    const restContrasts = isMobile
      ? []
      : await measureContrastsFromViewportShot(page, "building", restViewportBuf);

    const restStripe = hasStripeFromRows(restRows);
    const restOk = isMobile
      ? restCounts.beige >= restSamples.length * 0.85
      : restCounts.beige >= restSamples.length * 0.85 &&
        !restStripe &&
        restContrasts.every((c) => c.ok) &&
        navLogoRest.ok;
    if (!restOk) failed = true;
    results.push({
      viewport: viewportLabel,
      state: "rest",
      ok: restOk,
      pixelCounts: restCounts,
      stripe: restStripe,
      contrasts: restContrasts,
      navLogo: navLogoRest,
      screenshotPixels: { width: restShotMeta.width, height: restShotMeta.height },
    });

    if (!isMobile && tailRectDesktop) {
      for (const word of WORDS) {
        await page.evaluate(() => {
          delete document.documentElement.dataset.homeSplash;
        });
        await page.waitForTimeout(150);
        await hoverPrimary(page, word);
        const hitTest = await assertHitTestContentAboveSplash(page, word);
        const zOrder = await assertSplashBelowChrome(page);
        const { allSamples: hoverSamples, rowSamples: hoverRows } =
          await sampleTailPixelsDense(page, tailRectDesktop);
        const hoverCounts = classifySamples(hoverSamples);
        const hoverShotMeta = await screenshotViewport(page, null);
        const hoverContrasts = await measureContrastsFromViewportShot(
          page,
          word,
          hoverShotMeta.buffer,
        );
        const bgAudit = await auditTailOpaqueBackgrounds(page);
        const beigeBand = hasBeigeBandOnHover(hoverRows);
        const xs = hoverSamples.map((s) => s.x);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const centerSamples = hoverSamples.filter(
          (s) => s.x >= minX + (maxX - minX) * 0.25 && s.x <= minX + (maxX - minX) * 0.75,
        );
        const splashFilled =
          hoverCounts[word] >= hoverSamples.length * 0.75 &&
          (centerSamples.length === 0 ||
            centerSamples.filter((s) => s.label === word).length >=
              centerSamples.length * 0.7);
        const hoverOk =
          splashFilled &&
          hitTest.ok &&
          zOrder.ok &&
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
          hitTest,
          zOrder,
          opaqueBgOffenders: bgAudit.offenders,
          contrasts: hoverContrasts,
          screenshotPixels: hoverShotMeta,
        });

        await page.mouse.move(8, viewport.height - 8);
        await page.waitForTimeout(400);
        const { allSamples: exitSamples, rowSamples: exitRows } =
          await sampleTailPixelsDense(page, tailRectDesktop);
        const exitStripe = hasStripeFromRows(exitRows);
        const exitOk = !exitStripe;
        if (!exitOk) failed = true;
        results.push({
          viewport: viewportLabel,
          state: `exitfade-${word}`,
          ok: exitOk,
          stripe: exitStripe,
          pixelCounts: classifySamples(exitSamples),
        });
      }
    }

    await context.close();
  }

  return { runLabel, failed, results, table: resultsTable(results) };
}

async function runNegativeSelfTests(browser, baseUrl) {
  const negatives = [];

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await scrollToClosing(page);
  await hoverPrimary(page, "building");
  await page.evaluate(() => {
    const splash = document.querySelector(".home-splash-overlay");
    if (splash) splash.style.zIndex = "50";
  });
  await page.waitForTimeout(80);
  const zHit = await assertHitTestContentAboveSplash(page, "building");
  const zOrderBroken = await assertSplashBelowChrome(page);
  negatives.push({
    name: "inject-splash-z-index-50",
    expectProveFail: true,
    detectedFailure: !zOrderBroken.ok,
    detail: { hitTest: zHit, zOrder: zOrderBroken },
  });
  await context.close();

  const mobileCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const mobilePage = await mobileCtx.newPage();
  await mobilePage.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await waitForUiSettled(mobilePage);
  const buildingY = await mobilePage.evaluate(() => {
    const band = document.getElementById("builder");
    if (!band) return 0;
    return Math.max(
      0,
      Math.round(band.getBoundingClientRect().top + window.scrollY - 48),
    );
  });
  await sampleMobileNavAt(mobilePage, buildingY);
  await mobilePage.evaluate(() => {
    const nav = document.querySelector(".home-navbar");
    if (nav) nav.style.backgroundColor = "rgb(231, 221, 204)";
  });
  const forced = await sampleMobileNavAt(mobilePage, buildingY);
  const mainBaselineAtBuilder = {
    pageAccent: "builder",
    themeColor: "#398fd0",
    navBg: "rgb(57, 143, 208)",
  };
  const navCheckWouldFail = !navSampleMatchesMain(
    { scrollY: buildingY, ...mainBaselineAtBuilder },
    forced,
  );
  negatives.push({
    name: "force-beige-nav-accent-at-390",
    expectProveFail: true,
    detectedFailure: navCheckWouldFail,
    detail: forced,
  });
  await mobileCtx.close();

  const ok = negatives.every((n) => n.detectedFailure === n.expectProveFail);
  return { ok, negatives };
}

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

let mobileNavCompare = {
  ok: false,
  skipped: true,
  reason: "MAIN_PREVIEW_URL not set",
};
if (MAIN_BASE) {
  const mainProfile = await collect390NavProfile(browser, MAIN_BASE, "main");
  const branchProfile = await collect390NavProfile(browser, BASE, "branch");
  const { ok: match, mismatches } = navProfilesMatch(
    mainProfile.samples,
    branchProfile.samples,
  );
  mobileNavCompare = {
    ok: match,
    skipped: false,
    main: mainProfile,
    branch: branchProfile,
    mismatches,
  };
}

const run1 = await runProvePass(browser, BASE, "run1");
const run2 = await runProvePass(browser, BASE, "run2");
const negatives = await runNegativeSelfTests(browser, BASE);

await browser.close();

const report = {
  mobileNavCompare,
  negatives,
  run1: { failed: run1.failed, exitCode: run1.failed ? 1 : 0, table: run1.table },
  run2: { failed: run2.failed, exitCode: run2.failed ? 1 : 0, table: run2.table },
};

const reportPath = path.join(OUT, "pixel-results.json");
await writeFile(reportPath, JSON.stringify(report, null, 2));

console.log("=== mobile 390 nav vs main ===");
console.log(JSON.stringify(mobileNavCompare, null, 2));
console.log("=== negative self-tests ===");
console.log(JSON.stringify(negatives, null, 2));
console.log("=== prove run 1 (exit", run1.failed ? 1 : 0, ") ===");
console.table(run1.table);
console.log("=== prove run 2 (exit", run2.failed ? 1 : 0, ") ===");
console.table(run2.table);

const failed =
  run1.failed ||
  run2.failed ||
  !negatives.ok ||
  (!mobileNavCompare.skipped && !mobileNavCompare.ok);

if (failed) {
  console.error("prove-closing-tail-splash-fill: FAILED");
  process.exit(1);
}
console.log("prove-closing-tail-splash-fill: OK");
