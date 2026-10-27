/**
 * Stacked primary words (md–lg): ink must not bridge between words; ≥1 clear beige row between.
 */
import sharp from "sharp";
import {
  hideDriftingCursors,
  inkExtentsInRect,
  isBeigeRgb,
  isInkRgb,
} from "./measure-closing-visible-gaps.mjs";

export const STACKED_PRIMARY_VIEWPORTS = [
  { width: 768, height: 1024 },
  { width: 800, height: 1024 },
  { width: 900, height: 900 },
  { width: 1023, height: 768 },
];

function rowHasClearBeigeGap(rgba, imgW, x0, x1, y, minBeigeFraction = 0.92) {
  let beige = 0;
  let total = 0;
  for (let x = x0; x < x1; x += 1) {
    const i = (y * imgW + x) * 4;
    const rgb = [rgba[i], rgba[i + 1], rgba[i + 2]];
    total += 1;
    if (isBeigeRgb(rgb)) beige += 1;
    else if (isInkRgb([...rgb, rgba[i + 3]])) return false;
  }
  return total > 0 && beige / total >= minBeigeFraction;
}

function underlineTouchesGlyphBelow(rgba, imgW, rect, ink) {
  if (!ink) return false;
  const x0 = Math.floor(rect.left + rect.width * 0.2);
  const x1 = Math.ceil(rect.right - rect.width * 0.2);
  const yStart = Math.floor(ink.bottom);
  const yEnd = Math.min(
    Math.floor(rect.bottom),
    yStart + Math.max(8, Math.round((ink.bottom - ink.top) * 0.35)),
  );
  let underlineY = null;
  for (let y = yStart; y < yEnd; y += 1) {
    let inkPx = 0;
    for (let x = x0; x < x1; x += 1) {
      const i = (y * imgW + x) * 4;
      if (isInkRgb([rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]])) inkPx += 1;
    }
    if (inkPx >= Math.max(3, (x1 - x0) * 0.08)) {
      underlineY = y;
      break;
    }
  }
  if (underlineY == null) return false;
  for (let y = underlineY + 1; y < Math.min(underlineY + 4, yEnd); y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * imgW + x) * 4;
      if (isInkRgb([rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]])) {
        return true;
      }
    }
  }
  return false;
}

export async function measureStackedPrimaryInkSeparation(page) {
  await hideDriftingCursors(page);
  const links = await page.evaluate(() =>
    [...document.querySelectorAll("a.home-closing-link--primary")].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        label: (el.textContent ?? "").trim(),
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    }),
  );
  if (links.length < 2) {
    return { ok: false, reason: "expected-stacked-primaries", links };
  }

  const shot = await page.screenshot({ type: "png", animations: "disabled" });
  const { data, info } = await sharp(shot).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  const imgW = info.width;

  const words = links.map((rect) => {
    const ink = inkExtentsInRect(data, imgW, rect);
    const underlineTouch = underlineTouchesGlyphBelow(data, imgW, rect, ink);
    return { ...rect, ink, underlineTouch };
  });

  const pairs = [];
  let ok = true;
  for (let i = 0; i < words.length - 1; i += 1) {
    const a = words[i];
    const b = words[i + 1];
    if (!a.ink || !b.ink) {
      ok = false;
      pairs.push({
        from: a.label,
        to: b.label,
        ok: false,
        reason: "missing-ink",
      });
      continue;
    }
    const gapPx = b.ink.top - a.ink.bottom;
    const x0 = Math.floor(
      Math.max(a.left, b.left) + Math.min(a.width, b.width) * 0.25,
    );
    const x1 = Math.ceil(
      Math.min(a.right, b.right) - Math.min(a.width, b.width) * 0.25,
    );
    let clearRow = false;
    for (let y = Math.floor(a.ink.bottom); y < Math.floor(b.ink.top); y += 1) {
      if (rowHasClearBeigeGap(data, imgW, x0, x1, y)) {
        clearRow = true;
        break;
      }
    }
    const pairOk = gapPx >= 1 && clearRow;
    if (!pairOk) ok = false;
    pairs.push({
      from: a.label,
      to: b.label,
      gapPx: Math.round(gapPx * 10) / 10,
      clearRow,
      ok: pairOk,
    });
  }

  for (const w of words) {
    if (w.underlineTouch) {
      ok = false;
      w.underlineOk = false;
    } else {
      w.underlineOk = true;
    }
  }

  return { ok, words, pairs };
}

export async function runStackedPrimaryInkGate(browser, baseUrl) {
  const rows = [];
  let ok = true;
  for (const viewport of STACKED_PRIMARY_VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
    await page.evaluate(() => {
      document.documentElement.dataset.introSkip = "1";
    });
    await page.evaluate(async () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.max(0, max));
      await new Promise((r) => setTimeout(r, 400));
    });
    await page.waitForTimeout(1500);
    const result = await measureStackedPrimaryInkSeparation(page);
    rows.push({
      viewport: `${viewport.width}x${viewport.height}`,
      ...result,
    });
    if (!result.ok) ok = false;
    await ctx.close();
  }
  return { ok, rows };
}
