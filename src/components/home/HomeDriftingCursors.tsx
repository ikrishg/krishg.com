import { useEffect, useMemo, useRef, useState } from "react";
import { useTempus } from "tempus/react";

type CursorSpec = {
  id: number;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
};

const CURSOR_COLORS = [
  "#398fd0",
  "#b94a3f",
  "#7459bd",
  "#1f8254",
  "#a8488d",
  "#252d45",
];

const CURSOR_COUNT = 5;

function PointerGlyph({ color }: { color: string }) {
  return (
    <svg
      width="22"
      height="26"
      viewBox="0 0 22 26"
      fill="none"
      aria-hidden="true"
      className="block drop-shadow-[0_1px_2px_rgba(20,26,43,0.22)]"
    >
      <path
        d="M3.2 2.4L3.2 21.8L8.4 16.2L12.1 23.4L15.2 21.8L11.5 14.6L18.6 14.2L3.2 2.4Z"
        fill={color}
        stroke="#141a2b"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function seedCursors(width: number, height: number): CursorSpec[] {
  return Array.from({ length: CURSOR_COUNT }, (_, id) => ({
    id,
    color: CURSOR_COLORS[id % CURSOR_COLORS.length],
    x: width * (0.12 + id * 0.16),
    y: height * (0.2 + (id % 3) * 0.22),
    vx: (id % 2 === 0 ? 1 : -1) * (18 + id * 4),
    vy: (id % 3 === 0 ? 1 : -1) * (14 + id * 3),
    rot: -18 + id * 7,
  }));
}

type Props = {
  className?: string;
};

export default function HomeDriftingCursors({ className }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inViewRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const sizeRef = useRef({ w: 1, h: 1 });
  const cursorsRef = useRef<CursorSpec[]>([]);
  const [renderCursors, setRenderCursors] = useState<CursorSpec[]>([]);
  const [active, setActive] = useState(false);

  const rootClassName = useMemo(
    () =>
      [
        "home-drifting-cursors pointer-events-none absolute inset-0 z-[1] overflow-hidden",
        className,
      ]
        .filter(Boolean)
        .join(" "),
    [className],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncReduced = () => {
      reducedMotionRef.current = mq.matches;
      setActive(!mq.matches);
    };
    syncReduced();
    mq.addEventListener("change", syncReduced);

    const measure = () => {
      const rect = root.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      sizeRef.current = { w, h };
      if (cursorsRef.current.length === 0) {
        cursorsRef.current = seedCursors(w, h);
        setRenderCursors(cursorsRef.current);
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);

    const observer = new IntersectionObserver(
      ([entry]) => {
        inViewRef.current = entry.isIntersecting;
      },
      { threshold: 0.05, rootMargin: "40px 0px" },
    );
    observer.observe(root);

    return () => {
      mq.removeEventListener("change", syncReduced);
      ro.disconnect();
      observer.disconnect();
    };
  }, []);

  useTempus(
    ({ delta }) => {
      if (!active || !inViewRef.current || reducedMotionRef.current) return;
      const { w, h } = sizeRef.current;
      if (w <= 1 || h <= 1) return;

      const pad = 28;
      const dt = Math.min(delta, 0.05);
      const next = cursorsRef.current.map((cursor) => {
        let { x, y, vx, vy, rot } = cursor;
        x += vx * dt;
        y += vy * dt;

        if (x < pad) {
          x = pad;
          vx = Math.abs(vx);
        } else if (x > w - pad) {
          x = w - pad;
          vx = -Math.abs(vx);
        }

        if (y < pad) {
          y = pad;
          vy = Math.abs(vy);
        } else if (y > h - pad) {
          y = h - pad;
          vy = -Math.abs(vy);
        }

        rot += vx * 0.04 * dt;

        return { ...cursor, x, y, vx, vy, rot };
      });

      cursorsRef.current = next;
      setRenderCursors(next);
    },
    { order: 0, label: "drifting-cursors" },
  );

  if (!active) return null;

  return (
    <div ref={rootRef} className={rootClassName} aria-hidden="true">
      {renderCursors.map((cursor) => (
        <div
          key={cursor.id}
          className="absolute will-change-transform"
          style={{
            transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0) rotate(${cursor.rot}deg)`,
          }}
        >
          <PointerGlyph color={cursor.color} />
        </div>
      ))}
    </div>
  );
}
