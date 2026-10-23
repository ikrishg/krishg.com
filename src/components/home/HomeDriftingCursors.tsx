import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";

const REF_FOOTER_W = 1440;
const TINY_VIEWPORT_W = 390;

/** Mock footer landmarks (A.html / notes) for Y remapping only. */
const MOCK_FOOTER_H = 836;
const MOCK_Y_ANCHORS = [
  { mock: 0, key: "top" as const },
  { mock: 72, key: "header" as const },
  { mock: 392, key: "emailTop" as const },
  { mock: 501, key: "emailBottom" as const },
  { mock: 693, key: "socialTop" as const },
  { mock: 809, key: "socialBottom" as const },
  { mock: MOCK_FOOTER_H, key: "footerBottom" as const },
];

const CURSOR_BOX_W = 110;
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

type CursorDef = {
  id: string;
  label: string;
  color: string;
  ink: string;
  mockPose: { x: number; y: number };
  staticRing?: boolean;
};

const CURSOR_DEFS: CursorDef[] = [
  {
    id: "builder",
    label: "Builder",
    color: "#398fd0",
    ink: "#141a2b",
    mockPose: { x: 262, y: 236 },
  },
  {
    id: "creator",
    label: "Creator",
    color: "#b94a3f",
    ink: "#fff8ea",
    mockPose: { x: 1096, y: 196 },
  },
  {
    id: "educator",
    label: "Educator",
    color: "#d8a12a",
    ink: "#141a2b",
    mockPose: { x: 1012, y: 604 },
    staticRing: true,
  },
];

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

function cursorBoxAt(x: number, y: number, pad = 0): Rect {
  return {
    x: x - 4 - pad,
    y: y - 4 - pad,
    w: CURSOR_BOX_W + pad * 2,
    h: CURSOR_BOX_H + pad * 2,
  };
}

/** Clip pointer+tag box to a walk column so wide tags do not false-hit center keep-outs. */
function cursorBoxInRegion(
  x: number,
  y: number,
  region: Rect,
  pad = 0,
): Rect {
  const box = cursorBoxAt(x, y, pad);
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

function anchorXRangeInRegion(region: Rect) {
  const minX = region.x + 10;
  const maxX = region.x + region.w - (CURSOR_BOX_W - 4) - 10;
  return { minX, maxX: Math.max(minX, maxX) };
}

function randomAnchorInRegion(region: Rect) {
  const { minX, maxX } = anchorXRangeInRegion(region);
  return {
    x: randomBetween(minX, maxX),
    y: randomBetween(region.y + 8, region.y + region.h - 8),
  };
}

/** Pointer + tag bounds for narrow static (root scale 0.9). */
function narrowStaticCursorBoxAt(x: number, y: number, pad = 0): Rect {
  const sx = x * NARROW_ROOT_SCALE;
  const sy = y * NARROW_ROOT_SCALE;
  const w = CURSOR_BOX_W * NARROW_ROOT_SCALE;
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
) {
  return !hitKeepOut(narrowStaticCursorBoxAt(x, y, pad), keepOuts);
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

function solveNarrowStaticPoses(layout: LandscapeLayout): Record<string, NarrowStaticPose> {
  const key = narrowStaticLayoutKey(layout);
  if (narrowStaticPoseCache?.key === key) return narrowStaticPoseCache.poses;

  const keep = buildNarrowStaticKeepOuts(layout, layout.w, layout.h);
  const { w, gutter } = layout;
  const edge = 14;
  const xLeft = gutter + edge;
  const xRight = w - gutter - edge;

  const yAbove = narrowStaticYAboveEmail(layout, edge);
  const yBelow = narrowStaticYBelowPills(layout, edge);
  const ySlots = [...yAbove, ...yBelow];

  const roles: { id: string; xs: number[]; ys: number[] }[] = [
    {
      id: "builder",
      xs: [xLeft, xLeft + 10, xRight],
      ys: yAbove.length > 0 ? yAbove : ySlots,
    },
    {
      id: "educator",
      xs: [xRight, xRight - 10, xLeft + 18],
      ys: yAbove.length > 0 ? [...yAbove].reverse() : [...ySlots].reverse(),
    },
  ];

  const poses: Record<string, NarrowStaticPose> = {
    builder: null,
    creator: null,
    educator: null,
  };
  const reserved: Rect[] = [];

  for (const role of roles) {
    let placed: NarrowStaticPose = null;
    for (const y of role.ys) {
      for (const x of role.xs) {
        const trial = [...keep, ...reserved];
        if (!narrowStaticPoseClear(x, y, trial)) continue;
        placed = { x, y };
        reserved.push(narrowStaticCursorBoxAt(x, y, 12));
        break;
      }
      if (placed) break;
    }
    poses[role.id] = placed;
  }

  narrowStaticPoseCache = { key, poses };
  return poses;
}

function narrowStaticPoseFor(
  def: CursorDef,
  layout: LandscapeLayout,
): NarrowStaticPose {
  return solveNarrowStaticPoses(layout)[def.id] ?? null;
}

function hitKeepOut(box: Rect, keepOuts: Rect[]) {
  return keepOuts.some((k) => rectsOverlap(box, k));
}

function pathClear(
  from: { x: number; y: number },
  to: { x: number; y: number },
  keepOuts: Rect[],
  samplePad = 8,
  region?: Rect,
) {
  const boxAt = region
    ? (x: number, y: number, pad: number) => cursorBoxInRegion(x, y, region, pad)
    : (x: number, y: number, pad: number) => cursorBoxAt(x, y, pad);
  const fromInside = hitKeepOut(boxAt(from.x, from.y, samplePad), keepOuts);
  const startSample = fromInside ? 1 : 0;
  for (let i = startSample; i <= 24; i += 1) {
    const t = i / 24;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    if (hitKeepOut(boxAt(x, y, samplePad), keepOuts)) return false;
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

function readFooterSliceLayout(
  footer: HTMLElement,
  w: number,
  footerH: number,
): FooterSliceLayout {
  const fr = footer.getBoundingClientRect();
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
  const fr = footer.getBoundingClientRect();
  const w = Math.max(1, tr.width);
  const h = Math.max(1, tr.height);
  const footerTop = Math.max(0, fr.top - tr.top);
  const footerH = Math.max(1, fr.height);
  const slice = readFooterSliceLayout(footer, w, footerH);

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

function remapMockY(mockY: number, layout: LandscapeLayout): number {
  const footerHeader = Math.min(layout.footerH * 0.18, 72);
  const liveY: Record<string, number> = {
    top: layout.footerTop,
    header: layout.footerTop + footerHeader,
    emailTop: layout.emailTop,
    emailBottom: layout.emailBottom,
    socialTop: layout.socialTop,
    socialBottom: layout.socialBottom,
    footerBottom: layout.footerTop + layout.footerH,
  };

  for (let i = 0; i < MOCK_Y_ANCHORS.length - 1; i += 1) {
    const a = MOCK_Y_ANCHORS[i];
    const b = MOCK_Y_ANCHORS[i + 1];
    if (!a || !b) continue;
    if (mockY >= a.mock && mockY <= b.mock) {
      const t = (mockY - a.mock) / (b.mock - a.mock);
      const ya = liveY[a.key] ?? 0;
      const yb = liveY[b.key] ?? layout.h;
      return ya + (yb - ya) * t;
    }
  }
  return layout.footerTop + (mockY / MOCK_FOOTER_H) * layout.footerH;
}

const SIDE_COL_MIN_W = 180;

function sideColumnWidths(layout: LandscapeLayout) {
  const { w, gutter, contentLeft, contentRight } = layout;
  const midWidth = w <= 820;
  const maxCarve = midWidth ? 56 : 28;

  let inset = midWidth ? 4 : 6;
  let leftW = Math.max(0, contentLeft - gutter - inset);
  if (leftW < SIDE_COL_MIN_W) {
    const carve = Math.min(maxCarve, SIDE_COL_MIN_W - leftW);
    inset = Math.max(0, inset - Math.min(inset, carve));
    leftW = Math.max(0, contentLeft - gutter - inset + carve);
  }

  let rightInset = inset;
  let rightX = contentRight + rightInset;
  let rightW = Math.max(0, w - gutter - rightX);
  if (rightW < SIDE_COL_MIN_W) {
    const carve = Math.min(maxCarve, SIDE_COL_MIN_W - rightW);
    rightX = Math.max(contentRight + 2, rightX - carve);
    rightW = Math.max(0, w - gutter - rightX);
  }

  return {
    leftW: Math.max(32, leftW),
    rightX,
    rightW: Math.max(32, rightW),
  };
}

function liveRegions(layout: LandscapeLayout): Record<string, Rect> {
  const { w, h, gutter, bandTop, bottomH } = layout;

  const y0 = bandTop;
  const y1 = h - bottomH;
  const colH = Math.max(40, y1 - y0);
  const { leftW, rightX, rightW } = sideColumnWidths(layout);
  const midWidth = w <= 820;

  const builder: Rect = {
    x: gutter,
    y: y0,
    w: leftW,
    h: colH,
  };

  const minPocketH = CURSOR_BOX_H + 28;
  let creatorH: number;
  if (midWidth) {
    const educatorH = Math.max(minPocketH, colH * 0.52);
    creatorH = Math.max(minPocketH, colH - educatorH);
  } else {
    creatorH = Math.max(36, colH * 0.46);
    creatorH = Math.min(creatorH, colH - 36);
  }
  const splitY = y0 + creatorH;

  const creator: Rect = {
    x: rightX,
    y: y0,
    w: rightW,
    h: creatorH,
  };

  const educator: Rect = {
    x: rightX,
    y: splitY,
    w: rightW,
    h: Math.max(minPocketH, y1 - splitY),
  };

  return { builder, creator, educator };
}

function regionForDef(def: CursorDef, layout: LandscapeLayout): Rect {
  const regions = liveRegions(layout);
  const fallback = regions.builder ?? {
    x: layout.gutter,
    y: layout.bandTop,
    w: 80,
    h: 40,
  };
  return regions[def.id] ?? fallback;
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
  const regions = liveRegions(layout);
  const minColW = Math.min(
    regions.builder?.w ?? 0,
    regions.creator?.w ?? 0,
    regions.educator?.w ?? 0,
  );
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
) {
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

  const email = footer.querySelector<HTMLElement>(".home-footer__email");
  if (email) {
    keep.push(
      padRect(
        toContainerLocal(email.getBoundingClientRect(), tr),
        pads.emailX,
        pads.emailY,
      ),
    );
  }

  const socialHits = footer.querySelectorAll<HTMLElement>(
    ".home-footer__social-pill",
  );
  for (const el of socialHits) {
    keep.push(
      padRect(
        toContainerLocal(el.getBoundingClientRect(), tr),
        pads.pillX,
        pads.pillY,
      ),
    );
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

  return { all: keep, closing };
}

function forceLeadTarget(
  region: Rect,
  from: { x: number; y: number },
  pathKeepOuts: Rect[],
  pickKeepOuts?: Rect[],
) {
  const placementKeep = pickKeepOuts ?? pathKeepOuts;
  const shortPocket = isShortMotionPocket(region);
  const pathPad =
    shortPocket || region.w < SIDE_COL_MIN_W ? 3 : 6;
  let best: { x: number; y: number; d: number } | null = null;

  const { minX, maxX } = anchorXRangeInRegion(region);
  for (let yi = 0; yi <= 12; yi += 1) {
    for (let xi = 0; xi <= 12; xi += 1) {
      const p = {
        x: minX + ((maxX - minX) * xi) / 12,
        y: region.y + 8 + ((region.h - 16) * yi) / 12,
      };
      if (hitKeepOut(cursorBoxInRegion(p.x, p.y, region), placementKeep)) {
        continue;
      }
      const inColumn =
        pickKeepOuts &&
        pointInRegion(from, region) &&
        pointInRegion(p, region);
      const pathKeep = inColumn ? placementKeep : pathKeepOuts;
      if (!pathClear(from, p, pathKeep, pathPad, inColumn ? region : undefined)) {
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
) {
  const placementKeep = pickKeepOuts ?? pathKeepOuts;
  const { minDist, maxDist } = regionDistanceBounds(region);
  const shortPocket = isShortMotionPocket(region);
  const attempts = shortPocket ? 90 : 60;
  const passes = shortPocket ? 2 : 1;

  for (let pass = 0; pass < passes; pass += 1) {
    const relaxMin = pass === 1;
    for (let i = 0; i < attempts; i += 1) {
      const p = randomAnchorInRegion(region);
      if (from) {
        const d = Math.hypot(p.x - from.x, p.y - from.y);
        if (relaxMin) {
          if (d < 8 || d > maxDist) continue;
        } else if (d < minDist || d > maxDist) {
          continue;
        }
      }
      if (hitKeepOut(cursorBoxInRegion(p.x, p.y, region), placementKeep)) {
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
        if (!pathClear(from, p, pathKeep, pathPad, inColumn ? region : undefined)) {
          continue;
        }
      }
      return p;
    }
  }

  if (from) {
    const { minX, maxX } = anchorXRangeInRegion(region);
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
      if (hitKeepOut(cursorBoxInRegion(clamped.x, clamped.y, region), placementKeep)) {
        continue;
      }
      const pathPad = shortPocket || region.w < SIDE_COL_MIN_W ? 4 : 8;
      const inColumn =
        pickKeepOuts &&
        pointInRegion(from, region) &&
        pointInRegion(clamped, region);
      const pathKeep = inColumn ? placementKeep : pathKeepOuts;
      if (!pathClear(from, clamped, pathKeep, pathPad, inColumn ? region : undefined)) {
        continue;
      }
      return clamped;
    }
  }

  if (from) {
    const forced = forceLeadTarget(region, from, pathKeepOuts, pickKeepOuts);
    if (forced) return { x: forced.x, y: forced.y };
  }

  if (from) {
    const { minX, maxX } = anchorXRangeInRegion(region);
    const midX = minX + (maxX - minX) * 0.5;
    for (let yi = 0; yi <= 16; yi += 1) {
      const y = region.y + 10 + ((region.h - 20) * yi) / 16;
      const p = { x: midX, y };
      if (hitKeepOut(cursorBoxInRegion(p.x, p.y, region), placementKeep)) continue;
      const d = Math.hypot(p.x - from.x, p.y - from.y);
      if (d < 8) continue;
      if (
        pathClear(from, p, placementKeep, 4, region)
      ) {
        return p;
      }
    }
    if (import.meta.env.DEV && typeof window !== "undefined") {
      const wn = window as Window & { __driftBuilderPickFail?: string };
      wn.__driftBuilderPickFail = `no-target region=${region.w}x${region.h}`;
    }
  }

  return clampToRegion(
    randomAnchorInRegion(region),
    region,
  );
}

function pickClearStart(
  region: Rect,
  keepOuts: Rect[],
  layout: LandscapeLayout,
  def: CursorDef,
  narrow: boolean,
  pickKeepOuts?: Rect[],
) {
  const placementKeep = pickKeepOuts ?? keepOuts;
  for (let i = 0; i < 40; i += 1) {
    const p = pickTarget(region, null, keepOuts, false, placementKeep);
    if (!hitKeepOut(cursorBoxInRegion(p.x, p.y, region), placementKeep)) return p;
  }
  const fallback = staticPoseFor(def, layout, narrow, keepOuts);
  if (fallback) return fallback;
  return clampToRegion(
    { x: region.x + region.w * 0.4, y: region.y + region.h * 0.45 },
    region,
  );
}

function staticPoseFor(
  def: CursorDef,
  layout: LandscapeLayout,
  narrow: boolean,
  keepOuts: Rect[] = [],
): { x: number; y: number } | null {
  const region = regionForDef(def, layout);
  if (narrow) {
    return narrowStaticPoseFor(def, layout);
  }

  const p = {
    x: scaleX(def.mockPose.x, layout.w),
    y: remapMockY(def.mockPose.y, layout),
  };
  const clamped = clampToRegion(p, region);
  if (!hitKeepOut(cursorBoxAt(clamped.x, clamped.y), keepOuts)) return clamped;
  return clampToRegion(
    { x: region.x + region.w * 0.35, y: region.y + region.h * 0.42 },
    region,
  );
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
    const def = CURSOR_DEFS[index];
    const layout = layoutRef.current;
    if (!state || !def || !layout) return;

    const crossDef =
      CURSOR_DEFS[Math.floor(Math.random() * CURSOR_DEFS.length)] ?? def;
    const crossRegion = layout.w > 820 && Math.random() < 0.15;
    const region = crossRegion
      ? regionForDef(crossDef, layout)
      : regionForDef(def, layout);

    const fullKeep = keepOutsRef.current;
    const pickKeep = crossRegion
      ? fullKeep
      : keepOutsForRegionPick(
          region,
          fullKeep,
          layout,
          layout.w,
          closingKeepOutsRef.current,
        );

    let from = { x: state.leadX, y: state.leadY };
    if (hitKeepOut(cursorBoxInRegion(from.x, from.y, region), pickKeep)) {
      from = pickClearStart(
        region,
        fullKeep,
        layout,
        def,
        isNarrowRef.current,
        pickKeep,
      );
      state.leadX = from.x;
      state.leadY = from.y;
      state.x = from.x;
      state.y = from.y;
    }

    let to = pickTarget(region, from, fullKeep, true, pickKeep);
    let d = Math.hypot(to.x - from.x, to.y - from.y);
    if (d < 8) {
      const forced = forceLeadTarget(region, from, fullKeep, pickKeep);
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
    statesRef.current = CURSOR_DEFS.map((def, i) => {
      const region = regionForDef(def, layout);
      const fullKeep = keepOutsRef.current;
      const pickKeep = keepOutsForRegionPick(
        region,
        fullKeep,
        layout,
        layout.w,
        closingKeepOutsRef.current,
      );
      const p = animate
        ? pickClearStart(region, fullKeep, layout, def, narrow, pickKeep)
        : staticPoseFor(def, layout, narrow, fullKeep);
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
    if (!animate && narrow) {
      setNarrowStaticHidden(hiddenIdx);
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

      for (let i = 0; i < CURSOR_DEFS.length; i += 1) {
        const state = statesRef.current[i];
        const def = CURSOR_DEFS[i];
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
          const region = regionForDef(def, layout);
          const fullKeep = keepOutsRef.current;
          const pickKeep = keepOutsForRegionPick(
            region,
            fullKeep,
            layout,
            layout.w,
            closingKeepOutsRef.current,
          );
          const p = pickClearStart(
            region,
            fullKeep,
            layout,
            def,
            isNarrowRef.current,
            pickKeep,
          );
          state.stillLeadSec = 0;
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
    for (let i = 0; i < CURSOR_DEFS.length; i += 1) {
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

      if (tiny) {
        stopLoop();
        return;
      }

      if (statesRef.current.length === 0) {
        seedStates(w, h, motionEnabled);
      }

      if (staticMode) layoutStatic();
      else {
        for (let i = 0; i < CURSOR_DEFS.length; i += 1) {
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
  }, [motionEnabled, staticMode]);

  useEffect(() => {
    syncLoop();
    return () => stopLoop();
  }, [motionEnabled]);

  if (isTiny) {
    return null;
  }

  return (
    <div ref={rootRef} className={rootClassName} aria-hidden="true">
      {CURSOR_DEFS.map((def, index) => {
        if (staticMode && narrowStaticHidden.has(index)) {
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
