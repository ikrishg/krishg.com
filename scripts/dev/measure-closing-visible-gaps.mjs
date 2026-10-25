/**
 * Visible ink gaps from viewport screenshots (design gate).
 * Hides drifting cursors, scans non-beige pixels inside each row block.
 */
import sharp from "sharp";

export const BEIGE = [231, 221, 204];
export const BEIGE_DIST_THRESHOLD = 28;
export const GAP_MEAN_TOLERANCE = 0.1;

export function colorDist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function isBeigeRgb(rgb) {
  return colorDist(rgb, BEIGE) < BEIGE_DIST_THRESHOLD;
}

export function isInkRgb(rgb) {
  if (isBeigeRgb(rgb)) return false;
  const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  if (lum > 248) return false;
  if (rgb[3] !== undefined && rgb[3] < 40) return false;
  return true;
}

/**
 * @param {Buffer} rgba - raw RGBA from sharp
 * @param {number} imgW
 * @param {{left:number,top:number,right:number,bottom:number}} rect
 */
export function inkExtentsInRect(rgba, imgW, rect) {
  const x0 = Math.max(0, Math.floor(rect.left));
  const x1 = Math.min(imgW, Math.ceil(rect.right));
  const y0 = Math.max(0, Math.floor(rect.top));
  const y1 = Math.min(
    Math.floor(rgba.length / (imgW * 4)),
    Math.ceil(rect.bottom),
  );
  let top = Infinity;
  let bottom = -Infinity;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * imgW + x) * 4;
      const rgb = [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]];
      if (!isInkRgb(rgb)) continue;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (!Number.isFinite(top)) return null;
  return { top, bottom };
}

export function unionExtents(list) {
  let top = Infinity;
  let bottom = -Infinity;
  for (const e of list) {
    if (!e) continue;
    top = Math.min(top, e.top);
    bottom = Math.max(bottom, e.bottom);
  }
  if (!Number.isFinite(top)) return null;
  return { top, bottom };
}

export function evaluateVisibleGapBar(gaps) {
  const rounded = gaps.map((g) => Math.round(g * 10) / 10);
  const min = Math.min(...rounded);
  const max = Math.max(...rounded);
  const mean = rounded.reduce((sum, g) => sum + g, 0) / rounded.length;
  const tol = mean * GAP_MEAN_TOLERANCE + 0.5;
  const withinTolerance = rounded.every((g) => Math.abs(g - mean) <= tol);
  const collisions = rounded.filter((g) => g < 0);
  const ok =
    rounded.length >= 3 &&
    collisions.length === 0 &&
    min > 4 &&
    withinTolerance;
  return {
    ok,
    gaps: rounded,
    min,
    max,
    mean: Math.round(mean * 10) / 10,
    ratio: min > 0 ? Math.round((max / min) * 1000) / 1000 : null,
    collisions,
    tolerancePx: Math.round(tol * 10) / 10,
  };
}

export async function hideDriftingCursors(page) {
  await page.evaluate(() => {
    const root = document.querySelector(".home-drifting-cursors");
    if (root) root.style.visibility = "hidden";
  });
}

export async function showDriftingCursors(page) {
  await page.evaluate(() => {
    const root = document.querySelector(".home-drifting-cursors");
    if (root) root.style.visibility = "";
  });
}

export async function collectRowRects(page) {
  return page.evaluate(() => {
    const navBottom =
      document.querySelector(".home-navbar")?.getBoundingClientRect().bottom ??
      64;
    const blockRect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const pills = [...document.querySelectorAll(".home-footer__social-pill")].map(
      (el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      },
    );
    return {
      navBottom,
      vh: window.innerHeight,
      nav: blockRect(".home-closing-index__nav"),
      primary: blockRect(".home-closing-index__primary"),
      email: blockRect(".home-footer__email"),
      pills,
    };
  });
}

/**
 * @param {import('playwright').Page} page
 * @param {Buffer} [pngBuffer] - optional pre-captured viewport PNG
 */
export async function measureDesktopVisibleGaps(page, pngBuffer) {
  await hideDriftingCursors(page);
  const rects = await collectRowRects(page);
  const shot =
    pngBuffer ??
    (await page.screenshot({ type: "png", animations: "disabled" }));
  const { data, info } = await sharp(shot)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const imgW = info.width;

  const navInk = inkExtentsInRect(data, imgW, rects.nav);
  const primaryInk = inkExtentsInRect(data, imgW, rects.primary);
  const emailInk = inkExtentsInRect(data, imgW, rects.email);
  const pillInks = rects.pills.map((r) => inkExtentsInRect(data, imgW, r));
  const socialInk = unionExtents(pillInks);

  await showDriftingCursors(page);

  if (!navInk || !primaryInk || !emailInk || !socialInk) {
    return {
      ok: false,
      reason: "missing-ink-extents",
      rects,
      navInk,
      primaryInk,
      emailInk,
      socialInk,
    };
  }

  const gaps = [
    navInk.top - rects.navBottom,
    primaryInk.top - navInk.bottom,
    emailInk.top - primaryInk.bottom,
    socialInk.top - emailInk.bottom,
    rects.vh - socialInk.bottom,
  ];
  const bar = evaluateVisibleGapBar(gaps);
  return { ...bar, rects, method: "visible-pixel" };
}
