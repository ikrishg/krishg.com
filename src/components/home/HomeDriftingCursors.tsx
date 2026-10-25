import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import {
  buildEasterEggRoster,
  type EasterEggCursorDef,
} from "./homeDriftingEasterEggs";

const REF_FOOTER_W = 1440;
const TINY_VIEWPORT_W = 390;

const DEFAULT_BOX_W = 110;
const CURSOR_BOX_H = 46;
const NARROW_ROOT_SCALE = 0.9;

const SPRING_K = 150;
const SPRING_C = 2 * Math.sqrt(SPRING_K) * 0.92;

type Rect = { x: number; y: number; w: number; h: number };

type FooterSliceLayout = {
  w: number;
  h: number;
  gutter: number;
  headerH: number;
  bottomH: number;
  emailTop: number;
  emailBottom: number;
  socialTop: number;
  socialBottom: number;
  bandTop: number;
  contentLeft: number;
  contentRight: number;
  emailRect: Rect | null;
  pillRects: Rect[];
};

/** Full `.home-closing-tail` walk space (tail-local coordinates). */
type LandscapeLayout = FooterSliceLayout & {
  footerTop: number;
  footerH: number;
};

/** Email + pill pads for placement/path (full tip+tag box @≤820). */
type ChromeKeepContext = {
  closing: Rect[];
  contact: Rect[];
  layout?: LandscapeLayout;
};

function chromeCtx(
  closing: Rect[],
  contact: Rect[],
  layout?: LandscapeLayout | null,
): ChromeKeepContext {
  const ctx: ChromeKeepContext = { closing, contact };
  if (layout != null) ctx.layout = layout;
  return ctx;
}

function midWidthHardContact(ctx: ChromeKeepContext) {
  return ctx.layout != null && ctx.layout.w <= 820;
}

type CursorDef = EasterEggCursorDef;

type StudioCursorState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  leadX: number;
  leadY: number;
  wait: number;
  hidden?: boolean;
  seg: null | {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    t: number;
    dur: number;
  };
  idlePhase: number;
  stillLeadSec: number;
  lastSampleLeadX: number;
  lastSampleLeadY: number;
};

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function scaleX(x: number, w: number) {
  return x * (w / REF_FOOTER_W);
}

function rectsOverlap(a: Rect, b: Rect) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function cursorBoxAt(x: number, y: number, pad = 0, boxW = DEFAULT_BOX_W): Rect {
  return {
    x: x - 4 - pad,
    y: y - 4 - pad,
    w: boxW + pad * 2,
    h: CURSOR_BOX_H + pad * 2,
  };
}

/** Clip pointer+tag box to a walk column so wide tags do not false-hit center keep-outs. */
function cursorBoxInRegion(
  x: number,
  y: number,
  region: Rect,
  pad = 0,
  boxW = DEFAULT_BOX_W,
): Rect {
  const box = cursorBoxAt(x, y, pad, boxW);
  let { x: bx, y: by, w: bw, h: bh } = box;
  const left = region.x;
  const right = region.x + region.w;
  const top = region.y;
  const bottom = region.y + region.h;
  if (bx < left) {
    bw -= left - bx;
    bx = left;
  }
  if (by < top) {
    bh -= top - by;
    by = top;
  }
  if (bx + bw > right) {
    bw = Math.max(20, right - bx);
  }
  if (by + bh > bottom) {
    bh = Math.max(20, bottom - by);
  }
  return { x: bx, y: by, w: bw, h: bh };
}

function anchorXRangeInRegion(
  region: Rect,
  boxW = DEFAULT_BOX_W,
  layout?: LandscapeLayout,
) {
  const edge = 10;
  const minX = region.x + edge;
  const maxX = region.x + region.w - (boxW - 4) - edge;
  if (!layout || layout.w > 820) {
    return { minX, maxX: Math.max(minX, maxX) };
  }
  const leftCol = region.x + region.w <= layout.contentLeft + 6;
  const rightCol = region.x >= layout.contentRight - 6;
  if (leftCol && maxX < minX) {
    // Hug the outer gutter so wide tags stay left of center primaries.
    const outerX = region.x + region.w - edge;
    return { minX: outerX, maxX: outerX };
  }
  if (rightCol && maxX < minX) {
    const outerX = region.x + edge;
    return { minX: outerX, maxX: outerX };
  }
  return { minX, maxX: Math.max(minX, maxX) };
}

function randomAnchorInRegion(
  region: Rect,
  boxW = DEFAULT_BOX_W,
  layout?: LandscapeLayout,
) {
  const { minX, maxX } = anchorXRangeInRegion(region, boxW, layout);
  return {
    x: randomBetween(minX, maxX),
    y: randomBetween(region.y + 8, region.y + region.h - 8),
  };
}

/** Pointer + tag bounds for narrow static (root scale 0.9). */
function narrowStaticCursorBoxAt(
  x: number,
  y: number,
  pad = 0,
  boxW = DEFAULT_BOX_W,
): Rect {
  const sx = x * NARROW_ROOT_SCALE;
  const sy = y * NARROW_ROOT_SCALE;
  const w = boxW * NARROW_ROOT_SCALE;
  const h = CURSOR_BOX_H * NARROW_ROOT_SCALE;
  return {
    x: sx - 4 - pad,
    y: sy - 4 - pad,
    w: w + pad * 2,
    h: h + pad * 2,
  };
}

const NARROW_STATIC_PAD = 16;

function buildNarrowStaticKeepOuts(layout: LandscapeLayout, w: number, h: number): Rect[] {
  const keep: Rect[] = [
    { x: 0, y: 0, w, h: layout.headerH },
    { x: 0, y: h - layout.bottomH, w, h: layout.bottomH },
    { x: 0, y: 0, w: layout.gutter, h },
    { x: w - layout.gutter, y: 0, w: layout.gutter, h },
  ];
  if (layout.emailRect) {
    keep.push(padRect(layout.emailRect, 64, 56));
  }
  for (const pr of layout.pillRects) {
    keep.push(padRect(pr, 64, 56));
  }
  return keep;
}

function narrowStaticPoseClear(
  x: number,
  y: number,
  keepOuts: Rect[],
  pad = NARROW_STATIC_PAD,
  boxW = DEFAULT_BOX_W,
) {
  return !hitKeepOut(narrowStaticCursorBoxAt(x, y, pad, boxW), keepOuts);
}

type NarrowStaticPose = { x: number; y: number } | null;

let narrowStaticPoseCache: {
  key: string;
  poses: Record<string, NarrowStaticPose>;
} | null = null;

function narrowStaticLayoutKey(layout: LandscapeLayout) {
  const er = layout.emailRect;
  const pills = layout.pillRects
    .map((r) => `${r.x.toFixed(1)},${r.y.toFixed(1)},${r.w.toFixed(1)},${r.h.toFixed(1)}`)
    .join("|");
  return [
    layout.w,
    layout.h,
    layout.bandTop,
    layout.emailTop,
    layout.socialBottom,
    er ? `${er.x},${er.y},${er.w},${er.h}` : "",
    pills,
  ].join(":");
}

function narrowStaticYAboveEmail(layout: LandscapeLayout, edge: number) {
  const { bandTop, emailRect } = layout;
  if (!emailRect) return [];
  const boxH = CURSOR_BOX_H * NARROW_ROOT_SCALE;
  const maxY = (emailRect.y - edge - boxH + 4) / NARROW_ROOT_SCALE;
  const minY = bandTop + edge;
  if (maxY <= minY + 6) return [];
  const ys: number[] = [];
  for (const t of [0.15, 0.32, 0.5, 0.68, 0.85]) {
    ys.push(minY + (maxY - minY) * t);
  }
  return ys;
}

function narrowStaticYBelowPills(layout: LandscapeLayout, edge: number) {
  const { h, socialBottom, bottomH } = layout;
  const boxH = CURSOR_BOX_H * NARROW_ROOT_SCALE;
  const minY = (socialBottom + edge + 4) / NARROW_ROOT_SCALE;
  const maxY = (h - bottomH - edge - boxH + 4) / NARROW_ROOT_SCALE;
  if (maxY <= minY + 6) return [];
  const ys: number[] = [];
  for (const t of [0.2, 0.45, 0.7, 0.9]) {
    ys.push(minY + (maxY - minY) * t);
  }
  return ys;
}

function solveNarrowStaticPoses(
  layout: LandscapeLayout,
  roster: CursorDef[],
): Record<string, NarrowStaticPose> {
  const key = `${narrowStaticLayoutKey(layout)}:${roster.map((d) => d.id).join("|")}`;
  if (narrowStaticPoseCache?.key === key) return narrowStaticPoseCache.poses;

  const keep = buildNarrowStaticKeepOuts(layout, layout.w, layout.h);
  const { w, gutter } = layout;
  const edge = 14;
  const xLeft = gutter + edge;
  const xRight = w - gutter - edge;

  const yAbove = narrowStaticYAboveEmail(layout, edge);
  const yBelow = narrowStaticYBelowPills(layout, edge);
  const ySlots = [...yAbove, ...yBelow];

  const poses: Record<string, NarrowStaticPose> = {};
  const reserved: Rect[] = [];

  for (const def of roster) {
    const preferLeft = def.regionIndex % 2 === 0;
    const xs = preferLeft
      ? [xLeft, xLeft + 10, xRight]
      : [xRight, xRight - 10, xLeft + 18];
    const ys =
      yAbove.length > 0
        ? preferLeft
          ? yAbove
          : [...yAbove].reverse()
        : ySlots;

    let placed: NarrowStaticPose = null;
    for (const y of ys) {
      for (const x of xs) {
        const trial = [...keep, ...reserved];
        if (!narrowStaticPoseClear(x, y, trial, NARROW_STATIC_PAD, def.boxW)) {
          continue;
        }
        placed = { x, y };
        reserved.push(narrowStaticCursorBoxAt(x, y, 12, def.boxW));
        break;
      }
      if (placed) break;
    }
    poses[def.id] = placed;
  }

  narrowStaticPoseCache = { key, poses };
  return poses;
}

function narrowStaticPoseFor(
  def: CursorDef,
  layout: LandscapeLayout,
  roster: CursorDef[],
): NarrowStaticPose {
  return solveNarrowStaticPoses(layout, roster)[def.id] ?? null;
}

function hitKeepOut(box: Rect, keepOuts: Rect[]) {
  return keepOuts.some((k) => rectsOverlap(box, k));
}

function hitsPlacementKeeps(
  x: number,
  y: number,
  region: Rect | undefined,
  boxW: number,
  keepOuts: Rect[],
  ctx: ChromeKeepContext,
  pad = 0,
) {
  const closingSet = new Set(ctx.closing);
  const contactSet = new Set(ctx.contact);
  const hardContact = midWidthHardContact(ctx);
  const clipped = region
    ? cursorBoxInRegion(x, y, region, pad, boxW)
    : cursorBoxAt(x, y, pad, boxW);
  const full = cursorBoxAt(x, y, pad, boxW);
  for (const k of keepOuts) {
    const box =
      closingSet.has(k) || (hardContact && contactSet.has(k)) ? full : clipped;
    if (rectsOverlap(box, k)) return true;
  }
  return false;
}

function pathClear(
  from: { x: number; y: number },
  to: { x: number; y: number },
  keepOuts: Rect[],
  samplePad = 8,
  region?: Rect,
  boxW = DEFAULT_BOX_W,
  ctx: ChromeKeepContext = chromeCtx([], []),
) {
  const fromInside = hitsPlacementKeeps(
    from.x,
    from.y,
    region,
    boxW,
    keepOuts,
    ctx,
    samplePad,
  );
  const startSample = fromInside ? 1 : 0;
  for (let i = startSample; i <= 24; i += 1) {
    const t = i / 24;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    if (hitsPlacementKeeps(x, y, region, boxW, keepOuts, ctx, samplePad)) {
      return false;
    }
  }
  return true;
}

function toContainerLocal(rect: DOMRect, container: DOMRect) {
  return {
    x: rect.left - container.left,
    y: rect.top - container.top,
    w: rect.width,
    h: rect.height,
  };
}

function padRect(r: Rect, padX: number, padY: number): Rect {
  return {
    x: r.x - padX,
    y: r.y - padY,
    w: r.w + padX * 2,
    h: r.h + padY * 2,
  };
}

/** Footer uses `display: contents` on desktop; union email + social when the box is 0×0. */
function footerMeasureRect(footer: HTMLElement): DOMRect {
  const measure = footer.querySelector<HTMLElement>(".home-footer__cursor-measure");
  if (measure) {
    const mr = measure.getBoundingClientRect();
    if (mr.width > 2 && mr.height > 2) return mr;
  }
  const fr = footer.getBoundingClientRect();
  if (fr.width > 2 && fr.height > 2) return fr;
  const parts = [
    footer.querySelector<HTMLElement>(".home-footer__email"),
    footer.querySelector<HTMLElement>(".home-footer__social"),
  ].filter((el): el is HTMLElement => Boolean(el));
  if (!parts.length) return fr;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const el of parts) {
    const r = el.getBoundingClientRect();
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }
  if (!Number.isFinite(left)) return fr;
  return new DOMRect(left, top, right - left, bottom - top);
}

function readFooterSliceLayout(
  footer: HTMLElement,
  w: number,
  footerH: number,
  footerOrigin: DOMRect,
): FooterSliceLayout {
  const fr = footerOrigin;
  const email = footer.querySelector<HTMLElement>(".home-footer__email");
  const pills = footer.querySelectorAll<HTMLElement>(".home-footer__social-pill");

  let emailTop = footerH * 0.28;
  let emailBottom = footerH * 0.48;
  let contentLeft = w * 0.12;
  let contentRight = w * 0.88;
  let emailRect: Rect | null = null;
  const pillRects: Rect[] = [];
  if (email) {
    const er = toContainerLocal(email.getBoundingClientRect(), fr);
    emailTop = er.y;
    emailBottom = er.y + er.h;
    contentLeft = er.x;
    contentRight = er.x + er.w;
    emailRect = er;
  }

  let socialTop = footerH * 0.62;
  let socialBottom = footerH - 6;
  if (pills.length > 0) {
    let minY = Infinity;
    let maxY = -Infinity;
    pills.forEach((pill) => {
      const pr = toContainerLocal(pill.getBoundingClientRect(), fr);
      pillRects.push(pr);
      minY = Math.min(minY, pr.y);
      maxY = Math.max(maxY, pr.y + pr.h);
      contentLeft = Math.min(contentLeft, pr.x);
      contentRight = Math.max(contentRight, pr.x + pr.w);
    });
    if (Number.isFinite(minY)) {
      socialTop = minY;
      socialBottom = maxY;
    }
  }

  const gutter = Math.min(scaleX(64, w), w * 0.08);
  const headerH = Math.min(footerH * 0.18, 72);
  const bottomH = Math.min(footerH * 0.1, 40);

  return {
    w,
    h: footerH,
    gutter,
    headerH,
    bottomH,
    emailTop,
    emailBottom,
    socialTop,
    socialBottom,
    bandTop: headerH,
    contentLeft,
    contentRight,
    emailRect,
    pillRects,
  };
}

function readClosingTailLandscape(
  tail: HTMLElement,
  footer: HTMLElement,
): LandscapeLayout {
  const tr = tail.getBoundingClientRect();
  const fr = footerMeasureRect(footer);
  const w = Math.max(1, tr.width);
  const h = Math.max(1, tr.height);
  const footerTop = Math.max(0, fr.top - tr.top);
  const footerH = Math.max(1, fr.height);
  const slice = readFooterSliceLayout(footer, w, footerH, fr);

  const offsetY = (r: Rect) => ({ ...r, y: r.y + footerTop });

  return {
    ...slice,
    w,
    h,
    bandTop: 0,
    headerH: 0,
    footerTop,
    footerH,
    emailTop: footerTop + slice.emailTop,
    emailBottom: footerTop + slice.emailBottom,
    socialTop: footerTop + slice.socialTop,
    socialBottom: footerTop + slice.socialBottom,
    emailRect: slice.emailRect ? offsetY(slice.emailRect) : null,
    pillRects: slice.pillRects.map(offsetY),
  };
}

const SIDE_COL_MIN_W = 180;

function stackedPrimaryBottom(
  closingKeepOuts: Rect[],
  layout: LandscapeLayout,
): number | null {
  let bottom = -Infinity;
  let sawWide = false;
  for (const k of closingKeepOuts) {
    if (k.w < layout.w * 0.42) continue;
    sawWide = true;
    bottom = Math.max(bottom, k.y + k.h);
  }
  return sawWide && Number.isFinite(bottom) ? bottom : null;
}

function sixLandscapeRegions(
  layout: LandscapeLayout,
  closingKeepOuts: Rect[] = [],
): Rect[] {
  const { w, h, gutter, bandTop, bottomH, contentLeft, contentRight } = layout;
  const midWidth = w <= 820;
  const minPocketH =
    midWidth ? CURSOR_BOX_H + 20 : CURSOR_BOX_H + 28;

  let y0 = bandTop;
  let y1 = h - bottomH;

  const stackBottom = stackedPrimaryBottom(closingKeepOuts, layout);
  if (stackBottom != null) {
    y0 = Math.max(y0, stackBottom + (midWidth ? 10 : 8));
  }

  if (midWidth && layout.emailTop > y0 + minPocketH) {
    y1 = Math.min(y1, layout.emailTop - 10);
  }

  let centerL = Math.max(gutter + 32, contentLeft - 14);
  let centerR = Math.min(w - gutter - 32, contentRight + 14);
  if (midWidth) {
    // Shared-viewport tablet: keep full side gutters for measured tag boxes.
    centerL = Math.max(gutter + 12, contentLeft - 10);
    centerR = Math.min(w - gutter - 12, contentRight + 10);
  }

  const minSideW = midWidth ? 96 : 56;
  const leftW = Math.max(minSideW, centerL - gutter);
  const rightW = Math.max(minSideW, w - gutter - centerR);
  const rightX = centerR;

  const totalH = Math.max(minPocketH * 3 + 8, y1 - y0);
  const rowH = totalH / 3;

  const row = (rh: number) => Math.max(minPocketH, rh - 6);

  return [
    { x: gutter, y: y0, w: leftW, h: row(rowH) },
    { x: gutter, y: y0 + rowH, w: leftW, h: row(rowH) },
    {
      x: gutter,
      y: y0 + rowH * 2,
      w: leftW,
      h: row(totalH - rowH * 2),
    },
    { x: rightX, y: y0, w: rightW, h: row(rowH) },
    { x: rightX, y: y0 + rowH, w: rightW, h: row(rowH) },
    {
      x: rightX,
      y: y0 + rowH * 2,
      w: rightW,
      h: row(totalH - rowH * 2),
    },
  ];
}

function columnBelowRegion(
  idx: number,
  regions: Rect[],
): Rect | undefined {
  if (idx === 0 || idx === 1 || idx === 3 || idx === 4) {
    return regions[idx + 1];
  }
  return undefined;
}

function adjustRegionForClosing(
  region: Rect,
  belowRegion: Rect | undefined,
  closingKeepOuts: Rect[],
  layout?: LandscapeLayout,
): Rect {
  const midWidth = layout ? layout.w <= 820 : false;
  const minPocketH = midWidth ? CURSOR_BOX_H + 20 : CURSOR_BOX_H + 28;
  let floorY = region.y;
  for (const k of closingKeepOuts) {
    if (!keepOutOverlapsRegion(k, region, 4)) continue;
    floorY = Math.max(floorY, k.y + k.h + 10);
  }
  if (floorY <= region.y + 8) return region;

  const pocketTop = floorY;
  const pocketBottom = belowRegion ? belowRegion.y - 8 : region.y + region.h;
  const pocketH = pocketBottom - pocketTop;
  if (pocketH >= minPocketH) {
    return { ...region, y: pocketTop, h: pocketH };
  }

  const shrunkH = region.y + region.h - floorY;
  if (shrunkH >= minPocketH) {
    return { ...region, y: floorY, h: shrunkH };
  }

  if (belowRegion) {
    const mergedH = belowRegion.y + belowRegion.h - floorY;
    if (mergedH >= minPocketH) {
      return {
        ...region,
        y: floorY,
        h: mergedH,
        w: Math.max(region.w, belowRegion.w),
        x: Math.min(region.x, belowRegion.x),
      };
    }
  }
  return region;
}

function regionForCursor(
  def: CursorDef,
  layout: LandscapeLayout,
  closingKeepOuts: Rect[] = [],
): Rect {
  const regions = sixLandscapeRegions(layout, closingKeepOuts);
  const idx = def.regionIndex % regions.length;
  const base = regions[idx] ?? {
    x: layout.gutter,
    y: layout.bandTop,
    w: 80,
    h: 40,
  };
  const below = columnBelowRegion(idx, regions);
  return adjustRegionForClosing(base, below, closingKeepOuts, layout);
}

function seededUnit(seed: number, salt: number) {
  const v = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453123;
  return v - Math.floor(v);
}

function poseFromSeed(
  region: Rect,
  seed: number,
  boxW: number,
  layout?: LandscapeLayout,
) {
  const { minX, maxX } = anchorXRangeInRegion(region, boxW, layout);
  const spanX = Math.max(0, maxX - minX);
  const spanY = Math.max(0, region.h - 16);
  return {
    x: minX + seededUnit(seed, 1) * spanX,
    y: region.y + 8 + seededUnit(seed, 2) * spanY,
  };
}

function isPlacementClear(
  x: number,
  y: number,
  region: Rect,
  placementKeep: Rect[],
  boxW = DEFAULT_BOX_W,
  ctx: ChromeKeepContext = chromeCtx([], []),
) {
  return !hitsPlacementKeeps(x, y, region, boxW, placementKeep, ctx);
}

function findClearAnchorInRegion(
  region: Rect,
  placementKeep: Rect[],
  boxW = DEFAULT_BOX_W,
  ctx: ChromeKeepContext = chromeCtx([], []),
  layout?: LandscapeLayout,
): { x: number; y: number } | null {
  const { minX, maxX } = anchorXRangeInRegion(region, boxW, layout);
  for (let yi = 0; yi <= 16; yi += 1) {
    for (let xi = 0; xi <= 12; xi += 1) {
      const p = {
        x: minX + ((maxX - minX) * xi) / 12,
        y: region.y + 8 + ((region.h - 16) * yi) / 16,
      };
      if (isPlacementClear(p.x, p.y, region, placementKeep, boxW, ctx)) {
        return p;
      }
    }
  }
  return null;
}

function clampToRegion(p: { x: number; y: number }, region: Rect) {
  return {
    x: Math.min(region.x + region.w - 8, Math.max(region.x + 8, p.x)),
    y: Math.min(region.y + region.h - 8, Math.max(region.y + 8, p.y)),
  };
}

function pointInRegion(p: { x: number; y: number }, region: Rect, inset = 4) {
  return (
    p.x >= region.x + inset &&
    p.x <= region.x + region.w - inset &&
    p.y >= region.y + inset &&
    p.y <= region.y + region.h - inset
  );
}

function isShortMotionPocket(region: Rect) {
  return region.h < 112 || region.w < SIDE_COL_MIN_W;
}

function regionDistanceBounds(region: Rect) {
  const shortPocket = isShortMotionPocket(region);
  const tallNarrow = region.w < SIDE_COL_MIN_W && region.h >= 118;
  const minDist = tallNarrow
    ? Math.max(10, Math.min(48, region.h * 0.09, region.w * 0.11))
    : shortPocket
      ? Math.min(
          56,
          Math.max(
            10,
            region.w * 0.12,
            region.h * 0.18,
            Math.min(region.w, region.h) * 0.14,
          ),
        )
      : Math.min(90, Math.max(22, region.h * 0.28));
  const maxDist = Math.min(
    480,
    Math.max(
      220,
      minDist + 32,
      region.w * 1.15,
      region.h * (shortPocket ? 2.15 : 0.75),
      tallNarrow ? region.h * 1.05 : 0,
    ),
  );
  return { minDist, maxDist };
}

function motionContentPads(layout: LandscapeLayout, w: number) {
  const regions = sixLandscapeRegions(layout, []);
  const minColW = Math.min(...regions.map((r) => r.w), w);
  const tight = w <= 820 || minColW < SIDE_COL_MIN_W;
  if (w <= 768) {
    return { emailX: 22, emailY: 18, pillX: 16, pillY: 14 };
  }
  if (tight) {
    return { emailX: 36, emailY: 24, pillX: 22, pillY: 18 };
  }
  return { emailX: 72, emailY: 48, pillX: 40, pillY: 36 };
}

function isStructuralKeepOut(k: Rect, layout: LandscapeLayout, w: number) {
  return (
    k.y < layout.headerH + 1 ||
    k.y > layout.h - layout.bottomH - 1 ||
    k.x < layout.gutter + 1 ||
    k.x + k.w > w - layout.gutter - 1
  );
}

/** Motion pick tests: keep-outs that can affect this side column (not full-width email bleed). */
function isSideWalkColumn(region: Rect, layout: LandscapeLayout) {
  const leftEdge = region.x + region.w <= layout.contentLeft + 14;
  const rightEdge = region.x >= layout.contentRight - 14;
  return leftEdge || rightEdge;
}

function keepOutOverlapsRegion(k: Rect, region: Rect, minOverlap = 8) {
  const overlapX =
    Math.min(region.x + region.w, k.x + k.w) - Math.max(region.x, k.x);
  const overlapY =
    Math.min(region.y + region.h, k.y + k.h) - Math.max(region.y, k.y);
  return overlapX > minOverlap && overlapY > minOverlap;
}

function keepOutsForRegionPick(
  region: Rect,
  keepOuts: Rect[],
  layout: LandscapeLayout,
  w: number,
  closingKeepOuts: Rect[] = [],
  contactKeepOuts: Rect[] = [],
) {
  if (w <= 820) {
    const structural = keepOuts.filter((k) =>
      isStructuralKeepOut(k, layout, w),
    );
    const closing = closingKeepOuts.filter((k) =>
      keepOutOverlapsRegion(k, region),
    );
    return [...structural, ...contactKeepOuts, ...closing];
  }
  if (isSideWalkColumn(region, layout)) {
    const structural = keepOuts.filter((k) =>
      isStructuralKeepOut(k, layout, w),
    );
    const closing = closingKeepOuts.filter((k) =>
      keepOutOverlapsRegion(k, region),
    );
    return [...structural, ...closing];
  }
  const probe = padRect(region, 14, 14);
  return keepOuts.filter((k) => {
    if (isStructuralKeepOut(k, layout, w)) return true;
    if (!rectsOverlap(probe, k)) return false;
    const overlapX =
      Math.min(region.x + region.w, k.x + k.w) - Math.max(region.x, k.x);
    const overlapY =
      Math.min(region.y + region.h, k.y + k.h) - Math.max(region.y, k.y);
    return overlapX > 20 && overlapY > 18;
  });
}

type KeepOutBundle = {
  all: Rect[];
  closing: Rect[];
  contact: Rect[];
};

function buildKeepOuts(
  tail: HTMLElement,
  footer: HTMLElement,
  layout: LandscapeLayout,
): KeepOutBundle {
  const { w, h } = layout;
  const pads = motionContentPads(layout, w);
  const tr = tail.getBoundingClientRect();
  const keep: Rect[] = [];
  const closing: Rect[] = [];
  const contact: Rect[] = [];

  const email = footer.querySelector<HTMLElement>(".home-footer__email");
  if (email) {
    const box = padRect(
      toContainerLocal(email.getBoundingClientRect(), tr),
      pads.emailX,
      pads.emailY,
    );
    keep.push(box);
    contact.push(box);
  }

  const socialHits = footer.querySelectorAll<HTMLElement>(
    ".home-footer__social-pill",
  );
  for (const el of socialHits) {
    const box = padRect(
      toContainerLocal(el.getBoundingClientRect(), tr),
      pads.pillX,
      pads.pillY,
    );
    keep.push(box);
    contact.push(box);
  }

  tail.querySelectorAll<HTMLElement>(".home-closing-link--primary").forEach(
    (el) => {
      const box = padRect(
        toContainerLocal(el.getBoundingClientRect(), tr),
        52,
        44,
      );
      keep.push(box);
      closing.push(box);
    },
  );
  tail.querySelectorAll<HTMLElement>(".home-closing-star").forEach((el) => {
    const box = padRect(
      toContainerLocal(el.getBoundingClientRect(), tr),
      36,
      28,
    );
    keep.push(box);
    closing.push(box);
  });

  keep.push({ x: 0, y: h - layout.bottomH, w, h: layout.bottomH });
  keep.push({ x: 0, y: 0, w: layout.gutter, h });
  keep.push({ x: w - layout.gutter, y: 0, w: layout.gutter, h });

  return { all: keep, closing, contact };
}

function forceLeadTarget(
  region: Rect,
  from: { x: number; y: number },
  pathKeepOuts: Rect[],
  pickKeepOuts?: Rect[],
  boxW = DEFAULT_BOX_W,
  ctx: ChromeKeepContext = chromeCtx([], []),
  layout?: LandscapeLayout,
) {
  const placementKeep = pickKeepOuts ?? pathKeepOuts;
  const shortPocket = isShortMotionPocket(region);
  const pathPad =
    shortPocket || region.w < SIDE_COL_MIN_W ? 3 : 6;
  let best: { x: number; y: number; d: number } | null = null;

  const { minX, maxX } = anchorXRangeInRegion(region, boxW, layout);
  for (let yi = 0; yi <= 12; yi += 1) {
    for (let xi = 0; xi <= 12; xi += 1) {
      const p = {
        x: minX + ((maxX - minX) * xi) / 12,
        y: region.y + 8 + ((region.h - 16) * yi) / 12,
      };
      if (
        hitsPlacementKeeps(p.x, p.y, region, boxW, placementKeep, ctx)
      ) {
        continue;
      }
      const inColumn =
        pickKeepOuts &&
        pointInRegion(from, region) &&
        pointInRegion(p, region);
      const pathKeep = inColumn ? placementKeep : pathKeepOuts;
      if (
        !pathClear(
          from,
          p,
          pathKeep,
          pathPad,
          inColumn ? region : undefined,
          boxW,
          ctx,
        )
      ) {
        continue;
      }
      const d = Math.hypot(p.x - from.x, p.y - from.y);
      if (d < 6) continue;
      if (!best || d > best.d) best = { x: p.x, y: p.y, d };
    }
  }
  return best;
}

function pickTarget(
  region: Rect,
  from: { x: number; y: number } | null,
  pathKeepOuts: Rect[],
  straight: boolean,
  pickKeepOuts?: Rect[],
  boxW = DEFAULT_BOX_W,
  ctx: ChromeKeepContext = chromeCtx([], []),
): { x: number; y: number } | null {
  const layout = ctx.layout;
  const placementKeep = pickKeepOuts ?? pathKeepOuts;
  const { minDist, maxDist } = regionDistanceBounds(region);
  const shortPocket = isShortMotionPocket(region);
  const attempts = shortPocket ? 90 : 60;
  const passes = shortPocket ? 2 : 1;

  for (let pass = 0; pass < passes; pass += 1) {
    const relaxMin = pass === 1;
    for (let i = 0; i < attempts; i += 1) {
      const p = randomAnchorInRegion(region, boxW, layout);
      if (from) {
        const d = Math.hypot(p.x - from.x, p.y - from.y);
        if (relaxMin) {
          if (d < 8 || d > maxDist) continue;
        } else if (d < minDist || d > maxDist) {
          continue;
        }
      }
      if (hitsPlacementKeeps(p.x, p.y, region, boxW, placementKeep, ctx)) {
        continue;
      }
      if (from && straight) {
        const inColumn =
          pickKeepOuts &&
          pointInRegion(from, region) &&
          pointInRegion(p, region);
        const pathKeep = inColumn ? placementKeep : pathKeepOuts;
        const pathPad =
          inColumn && (shortPocket || region.w < SIDE_COL_MIN_W) ? 4 : 8;
        if (
          !pathClear(
            from,
            p,
            pathKeep,
            pathPad,
            inColumn ? region : undefined,
            boxW,
            ctx,
          )
        ) {
          continue;
        }
      }
      return p;
    }
  }

  if (from) {
    const { minX, maxX } = anchorXRangeInRegion(region, boxW, layout);
    const corners = [
      { x: minX, y: region.y + region.h * 0.22 },
      { x: maxX, y: region.y + region.h * 0.32 },
      { x: minX + (maxX - minX) * 0.45, y: region.y + region.h * 0.72 },
      { x: maxX, y: region.y + region.h * 0.82 },
    ];
    for (const p of corners) {
      const clamped = clampToRegion(p, region);
      const d = Math.hypot(clamped.x - from.x, clamped.y - from.y);
      if (d < 8) continue;
      if (
        hitsPlacementKeeps(
          clamped.x,
          clamped.y,
          region,
          boxW,
          placementKeep,
          ctx,
        )
      ) {
        continue;
      }
      const pathPad = shortPocket || region.w < SIDE_COL_MIN_W ? 4 : 8;
      const inColumn =
        pickKeepOuts &&
        pointInRegion(from, region) &&
        pointInRegion(clamped, region);
      const pathKeep = inColumn ? placementKeep : pathKeepOuts;
      if (
        !pathClear(
          from,
          clamped,
          pathKeep,
          pathPad,
          inColumn ? region : undefined,
          boxW,
          ctx,
        )
      ) {
        continue;
      }
      return clamped;
    }
  }

  if (from) {
    const forced = forceLeadTarget(
      region,
      from,
      pathKeepOuts,
      pickKeepOuts,
      boxW,
      ctx,
      layout,
    );
    if (forced) return { x: forced.x, y: forced.y };
  }

  if (from) {
    const { minX, maxX } = anchorXRangeInRegion(region, boxW, layout);
    const midX = minX + (maxX - minX) * 0.5;
    for (let yi = 0; yi <= 16; yi += 1) {
      const y = region.y + 10 + ((region.h - 20) * yi) / 16;
      const p = { x: midX, y };
      if (hitsPlacementKeeps(p.x, p.y, region, boxW, placementKeep, ctx)) {
        continue;
      }
      const d = Math.hypot(p.x - from.x, p.y - from.y);
      if (d < 8) continue;
      if (pathClear(from, p, placementKeep, 4, region, boxW, ctx)) {
        return p;
      }
    }
    if (import.meta.env.DEV && typeof window !== "undefined") {
      const wn = window as Window & { __driftBuilderPickFail?: string };
      wn.__driftBuilderPickFail = `no-target region=${region.w}x${region.h}`;
    }
  }

  if (!from) {
    return findClearAnchorInRegion(
      region,
      placementKeep,
      boxW,
      ctx,
      layout,
    );
  }
  return null;
}

function pickClearStart(
  region: Rect,
  keepOuts: Rect[],
  layout: LandscapeLayout,
  def: CursorDef,
  narrow: boolean,
  pickKeepOuts?: Rect[],
  ctx: ChromeKeepContext = chromeCtx([], []),
  roster: CursorDef[] = [],
): { x: number; y: number } | null {
  const placementKeep = pickKeepOuts ?? keepOuts;
  const boxW = def.boxW;
  for (let i = 0; i < 40; i += 1) {
    const p = pickTarget(
      region,
      null,
      keepOuts,
      false,
      placementKeep,
      boxW,
      ctx,
    );
    if (p && isPlacementClear(p.x, p.y, region, placementKeep, boxW, ctx)) {
      return p;
    }
  }
  const fallback = staticPoseFor(
    def,
    layout,
    narrow,
    keepOuts,
    ctx,
    placementKeep,
    roster,
  );
  if (
    fallback &&
    isPlacementClear(fallback.x, fallback.y, region, placementKeep, boxW, ctx)
  ) {
    return fallback;
  }
  return findClearAnchorInRegion(region, placementKeep, boxW, ctx, layout);
}

function staticPoseFor(
  def: CursorDef,
  layout: LandscapeLayout,
  narrow: boolean,
  keepOuts: Rect[] = [],
  ctx: ChromeKeepContext = chromeCtx([], []),
  pickKeepOuts?: Rect[],
  roster: CursorDef[] = [],
): { x: number; y: number } | null {
  const region = regionForCursor(def, layout, ctx.closing);
  const placementKeep = pickKeepOuts ?? keepOuts;
  if (narrow) {
    return narrowStaticPoseFor(def, layout, roster);
  }

  const p = poseFromSeed(region, def.poseSeed, def.boxW, layout);
  const clamped = clampToRegion(p, region);
  if (isPlacementClear(clamped.x, clamped.y, region, placementKeep, def.boxW, ctx)) {
    return clamped;
  }
  return findClearAnchorInRegion(region, placementKeep, def.boxW, ctx, layout);
}

function driftingCursorsMotionEnabled() {
  if (typeof window === "undefined") return false;
  return (
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}

function subscribeDriftingCursorsMotion(onChange: () => void) {
  const mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mqFine = window.matchMedia("(hover: hover) and (pointer: fine)");
  const notify = () => onChange();
  mqReduce.addEventListener("change", notify);
  mqFine.addEventListener("change", notify);
  return () => {
    mqReduce.removeEventListener("change", notify);
    mqFine.removeEventListener("change", notify);
  };
}

function StudioPointer({ fill }: { fill: string }) {
  return (
    <svg
      className="home-drifting-cursor__ptr"
      viewBox="0 0 20 22"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 2.5 L4.8 20.2 L9.6 13.8 L17.2 12.6 Z"
        fill="none"
        stroke="#141a2b"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
      <path
        d="M3 2.5 L4.8 20.2 L9.6 13.8 L17.2 12.6 Z"
        fill={fill}
        stroke="#fff8ea"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Props = {
  className?: string;
};

export default function HomeDriftingCursors({ className }: Props) {
  const roster = useMemo(() => buildEasterEggRoster(), []);

  const motionEnabled = useSyncExternalStore(
    subscribeDriftingCursorsMotion,
    driftingCursorsMotionEnabled,
    () => false,
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const cursorElRefs = useRef<(HTMLDivElement | null)[]>([]);
  const inViewRef = useRef(false);
  const pageVisibleRef = useRef(true);
  const sizeRef = useRef({ w: 1, h: 1 });
  const layoutRef = useRef<LandscapeLayout | null>(null);
  const keepOutsRef = useRef<Rect[]>([]);
  const closingKeepOutsRef = useRef<Rect[]>([]);
  const contactKeepOutsRef = useRef<Rect[]>([]);

  const keepChromeCtx = (layout: LandscapeLayout | null): ChromeKeepContext =>
    chromeCtx(
      closingKeepOutsRef.current,
      contactKeepOutsRef.current,
      layout,
    );
  const statesRef = useRef<StudioCursorState[]>([]);
  const rafRef = useRef(0);
  const lastFrameMsRef = useRef(0);
  const simTimeRef = useRef(0);
  const [isNarrow, setIsNarrow] = useState(false);
  const isNarrowRef = useRef(false);
  const [isTiny, setIsTiny] = useState(false);
  const isTinyRef = useRef(false);
  const [narrowStaticHidden, setNarrowStaticHidden] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const [motionHidden, setMotionHidden] = useState<ReadonlySet<number>>(
    () => new Set(),
  );

  const staticMode = !motionEnabled;

  const rootClassName = useMemo(
    () =>
      [
        "home-drifting-cursors pointer-events-none absolute inset-0 overflow-hidden",
        staticMode ? "home-drifting-cursors--static-fade" : "",
        isNarrow ? "home-drifting-cursors--narrow" : "",
        className,
      ]
        .filter(Boolean)
        .join(" "),
    [className, staticMode, isNarrow],
  );

  const stopLoop = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    lastFrameMsRef.current = 0;
  };

  const shouldAnimate = () =>
    motionEnabled && inViewRef.current && pageVisibleRef.current;

  const putCursor = (index: number, x: number, y: number) => {
    const el = cursorElRefs.current[index];
    if (!el) return;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };

  const triggerClick = (index: number) => {
    const el = cursorElRefs.current[index];
    if (!el) return;
    el.classList.add("home-drifting-cursor--press");
    window.setTimeout(() => {
      el.classList.remove("home-drifting-cursor--press");
      el.classList.remove("home-drifting-cursor--click");
      void el.offsetWidth;
      el.classList.add("home-drifting-cursor--click");
      window.setTimeout(() => {
        el.classList.remove("home-drifting-cursor--click");
      }, 520);
    }, 140);
  };

  const beginSegment = (index: number) => {
    const state = statesRef.current[index];
    const def = roster[index];
    const layout = layoutRef.current;
    if (!state || !def || !layout) return;

    const crossDef =
      roster[Math.floor(Math.random() * roster.length)] ?? def;
    const crossRegion = layout.w > 820 && Math.random() < 0.15;
    const closingKeep = closingKeepOutsRef.current;
    const ctx = keepChromeCtx(layout);
    const region = crossRegion
      ? regionForCursor(crossDef, layout, closingKeep)
      : regionForCursor(def, layout, closingKeep);

    const fullKeep = keepOutsRef.current;
    const pickKeep = crossRegion
      ? fullKeep
      : keepOutsForRegionPick(
          region,
          fullKeep,
          layout,
          layout.w,
          closingKeep,
          contactKeepOutsRef.current,
        );

    let from = { x: state.leadX, y: state.leadY };
    if (
      hitsPlacementKeeps(from.x, from.y, region, def.boxW, pickKeep, ctx)
    ) {
      const start = pickClearStart(
        region,
        fullKeep,
        layout,
        def,
        isNarrowRef.current,
        pickKeep,
        ctx,
        roster,
      );
      if (!start) {
        state.hidden = true;
        setMotionHidden((prev) => new Set(prev).add(index));
        return;
      }
      from = start;
      state.hidden = false;
      setMotionHidden((prev) => {
        if (!prev.has(index)) return prev;
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
      state.leadX = from.x;
      state.leadY = from.y;
      state.x = from.x;
      state.y = from.y;
    }

    let to = pickTarget(region, from, fullKeep, true, pickKeep, def.boxW, ctx);
    if (!to) {
      state.wait =
        layout.w <= 820 ? randomBetween(0.1, 0.28) : randomBetween(0.4, 1);
      return;
    }
    let d = Math.hypot(to.x - from.x, to.y - from.y);
    if (d < 8) {
      const forced = forceLeadTarget(
        region,
        from,
        fullKeep,
        pickKeep,
        def.boxW,
        ctx,
        layout,
      );
      if (forced) {
        to = { x: forced.x, y: forced.y };
        d = forced.d;
      }
    }
    if (d < 6) {
      state.wait =
        layout.w <= 820 ? randomBetween(0.1, 0.28) : randomBetween(0.4, 1);
      return;
    }
    const midWidth = layout.w <= 820;
    state.seg = {
      fromX: from.x,
      fromY: from.y,
      toX: to.x,
      toY: to.y,
      t: 0,
      dur: Math.min(2.2, Math.max(midWidth ? 0.55 : 0.7, d / (midWidth ? 200 : 230))),
    };
  };

  const seedStates = (_w: number, _h: number, animate: boolean) => {
    const layout = layoutRef.current;
    if (!layout) return;
    const narrow = isNarrowRef.current;

    const hiddenIdx = new Set<number>();
    const closingKeep = closingKeepOutsRef.current;
    const ctx = keepChromeCtx(layout);
    statesRef.current = roster.map((def, i) => {
      const region = regionForCursor(def, layout, closingKeep);
      const fullKeep = keepOutsRef.current;
      const pickKeep = keepOutsForRegionPick(
        region,
        fullKeep,
        layout,
        layout.w,
        closingKeep,
        contactKeepOutsRef.current,
      );
      const p = animate
        ? pickClearStart(
            region,
            fullKeep,
            layout,
            def,
            narrow,
            pickKeep,
            ctx,
            roster,
          )
        : staticPoseFor(
            def,
            layout,
            narrow,
            fullKeep,
            ctx,
            pickKeep,
            roster,
          );
      if (!p) {
        hiddenIdx.add(i);
        return {
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          leadX: 0,
          leadY: 0,
          wait: randomBetween(0.2, 1.2),
          hidden: true,
          seg: null,
          idlePhase: i * 1.7,
          stillLeadSec: 0,
          lastSampleLeadX: 0,
          lastSampleLeadY: 0,
        };
      }
      return {
        x: p.x,
        y: p.y,
        vx: 0,
        vy: 0,
        leadX: p.x,
        leadY: p.y,
        wait: randomBetween(0.15, 0.65),
        hidden: false,
        seg: null,
        idlePhase: i * 1.7,
        stillLeadSec: 0,
        lastSampleLeadX: p.x,
        lastSampleLeadY: p.y,
      };
    });
    if (layout.w === 768) {
      for (let i = statesRef.current.length - 1; i >= 0; i -= 1) {
        const visibleCount = statesRef.current.filter((s) => !s.hidden).length;
        if (visibleCount <= 5) break;
        if (statesRef.current[i]?.hidden) continue;
        statesRef.current[i].hidden = true;
        hiddenIdx.add(i);
      }
    }
    if (!animate && narrow) {
      setNarrowStaticHidden(hiddenIdx);
    }
    if (animate) {
      setMotionHidden(hiddenIdx);
    }
  };

  const startLoop = () => {
    if (!shouldAnimate() || rafRef.current) return;

    const tick = (timeMs: number) => {
      if (!shouldAnimate()) {
        stopLoop();
        return;
      }

      rafRef.current = requestAnimationFrame(tick);

      const deltaTime =
        lastFrameMsRef.current > 0 ? timeMs - lastFrameMsRef.current : 16;
      lastFrameMsRef.current = timeMs;
      if (!Number.isFinite(deltaTime) || deltaTime <= 0) return;

      const dt = Math.min(deltaTime / 1000, 0.05);
      simTimeRef.current += dt;
      const { w, h } = sizeRef.current;
      if (w <= 1 || h <= 1) return;

      const layout = layoutRef.current;
      const midWidthMotion = w <= 820;

      for (let i = 0; i < roster.length; i += 1) {
        const state = statesRef.current[i];
        const def = roster[i];
        if (!state || state.hidden || !def) continue;

        if (state.seg) {
          state.seg.t += dt / state.seg.dur;
          const k = easeInOutCubic(Math.min(1, state.seg.t));
          state.leadX = state.seg.fromX + (state.seg.toX - state.seg.fromX) * k;
          state.leadY = state.seg.fromY + (state.seg.toY - state.seg.fromY) * k;
          if (state.seg.t >= 1) {
            state.seg = null;
            state.wait = midWidthMotion
              ? randomBetween(0.25, 1.05)
              : randomBetween(0.9, 2.6);
            if (Math.random() < 0.35) {
              window.setTimeout(
                () => triggerClick(i),
                randomBetween(150, 500),
              );
            }
          }
        } else {
          state.wait -= dt;
          if (state.wait <= 0) beginSegment(i);
        }

        const leadMoved = Math.hypot(
          state.leadX - state.lastSampleLeadX,
          state.leadY - state.lastSampleLeadY,
        );
        if (state.seg || leadMoved > 12) {
          state.stillLeadSec = 0;
          if (leadMoved > 12) {
            state.lastSampleLeadX = state.leadX;
            state.lastSampleLeadY = state.leadY;
          }
        } else {
          state.stillLeadSec += dt;
        }

        if (layout && !state.seg && state.stillLeadSec > 2.1) {
          const closingKeep = closingKeepOutsRef.current;
          const ctx = keepChromeCtx(layout);
          const region = regionForCursor(def, layout, closingKeep);
          const fullKeep = keepOutsRef.current;
          const pickKeep = keepOutsForRegionPick(
            region,
            fullKeep,
            layout,
            layout.w,
            closingKeep,
            contactKeepOutsRef.current,
          );
          const p = pickClearStart(
            region,
            fullKeep,
            layout,
            def,
            isNarrowRef.current,
            pickKeep,
            ctx,
            roster,
          );
          state.stillLeadSec = 0;
          if (!p) {
            state.hidden = true;
            setMotionHidden((prev) => new Set(prev).add(i));
            continue;
          }
          state.hidden = false;
          setMotionHidden((prev) => {
            if (!prev.has(i)) return prev;
            const next = new Set(prev);
            next.delete(i);
            return next;
          });
          state.leadX = p.x;
          state.leadY = p.y;
          state.x = p.x;
          state.y = p.y;
          state.vx = 0;
          state.vy = 0;
          state.lastSampleLeadX = p.x;
          state.lastSampleLeadY = p.y;
          state.wait = 0;
          beginSegment(i);
        }

        const jx =
          Math.sin(simTimeRef.current * 1.7 + state.idlePhase) * 0.6;
        const jy =
          Math.cos(simTimeRef.current * 1.3 + state.idlePhase) * 0.6;
        const targetX = state.leadX + jx;
        const targetY = state.leadY + jy;

        state.vx += (SPRING_K * (targetX - state.x) - SPRING_C * state.vx) * dt;
        state.vy += (SPRING_K * (targetY - state.y) - SPRING_C * state.vy) * dt;
        state.x += state.vx * dt;
        state.y += state.vy * dt;

        if (layout && layout.w <= 820 && contactKeepOutsRef.current.length > 0) {
          const ctx = keepChromeCtx(layout);
          const region = regionForCursor(def, layout, closingKeepOutsRef.current);
          const box = cursorBoxAt(state.x, state.y, 2, def.boxW);
          const onContact = contactKeepOutsRef.current.some((k) =>
            rectsOverlap(box, k),
          );
          if (
            onContact ||
            hitsPlacementKeeps(
              state.leadX,
              state.leadY,
              region,
              def.boxW,
              keepOutsRef.current,
              ctx,
              2,
            )
          ) {
            state.seg = null;
            state.stillLeadSec = 0;
            state.wait = randomBetween(0.05, 0.2);
            const start = pickClearStart(
              region,
              keepOutsRef.current,
              layout,
              def,
              isNarrowRef.current,
              keepOutsForRegionPick(
                region,
                keepOutsRef.current,
                layout,
                layout.w,
                closingKeepOutsRef.current,
                contactKeepOutsRef.current,
              ),
              ctx,
              roster,
            );
            if (!start) {
              state.hidden = true;
              setMotionHidden((prev) => new Set(prev).add(i));
              continue;
            }
            state.hidden = false;
            state.leadX = start.x;
            state.leadY = start.y;
            state.x = start.x;
            state.y = start.y;
            state.vx = 0;
            state.vy = 0;
          }
        }

        putCursor(i, state.x, state.y);
      }

      if (import.meta.env.DEV && typeof window !== "undefined") {
        const wn = window as Window & { __driftCursorRafFrames?: number };
        wn.__driftCursorRafFrames = (wn.__driftCursorRafFrames ?? 0) + 1;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  const syncLoop = () => {
    if (shouldAnimate()) startLoop();
    else stopLoop();
  };

  const layoutStatic = () => {
    const { w, h } = sizeRef.current;
    if (w <= 1 || h <= 1) return;
    seedStates(w, h, false);
    for (let i = 0; i < roster.length; i += 1) {
      const state = statesRef.current[i];
      if (state && !state.hidden) putCursor(i, state.x, state.y);
    }
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const tail = root.closest(".home-closing-tail");
    if (!tail || !(tail instanceof HTMLElement)) return;
    const footer = tail.querySelector(".home-footer");
    if (!footer || !(footer instanceof HTMLElement)) return;

    const measure = () => {
      const rect = root.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      sizeRef.current = { w, h };
      const tiny = w <= TINY_VIEWPORT_W;
      isTinyRef.current = tiny;
      setIsTiny(tiny);
      const narrow = w < 768;
      isNarrowRef.current = narrow;
      setIsNarrow(narrow);
      layoutRef.current = readClosingTailLandscape(tail, footer);
      const keepBundle = buildKeepOuts(tail, footer, layoutRef.current);
      keepOutsRef.current = keepBundle.all;
      closingKeepOutsRef.current = keepBundle.closing;
      contactKeepOutsRef.current = keepBundle.contact;

      if (tiny) {
        stopLoop();
        return;
      }

      const layoutKey = `${w}:${h}:${keepBundle.closing.length}`;
      const prevKey = (root as HTMLElement).dataset.driftLayoutKey ?? "";
      if (statesRef.current.length === 0 || prevKey !== layoutKey) {
        statesRef.current = [];
        seedStates(w, h, motionEnabled);
        root.dataset.driftLayoutKey = layoutKey;
      }

      if (staticMode) layoutStatic();
      else {
        for (let i = 0; i < roster.length; i += 1) {
          const state = statesRef.current[i];
          if (state) putCursor(i, state.x, state.y);
        }
      }
    };

    const onVisibility = () => {
      pageVisibleRef.current = !document.hidden;
      syncLoop();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        inViewRef.current = entry.isIntersecting;
        syncLoop();
      },
      { threshold: 0.05, rootMargin: "40px 0px" },
    );
    observer.observe(root);

    const roLayout = new ResizeObserver(() => {
      measure();
    });
    roLayout.observe(tail);
    roLayout.observe(footer);
    roLayout.observe(root);

    const roKeep = new ResizeObserver(() => {
      if (isTinyRef.current) return;
      layoutRef.current = readClosingTailLandscape(tail, footer);
      const keepBundle = buildKeepOuts(tail, footer, layoutRef.current);
      keepOutsRef.current = keepBundle.all;
      closingKeepOutsRef.current = keepBundle.closing;
    });

    const email = footer.querySelector(".home-footer__email");
    if (email) roKeep.observe(email);
    footer.querySelectorAll(".home-footer__social-pill").forEach((pill) => {
      roKeep.observe(pill);
    });
    tail.querySelectorAll(".home-closing-link--primary").forEach((link) => {
      roKeep.observe(link);
    });
    tail.querySelectorAll(".home-closing-star").forEach((star) => {
      roKeep.observe(star);
    });

    document.addEventListener("visibilitychange", onVisibility);

    measure();
    syncLoop();

    return () => {
      stopLoop();
      roLayout.disconnect();
      roKeep.disconnect();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [motionEnabled, staticMode, roster]);

  useEffect(() => {
    syncLoop();
    return () => stopLoop();
  }, [motionEnabled]);

  if (isTiny) {
    return null;
  }

  return (
    <div ref={rootRef} className={rootClassName} aria-hidden="true">
      {roster.map((def, index) => {
        if (
          (staticMode && narrowStaticHidden.has(index)) ||
          motionHidden.has(index)
        ) {
          return null;
        }
        return (
          <div
            key={def.id}
            ref={(el) => {
              cursorElRefs.current[index] = el;
            }}
            className={[
              "home-drifting-cursor",
              staticMode && def.staticRing
                ? "home-drifting-cursor--static-ring"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={
              {
                "--studio-cursor-fill": def.color,
                visibility: "visible",
              } as CSSProperties
            }
          >
            <span className="home-drifting-cursor__ring" aria-hidden="true" />
            <StudioPointer fill={def.color} />
            <span
              className="home-drifting-cursor__tag"
              style={{ backgroundColor: def.color, color: def.ink }}
            >
              {def.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
