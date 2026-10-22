import { useEffect, useMemo, useRef } from "react";

type CursorTheme = {
  color: string;
  label: string;
  ink: string;
};

const CURSOR_THEMES: CursorTheme[] = [
  { color: "#398fd0", label: "builder", ink: "#141a2b" },
  { color: "#b94a3f", label: "creator", ink: "#fff8ea" },
  { color: "#d8a12a", label: "educator", ink: "#141a2b" },
];

const CURSOR_COUNT = CURSOR_THEMES.length;

type DriftCursor = {
  id: number;
  color: string;
  label: string;
  ink: string;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  ctrlX: number;
  ctrlY: number;
  progress: number;
  duration: number;
  pauseLeft: number;
};

function easeInOutSine(t: number) {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function quadPoint(
  fromX: number,
  fromY: number,
  ctrlX: number,
  ctrlY: number,
  toX: number,
  toY: number,
  t: number,
) {
  const u = 1 - t;
  return {
    x: u * u * fromX + 2 * u * t * ctrlX + t * t * toX,
    y: u * u * fromY + 2 * u * t * ctrlY + t * t * toY,
  };
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pickTarget(w: number, h: number, pad: number) {
  return {
    x: randomBetween(pad, w - pad),
    y: randomBetween(pad, h - pad),
  };
}

function pickControl(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  w: number,
  h: number,
) {
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.hypot(dx, dy) || 1;
  const bend = randomBetween(0.22, 0.48) * Math.min(w, h);
  const side = Math.random() > 0.5 ? 1 : -1;
  return {
    ctrlX: midX + (-dy / len) * bend * side,
    ctrlY: midY + (dx / len) * bend * side,
  };
}

function beginSegment(
  cursor: DriftCursor,
  w: number,
  h: number,
  pad: number,
): DriftCursor {
  const target = pickTarget(w, h, pad);
  const { ctrlX, ctrlY } = pickControl(
    cursor.x,
    cursor.y,
    target.x,
    target.y,
    w,
    h,
  );
  const distance = Math.hypot(target.x - cursor.x, target.y - cursor.y);
  const duration = randomBetween(2.8, 5.6) + distance / Math.max(w, h) * 2.2;
  return {
    ...cursor,
    fromX: cursor.x,
    fromY: cursor.y,
    toX: target.x,
    toY: target.y,
    ctrlX,
    ctrlY,
    progress: 0,
    duration,
    pauseLeft: 0,
  };
}

function seedCursors(w: number, h: number): DriftCursor[] {
  const pad = 36;
  return CURSOR_THEMES.map((theme, id) => {
    const x = randomBetween(pad, w - pad);
    const y = randomBetween(pad, h - pad);
    const base: DriftCursor = {
      id,
      color: theme.color,
      label: theme.label,
      ink: theme.ink,
      x,
      y,
      fromX: x,
      fromY: y,
      toX: x,
      toY: y,
      ctrlX: x,
      ctrlY: y,
      progress: 1,
      duration: 1,
      pauseLeft: randomBetween(0.2, 1.4),
    };
    return beginSegment(base, w, h, pad);
  });
}

function ModernPointer({ color }: { color: string }) {
  return (
    <svg
      width="26"
      height="30"
      viewBox="0 0 26 30"
      fill="none"
      aria-hidden="true"
      className="block"
      style={{
        filter: "drop-shadow(0 1px 1px rgba(20, 26, 43, 0.18))",
      }}
    >
      <path
        d="M5.4 4.2c-.5-.42-1.2-.02-1.2.58v14.9c0 .58.68.9 1.14.52l3.72-3.1 1.42 4.85c.21.72 1.14.72 1.38.04l4.55-9.55c.22-.48-.08-1.02-.62-1.02h-4.38L5.4 4.2Z"
        fill={color}
        stroke="rgba(255, 255, 255, 0.9)"
        strokeWidth="1.1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NameTag({
  label,
  color,
  ink,
}: {
  label: string;
  color: string;
  ink: string;
}) {
  return (
    <span
      className="pointer-events-none absolute left-[15px] top-[13px] whitespace-nowrap rounded-full px-2 py-[3px] text-[11px] font-semibold leading-none tracking-[-0.02em] shadow-[0_1px_3px_rgba(20,26,43,0.14)]"
      style={{
        backgroundColor: color,
        color: ink,
        fontFamily:
          "var(--font-inter-tight), var(--font-space-grotesk), system-ui, sans-serif",
      }}
    >
      {label}
    </span>
  );
}

type Props = {
  className?: string;
};

export default function HomeDriftingCursors({ className }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cursorElRefs = useRef<(HTMLDivElement | null)[]>([]);
  const inViewRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const finePointerRef = useRef(false);
  const activeRef = useRef(false);
  const sizeRef = useRef({ w: 1, h: 1 });
  const cursorsRef = useRef<DriftCursor[]>([]);

  const rootClassName = useMemo(
    () =>
      [
        "home-drifting-cursors pointer-events-none absolute inset-0 z-[1] overflow-hidden opacity-50",
        className,
      ]
        .filter(Boolean)
        .join(" "),
    [className],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mqFine = window.matchMedia("(hover: hover) and (pointer: fine)");

    const syncMotion = () => {
      reducedMotionRef.current = mqReduce.matches;
      finePointerRef.current = mqFine.matches;
      activeRef.current = !mqReduce.matches && mqFine.matches;
      for (let i = 0; i < CURSOR_COUNT; i++) {
        const el = cursorElRefs.current[i];
        if (el) el.style.visibility = activeRef.current ? "visible" : "hidden";
      }
    };
    syncMotion();
    mqReduce.addEventListener("change", syncMotion);
    mqFine.addEventListener("change", syncMotion);

    const measure = () => {
      const rect = root.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      sizeRef.current = { w, h };
      if (cursorsRef.current.length === 0) {
        cursorsRef.current = seedCursors(w, h);
        for (let i = 0; i < CURSOR_COUNT; i++) {
          const state = cursorsRef.current[i];
          const el = cursorElRefs.current[i];
          if (el && state) {
            el.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`;
          }
        }
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        inViewRef.current = entry.isIntersecting;
      },
      { threshold: 0.05, rootMargin: "40px 0px" },
    );
    observer.observe(root);

    return () => {
      mqReduce.removeEventListener("change", syncMotion);
      mqFine.removeEventListener("change", syncMotion);
      ro.disconnect();
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let rafId = 0;
    let lastFrameMs = 0;

    const tick = (timeMs: number) => {
      rafId = requestAnimationFrame(tick);

      if (
        !activeRef.current ||
        !inViewRef.current ||
        reducedMotionRef.current ||
        !finePointerRef.current
      ) {
        lastFrameMs = 0;
        return;
      }

      const deltaTime = lastFrameMs > 0 ? timeMs - lastFrameMs : 16;
      lastFrameMs = timeMs;
      if (!Number.isFinite(deltaTime) || deltaTime <= 0) return;

      const { w, h } = sizeRef.current;
      if (w <= 1 || h <= 1) return;

      const pad = 40;
      const dt = Math.min(deltaTime / 1000, 0.05);

      const next = cursorsRef.current.map((cursor) => {
        let state = cursor;

        if (state.pauseLeft > 0) {
          return { ...state, pauseLeft: Math.max(0, state.pauseLeft - dt) };
        }

        const progress = state.progress + dt / state.duration;
        if (progress >= 1) {
          const landed = quadPoint(
            state.fromX,
            state.fromY,
            state.ctrlX,
            state.ctrlY,
            state.toX,
            state.toY,
            1,
          );
          state = {
            ...state,
            x: landed.x,
            y: landed.y,
            progress: 1,
            pauseLeft: Math.random() < 0.38 ? randomBetween(0.35, 1.6) : 0,
          };
          if (state.pauseLeft > 0) return state;
          return beginSegment(state, w, h, pad);
        }

        const eased = easeInOutSine(progress);
        const point = quadPoint(
          state.fromX,
          state.fromY,
          state.ctrlX,
          state.ctrlY,
          state.toX,
          state.toY,
          eased,
        );

        return {
          ...state,
          progress,
          x: point.x,
          y: point.y,
        };
      });

      cursorsRef.current = next;
      for (let i = 0; i < CURSOR_COUNT; i++) {
        const el = cursorElRefs.current[i];
        const state = next[i];
        if (el && state) {
          el.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`;
        }
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div ref={rootRef} className={rootClassName} aria-hidden="true">
      {CURSOR_THEMES.map((theme, id) => (
        <div
          key={id}
          ref={(el) => {
            cursorElRefs.current[id] = el;
          }}
          className="absolute will-change-transform"
          style={{ visibility: "hidden" }}
        >
          <ModernPointer color={theme.color} />
          <NameTag label={theme.label} color={theme.color} ink={theme.ink} />
        </div>
      ))}
    </div>
  );
}
