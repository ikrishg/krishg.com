import { useEffect, useRef, type RefObject } from "react";
import gsap from "gsap";
import { registerCreatingEasings } from "~lib/creating/easings";
import type { CreatingEntry } from "~lib/creating/types";
import { CATEGORY_ACCENT } from "~lib/creating/types";
import { useFocusTrap } from "./useFocusTrap";

registerCreatingEasings();

type Props = {
  entry: CreatingEntry | null;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  reducedMotion: boolean;
};

export function CreatingDetailPanel({
  entry,
  onClose,
  returnFocusRef,
  reducedMotion,
}: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef({ x: 0, y: 0, vx: 0, vy: 0, px: 0, py: 0 });

  useFocusTrap(panelRef, Boolean(entry));

  useEffect(() => {
    if (!entry) return;
    const panel = panelRef.current;
    if (!panel) return;
    gsap.fromTo(
      panel,
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.9, ease: "creating.cubicInOut" },
    );
    closeRef.current?.focus();
  }, [entry]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    return () => {
      returnFocusRef.current?.focus();
    };
  }, [returnFocusRef]);

  useEffect(() => {
    const panel = panelRef.current;
    const body = bodyRef.current;
    if (!panel || !body) return;

    const onPointer = (e: PointerEvent) => {
      if (reducedMotion) return;
      const r = panel.getBoundingClientRect();
      tiltRef.current.px = ((e.clientX - r.left) / r.width - 0.5) * 2;
      tiltRef.current.py = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };

    const onWheel = (e: WheelEvent) => {
      if (reducedMotion) return;
      e.preventDefault();
      tiltRef.current.vx += e.deltaY * 0.0035;
      tiltRef.current.vy += e.deltaX * 0.0025;
    };

    panel.addEventListener("pointermove", onPointer);
    panel.addEventListener("pointerdown", onPointer);
    panel.addEventListener("wheel", onWheel, { passive: false });
    let raf = 0;
    const tick = () => {
      const t = tiltRef.current;
      const targetX = reducedMotion ? 0 : t.py * 5.5;
      const targetY = reducedMotion ? 0 : -t.px * 5.5;
      t.x += (targetX + t.vx * 14 - t.x) * 0.1;
      t.y += (targetY + t.vy * 10 - t.y) * 0.1;
      t.vx *= 0.82;
      t.vy *= 0.82;
      body.style.transform = `perspective(1100px) rotateX(${t.x.toFixed(2)}deg) rotateY(${t.y.toFixed(2)}deg)`;
      body.dataset.tiltX = t.x.toFixed(2);
      body.dataset.tiltY = t.y.toFixed(2);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      panel.removeEventListener("pointermove", onPointer);
      panel.removeEventListener("pointerdown", onPointer);
      panel.removeEventListener("wheel", onWheel);
      cancelAnimationFrame(raf);
      body.style.transform = "";
      delete body.dataset.tiltX;
      delete body.dataset.tiltY;
    };
  }, [entry, reducedMotion]);

  if (!entry) return null;

  const accent = CATEGORY_ACCENT[entry.category];

  return (
    <section
      ref={panelRef}
      className="creating-detail"
      role="dialog"
      aria-modal="true"
      aria-labelledby="creating-detail-title"
    >
      <button
        ref={closeRef}
        type="button"
        className="creating-detail__close"
        data-no-drag=""
        onClick={onClose}
      >
        Close
      </button>
      <div className="creating-detail__hero-wrap">
        <img
          className="creating-detail__hero"
          src={entry.cover}
          alt=""
          width={512}
          height={640}
          style={{ borderColor: accent }}
        />
      </div>
      <div className="creating-detail__copy">
        {entry.demo ? (
          <p className="creating-demo-badge" aria-label="Demo placeholder content">
            DEMO
          </p>
        ) : null}
        <h2 id="creating-detail-title" className="creating-detail__title">
          {entry.title}
        </h2>
        {entry.subtitle && (
          <p className="creating-detail__subtitle">{entry.subtitle}</p>
        )}
        <p className="creating-detail__meta">
          {entry.demo
            ? [entry.medium, `Placeholder year ${entry.year}`].join(" · ")
            : [entry.medium, entry.published ?? String(entry.year)]
                .filter(Boolean)
                .join(" · ")}
        </p>
        <div ref={bodyRef} className="creating-detail__body">
          <p>{entry.body}</p>
        </div>
      </div>
    </section>
  );
}
