import { useEffect, useRef } from "react";
import gsap from "gsap";
import type { CreatingEntry } from "~lib/creating/types";
import { timelineYearMarkers } from "~lib/creating/entries";
import { CreatingWorkCard } from "./CreatingWorkCard";

type Props = {
  entries: CreatingEntry[];
  reducedMotion: boolean;
  onOpen: (id: string, el: HTMLElement) => void;
  onHover: (id: string | null) => void;
};

export function CreatingTimelineView({
  entries,
  reducedMotion,
  onOpen,
  onHover,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const markers = timelineYearMarkers(entries);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || reducedMotion) return;

    let dragging = false;
    let startX = 0;
    let scrollStart = 0;
    let velocity = 0;
    let lastX = 0;
    let lastT = 0;
    let inertiaTween: gsap.core.Tween | null = null;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      inertiaTween?.kill();
      startX = e.clientX;
      scrollStart = scroller.scrollLeft;
      lastX = e.clientX;
      lastT = performance.now();
      scroller.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      velocity = (e.clientX - lastX) / dt;
      lastX = e.clientX;
      lastT = now;
      scroller.scrollLeft = scrollStart - (e.clientX - startX);
    };

    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      scroller.releasePointerCapture(e.pointerId);
      const target = scroller.scrollLeft - velocity * 120;
      inertiaTween = gsap.to(scroller, {
        scrollLeft: Math.max(0, Math.min(scroller.scrollWidth, target)),
        duration: 0.85,
        ease: "power3.out",
      });
    };

    scroller.addEventListener("pointerdown", onDown);
    scroller.addEventListener("pointermove", onMove);
    scroller.addEventListener("pointerup", onUp);
    scroller.addEventListener("pointercancel", onUp);
    return () => {
      scroller.removeEventListener("pointerdown", onDown);
      scroller.removeEventListener("pointermove", onMove);
      scroller.removeEventListener("pointerup", onUp);
      scroller.removeEventListener("pointercancel", onUp);
      inertiaTween?.kill();
    };
  }, [entries, reducedMotion]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    if (!scroller || !track || reducedMotion) return;

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const progress =
          scroller.scrollLeft / Math.max(1, scroller.scrollWidth - scroller.clientWidth);
        track.style.setProperty("--timeline-progress", String(progress));
        const cards = track.querySelectorAll<HTMLElement>(".creating-card");
        cards.forEach((card, i) => {
          const offset = (i % 3) * 4 - 4;
          const y = Math.sin(progress * Math.PI * 2 + i * 0.4) * 6 + offset;
          card.style.setProperty("--card-parallax", `${y}px`);
        });
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [entries, reducedMotion]);

  const sorted = [...entries].sort(
    (a, b) => a.year - b.year || a.order - b.order,
  );

  return (
    <div className="creating-timeline" data-view-region="timeline">
      <div className="creating-timeline__years" aria-hidden="true">
        {markers.map((m) => (
          <span
            key={`${m.year}-${m.entryId}`}
            className="creating-timeline__year"
            data-year-for={m.entryId}
          >
            {m.year}
          </span>
        ))}
      </div>
      <div
        ref={scrollerRef}
        className="creating-timeline__scroller"
        tabIndex={0}
        aria-label="Timeline — drag horizontally to explore"
      >
        <div ref={trackRef} className="creating-timeline__track" role="list">
          {sorted.map((entry) => (
            <CreatingWorkCard
              key={entry.id}
              entry={entry}
              variant="timeline"
              reducedMotion={reducedMotion}
              onOpen={onOpen}
              onHover={onHover}
            />
          ))}
        </div>
      </div>
      <p className="creating-timeline__hint">Drag or scroll sideways</p>
    </div>
  );
}
