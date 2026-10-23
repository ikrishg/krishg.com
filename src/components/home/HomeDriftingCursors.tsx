import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";

const REF_FOOTER_W = 1440;
const REF_FOOTER_H = 836;

const CURSOR_BOX_W = 110;
const CURSOR_BOX_H = 46;

const SPRING_K = 150;
const SPRING_C = 2 * Math.sqrt(SPRING_K) * 0.92;

type Rect = { x: number; y: number; w: number; h: number };

type CursorDef = {
  id: string;
  label: string;
  color: string;
  ink: string;
  region: Rect;
  pose: { x: number; y: number };
  staticRing?: boolean;
};

const CURSOR_DEFS: CursorDef[] = [
  {
    id: "builder",
    label: "Builder",
    color: "#398fd0",
    ink: "#141a2b",
    region: { x: 110, y: 110, w: 330, h: 600 },
    pose: { x: 262, y: 236 },
  },
  {
    id: "creator",
    label: "Creator",
    color: "#b94a3f",
    ink: "#fff8ea",
    region: { x: 960, y: 110, w: 340, h: 240 },
    pose: { x: 1096, y: 196 },
  },
  {
    id: "educator",
    label: "Educator",
    color: "#d8a12a",
    ink: "#141a2b",
    region: { x: 900, y: 540, w: 380, h: 170 },
    pose: { x: 1012, y: 604 },
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

function scaleY(y: number, h: number) {
  return y * (h / REF_FOOTER_H);
}

function scaleRect(r: Rect, w: number, h: number): Rect {
  return {
    x: scaleX(r.x, w),
    y: scaleY(r.y, h),
    w: scaleX(r.w, w),
    h: scaleY(r.h, h),
  };
}

function scalePoint(p: { x: number; y: number }, w: number, h: number) {
  return { x: scaleX(p.x, w), y: scaleY(p.y, h) };
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
  for (let i = 0; i <= 24; i += 1) {
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

function buildKeepOuts(footer: HTMLElement, w: number, h: number): Rect[] {
  const fr = footer.getBoundingClientRect();
  const keep: Rect[] = [];

  const email = footer.querySelector<HTMLElement>(".home-footer__email");
  const social = footer.querySelector<HTMLElement>(".home-footer__social");

  if (email) {
    keep.push(padRect(toFooterLocal(email.getBoundingClientRect(), fr), 72, 56));
  }
  if (social) {
    keep.push(padRect(toFooterLocal(social.getBoundingClientRect(), fr), 40, 36));
  }

  const headerH = scaleY(72, h);
  const bottomH = scaleY(40, h);
  const gutter = scaleX(64, w);

  keep.push({ x: 0, y: 0, w, h: headerH });
  keep.push({ x: 0, y: h - bottomH, w, h: bottomH });
  keep.push({ x: 0, y: 0, w: gutter, h });
  keep.push({ x: w - gutter, y: 0, w: gutter, h });

  return keep;
}

function pickTarget(
  region: Rect,
  from: { x: number; y: number } | null,
  keepOuts: Rect[],
  straight: boolean,
) {
  for (let i = 0; i < 60; i += 1) {
    const p = {
      x: randomBetween(region.x, region.x + region.w),
      y: randomBetween(region.y, region.y + region.h),
    };
    if (from) {
      const d = Math.hypot(p.x - from.x, p.y - from.y);
      if (d < 90 || d > 480) continue;
    }
    if (hitKeepOut(cursorBoxAt(p.x, p.y), keepOuts)) continue;
    if (from && straight && !pathClear(from, p, keepOuts)) continue;
    return p;
  }
  return from ?? { x: region.x, y: region.y };
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
        className,
      ]
        .filter(Boolean)
        .join(" "),
    [className, staticMode],
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
    const scale = staticMode && isNarrowRef.current ? 0.9 : 1;
    if (scale !== 1) {
      el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    } else {
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
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
    }, 140);
  };

  const beginSegment = (index: number) => {
    const state = statesRef.current[index];
    const def = CURSOR_DEFS[index];
    if (!state || !def) return;
    const { w, h } = sizeRef.current;
    const crossDef =
      CURSOR_DEFS[Math.floor(Math.random() * CURSOR_DEFS.length)] ?? def;
    const region =
      Math.random() < 0.15
        ? scaleRect(crossDef.region, w, h)
        : scaleRect(def.region, w, h);
    const from = { x: state.leadX, y: state.leadY };
    const to = pickTarget(region, from, keepOutsRef.current, true);
    const d = Math.hypot(to.x - from.x, to.y - from.y);
    state.seg = {
      fromX: from.x,
      fromY: from.y,
      toX: to.x,
      toY: to.y,
      t: 0,
      dur: Math.min(2.2, Math.max(0.7, d / 230)),
    };
  };

  const seedStates = (w: number, h: number, animate: boolean) => {
    statesRef.current = CURSOR_DEFS.map((def, i) => {
      const pose = scalePoint(def.pose, w, h);
      const p = animate
        ? pickTarget(scaleRect(def.region, w, h), null, keepOutsRef.current, false)
        : pose;
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

    const email = footer.querySelector(".home-footer__email");
    const social = footer.querySelector(".home-footer__social");
    const roKeep = new ResizeObserver(() => {
      const { w, h } = sizeRef.current;
      keepOutsRef.current = buildKeepOuts(footer, w, h);
    });
    if (email) roKeep.observe(email);
    if (social) roKeep.observe(social);

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
