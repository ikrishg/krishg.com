import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";

const REF_FOOTER_W = 1440;

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

const SPRING_K = 150;
const SPRING_C = 2 * Math.sqrt(SPRING_K) * 0.92;

type Rect = { x: number; y: number; w: number; h: number };

type FooterLayout = {
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
  /** Horizontal span of email + social pills (footer-local). */
  contentLeft: number;
  contentRight: number;
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
  seg: null | {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    t: number;
    dur: number;
  };
  idlePhase: number;
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

function hitKeepOut(box: Rect, keepOuts: Rect[]) {
  return keepOuts.some((k) => rectsOverlap(box, k));
}

function pathClear(
  from: { x: number; y: number },
  to: { x: number; y: number },
  keepOuts: Rect[],
) {
  const fromInside = hitKeepOut(cursorBoxAt(from.x, from.y, 8), keepOuts);
  const startSample = fromInside ? 1 : 0;
  for (let i = startSample; i <= 24; i += 1) {
    const t = i / 24;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    if (hitKeepOut(cursorBoxAt(x, y, 8), keepOuts)) return false;
  }
  return true;
}

function toFooterLocal(rect: DOMRect, footer: DOMRect) {
  return {
    x: rect.left - footer.left,
    y: rect.top - footer.top,
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

function readFooterLayout(footer: HTMLElement, w: number, h: number): FooterLayout {
  const fr = footer.getBoundingClientRect();
  const email = footer.querySelector<HTMLElement>(".home-footer__email");
  const pills = footer.querySelectorAll<HTMLElement>(".home-footer__social-pill");

  let emailTop = h * 0.28;
  let emailBottom = h * 0.48;
  let contentLeft = w * 0.12;
  let contentRight = w * 0.88;
  if (email) {
    const er = toFooterLocal(email.getBoundingClientRect(), fr);
    emailTop = er.y;
    emailBottom = er.y + er.h;
    contentLeft = er.x;
    contentRight = er.x + er.w;
  }

  let socialTop = h * 0.62;
  let socialBottom = h - 6;
  if (pills.length > 0) {
    let minY = Infinity;
    let maxY = -Infinity;
    pills.forEach((pill) => {
      const pr = toFooterLocal(pill.getBoundingClientRect(), fr);
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
  const headerH = Math.min(h * 0.18, 72);
  const bottomH = Math.min(h * 0.1, 40);

  return {
    w,
    h,
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
  };
}

function remapMockY(mockY: number, layout: FooterLayout): number {
  const liveY: Record<string, number> = {
    top: 0,
    header: layout.headerH,
    emailTop: layout.emailTop,
    emailBottom: layout.emailBottom,
    socialTop: layout.socialTop,
    socialBottom: layout.socialBottom,
    footerBottom: layout.h,
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
  return (mockY / MOCK_FOOTER_H) * layout.h;
}

function liveRegions(layout: FooterLayout): Record<string, Rect> {
  const { w, h, gutter, bandTop, bottomH, socialBottom, contentLeft, contentRight } =
    layout;

  const y0 = bandTop;
  const y1 = Math.min(h - bottomH, socialBottom + 20);
  const colH = Math.max(40, y1 - y0);
  const inset = 6;

  const leftW = Math.max(0, contentLeft - gutter - inset);
  const rightX = contentRight + inset;
  const rightW = Math.max(0, w - gutter - rightX);

  const builder: Rect = {
    x: gutter,
    y: y0,
    w: Math.max(32, leftW),
    h: colH,
  };

  const splitY = y0 + colH * 0.46;
  const creator: Rect = {
    x: rightX,
    y: y0,
    w: Math.max(48, rightW),
    h: Math.max(36, splitY - y0),
  };

  const educator: Rect = {
    x: rightX,
    y: splitY,
    w: Math.max(48, rightW),
    h: Math.max(36, y1 - splitY),
  };

  return { builder, creator, educator };
}

function regionForDef(def: CursorDef, layout: FooterLayout): Rect {
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

function regionDistanceBounds(region: Rect) {
  const minDist = Math.min(90, Math.max(22, region.h * 0.28));
  const maxDist = Math.min(
    480,
    Math.max(220, minDist + 48, region.w * 1.15, region.h * 0.75),
  );
  return { minDist, maxDist };
}

function buildKeepOuts(footer: HTMLElement, w: number, h: number): Rect[] {
  const fr = footer.getBoundingClientRect();
  const keep: Rect[] = [];

  const email = footer.querySelector<HTMLElement>(".home-footer__email");
  if (email) {
    keep.push(padRect(toFooterLocal(email.getBoundingClientRect(), fr), 72, 48));
  }

  const socialHits = footer.querySelectorAll<HTMLElement>(
    ".home-footer__social-pill",
  );
  for (const el of socialHits) {
    keep.push(padRect(toFooterLocal(el.getBoundingClientRect(), fr), 40, 36));
  }

  const layout = readFooterLayout(footer, w, h);
  keep.push({ x: 0, y: 0, w, h: layout.headerH });
  keep.push({ x: 0, y: h - layout.bottomH, w, h: layout.bottomH });
  keep.push({ x: 0, y: 0, w: layout.gutter, h });
  keep.push({ x: w - layout.gutter, y: 0, w: layout.gutter, h });

  return keep;
}

function pickTarget(
  region: Rect,
  from: { x: number; y: number } | null,
  keepOuts: Rect[],
  straight: boolean,
) {
  const { minDist, maxDist } = regionDistanceBounds(region);
  for (let i = 0; i < 60; i += 1) {
    const p = {
      x: randomBetween(region.x + 6, region.x + region.w - 6),
      y: randomBetween(region.y + 6, region.y + region.h - 6),
    };
    if (from) {
      const d = Math.hypot(p.x - from.x, p.y - from.y);
      if (d < minDist || d > maxDist) continue;
    }
    if (hitKeepOut(cursorBoxAt(p.x, p.y), keepOuts)) continue;
    if (from && straight && !pathClear(from, p, keepOuts)) continue;
    return p;
  }
  return from ?? clampToRegion({ x: region.x + region.w * 0.4, y: region.y + region.h * 0.45 }, region);
}

function pickClearStart(
  region: Rect,
  keepOuts: Rect[],
  layout: FooterLayout,
  def: CursorDef,
  narrow: boolean,
) {
  for (let i = 0; i < 40; i += 1) {
    const p = pickTarget(region, null, keepOuts, false);
    if (!hitKeepOut(cursorBoxAt(p.x, p.y), keepOuts)) return p;
  }
  return staticPoseFor(def, layout, narrow, keepOuts);
}

function staticPoseFor(
  def: CursorDef,
  layout: FooterLayout,
  narrow: boolean,
  keepOuts: Rect[] = [],
) {
  const region = regionForDef(def, layout);
  if (narrow) {
    const regions = liveRegions(layout);
    const left = regions.builder ?? region;
    const rightLower = regions.educator ?? region;
    const useLeftColumn =
      def.id === "builder" ||
      def.id === "educator" ||
      left.w >= (regions.educator?.w ?? 0);
    const side = useLeftColumn ? left : rightLower;
    const anchor = {
      x: side.x + side.w * (def.id === "builder" ? 0.68 : 0.52),
      y:
        side.y +
        side.h *
          (def.id === "builder"
            ? 0.22
            : def.id === "educator"
              ? 0.78
              : 0.45),
    };
    const clamped = clampToRegion(anchor, side);
    if (!hitKeepOut(cursorBoxAt(clamped.x, clamped.y, 12), keepOuts)) {
      return clamped;
    }
    const fallbackY =
      def.id === "educator"
        ? side.y + side.h * 0.65
        : side.y + side.h * 0.35;
    return clampToRegion({ x: side.x + side.w * 0.5, y: fallbackY }, side);
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
  const layoutRef = useRef<FooterLayout | null>(null);
  const keepOutsRef = useRef<Rect[]>([]);
  const statesRef = useRef<StudioCursorState[]>([]);
  const rafRef = useRef(0);
  const lastFrameMsRef = useRef(0);
  const simTimeRef = useRef(0);
  const [isNarrow, setIsNarrow] = useState(false);
  const isNarrowRef = useRef(false);

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
    const region =
      Math.random() < 0.15
        ? regionForDef(crossDef, layout)
        : regionForDef(def, layout);

    let from = { x: state.leadX, y: state.leadY };
    if (hitKeepOut(cursorBoxAt(from.x, from.y), keepOutsRef.current)) {
      from = pickClearStart(
        region,
        keepOutsRef.current,
        layout,
        def,
        isNarrowRef.current,
      );
      state.leadX = from.x;
      state.leadY = from.y;
      state.x = from.x;
      state.y = from.y;
    }

    const to = pickTarget(region, from, keepOutsRef.current, true);
    const d = Math.hypot(to.x - from.x, to.y - from.y);
    if (d < 4) {
      state.wait = randomBetween(0.4, 1);
      return;
    }
    state.seg = {
      fromX: from.x,
      fromY: from.y,
      toX: to.x,
      toY: to.y,
      t: 0,
      dur: Math.min(2.2, Math.max(0.7, d / 230)),
    };
  };

  const seedStates = (_w: number, _h: number, animate: boolean) => {
    const layout = layoutRef.current;
    if (!layout) return;
    const narrow = isNarrowRef.current;

    statesRef.current = CURSOR_DEFS.map((def, i) => {
      const region = regionForDef(def, layout);
      const p = animate
        ? pickClearStart(region, keepOutsRef.current, layout, def, narrow)
        : staticPoseFor(def, layout, narrow, keepOutsRef.current);
      return {
        x: p.x,
        y: p.y,
        vx: 0,
        vy: 0,
        leadX: p.x,
        leadY: p.y,
        wait: randomBetween(0.2, 1.2),
        seg: null,
        idlePhase: i * 1.7,
      };
    });
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

      for (let i = 0; i < CURSOR_DEFS.length; i += 1) {
        const state = statesRef.current[i];
        if (!state) continue;

        if (state.seg) {
          state.seg.t += dt / state.seg.dur;
          const k = easeInOutCubic(Math.min(1, state.seg.t));
          state.leadX = state.seg.fromX + (state.seg.toX - state.seg.fromX) * k;
          state.leadY = state.seg.fromY + (state.seg.toY - state.seg.fromY) * k;
          if (state.seg.t >= 1) {
            state.seg = null;
            state.wait = randomBetween(0.9, 2.6);
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
      if (state) putCursor(i, state.x, state.y);
    }
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const footer = root.closest(".home-footer");
    if (!footer || !(footer instanceof HTMLElement)) return;

    const measure = () => {
      const rect = root.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      sizeRef.current = { w, h };
      const narrow = w < 768;
      isNarrowRef.current = narrow;
      setIsNarrow(narrow);
      layoutRef.current = readFooterLayout(footer, w, h);
      keepOutsRef.current = buildKeepOuts(footer, w, h);

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

    const roFooter = new ResizeObserver(() => {
      measure();
    });
    roFooter.observe(footer);
    roFooter.observe(root);

    const roKeep = new ResizeObserver(() => {
      const { w, h } = sizeRef.current;
      layoutRef.current = readFooterLayout(footer, w, h);
      keepOutsRef.current = buildKeepOuts(footer, w, h);
    });

    const email = footer.querySelector(".home-footer__email");
    if (email) roKeep.observe(email);
    footer.querySelectorAll(".home-footer__social-pill").forEach((pill) => {
      roKeep.observe(pill);
    });

    document.addEventListener("visibilitychange", onVisibility);

    measure();
    syncLoop();

    return () => {
      stopLoop();
      roFooter.disconnect();
      roKeep.disconnect();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [motionEnabled, staticMode]);

  useEffect(() => {
    syncLoop();
    return () => stopLoop();
  }, [motionEnabled]);

  return (
    <div ref={rootRef} className={rootClassName} aria-hidden="true">
      {CURSOR_DEFS.map((def, index) => {
        if (staticMode && isNarrow && index === 1) return null;
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
