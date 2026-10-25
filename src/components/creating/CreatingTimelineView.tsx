import { useEffect, useRef } from "react";
import gsap from "gsap";
import type { CreatingEntry } from "~lib/creating/types";
import { timelineYearMarkers } from "~lib/creating/entries";
import { CreatingWorkCard } from "./CreatingWorkCard";

const DRAG_THRESHOLD_PX = 6;
const FLING_RECENT_MS = 80;

type Props = {
  entries: CreatingEntry[];
  activeEntryIds: Set<string>;
  reducedMotion: boolean;
  transitionEntryId: string | null;
  onOpen: (id: string, el: HTMLElement) => void;
  onHover: (id: string | null) => void;
};

export function CreatingTimelineView({
  entries,
  activeEntryIds,
  reducedMotion,
  transitionEntryId,
  onOpen,
  onHover,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const markers = timelineYearMarkers(entries);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    if (!scroller || !track) return;

    const markerEls = scroller.parentElement?.querySelectorAll<HTMLElement>(
      ".creating-timeline__year",
    );
    if (!markerEls) return;

    const syncYears = () => {
      markerEls.forEach((marker) => {
        const entryId = marker.getAttribute("data-year-for");
        if (!entryId) return;
        const card = track.querySelector<HTMLElement>(
          `[data-entry-id="${entryId}"]`,
        );
        if (!card) return;
        const x = track.offsetLeft + card.offsetLeft - scroller.scrollLeft;
        marker.style.transform = `translateX(${x}px)`;
      });
    };

    syncYears();
    const ro = new ResizeObserver(syncYears);
    ro.observe(track);
    scroller.addEventListener("scroll", syncYears, { passive: true });
    window.addEventListener("creating-flip-complete", syncYears);
    const t = window.setTimeout(syncYears, 950);
    return () => {
      ro.disconnect();
      scroller.removeEventListener("scroll", syncYears);
      window.removeEventListener("creating-flip-complete", syncYears);
      window.clearTimeout(t);
    };
  }, [entries]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const allowInertia = !reducedMotion;
    let pointerId: number | null = null;
    let didDrag = false;
    let captured = false;
    let startX = 0;
    let scrollStart = 0;
    let velocity = 0;
    let lastX = 0;
    let lastT = 0;
    let inertiaTween: gsap.core.Tween | null = null;
    let suppressClick = false;

    const resetPointer = () => {
      pointerId = null;
      captured = false;
      didDrag = false;
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      pointerId = e.pointerId;
      didDrag = false;
      captured = false;
      velocity = 0;
      startX = e.clientX;
      scrollStart = scroller.scrollLeft;
      lastX = e.clientX;
      lastT = performance.now();
      inertiaTween?.kill();
    };

    const onMove = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return;
      const dx = e.clientX - startX;
      if (!captured) {
        if (Math.abs(dx) <= DRAG_THRESHOLD_PX) return;
        didDrag = true;
        captured = true;
        scroller.setPointerCapture(e.pointerId);
      }
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      velocity = (e.clientX - lastX) / dt;
      lastX = e.clientX;
      lastT = now;
      scroller.scrollLeft = scrollStart - dx;
    };

    const endDrag = (e: PointerEvent, allowFling: boolean) => {
      if (pointerId !== e.pointerId) return;
      if (captured) {
        try {
          scroller.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      if (didDrag) {
        suppressClick = true;
        window.setTimeout(() => {
          suppressClick = false;
        }, 0);
        const recentMs = performance.now() - lastT;
        if (allowInertia && allowFling && recentMs < FLING_RECENT_MS) {
          const target = scroller.scrollLeft - velocity * 120;
          inertiaTween = gsap.to(scroller, {
            scrollLeft: Math.max(
              0,
              Math.min(scroller.scrollWidth - scroller.clientWidth, target),
            ),
            duration: 0.85,
            ease: "power3.out",
          });
        }
      }
      resetPointer();
    };

    const onUp = (e: PointerEvent) => endDrag(e, true);
    const onCancel = (e: PointerEvent) => endDrag(e, false);

    const onClick = (e: MouseEvent) => {
      if (suppressClick) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    scroller.addEventListener("pointerdown", onDown);
    scroller.addEventListener("pointermove", onMove);
    scroller.addEventListener("pointerup", onUp);
    scroller.addEventListener("pointercancel", onCancel);
    scroller.addEventListener("click", onClick, true);
    return () => {
      scroller.removeEventListener("pointerdown", onDown);
      scroller.removeEventListener("pointermove", onMove);
      scroller.removeEventListener("pointerup", onUp);
      scroller.removeEventListener("pointercancel", onCancel);
      scroller.removeEventListener("click", onClick, true);
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
        const flipRoot = document.querySelector(".creating-flip-root");
        if (flipRoot?.getAttribute("data-flip-active") === "true") return;
        const progress =
          scroller.scrollLeft /
          Math.max(1, scroller.scrollWidth - scroller.clientWidth);
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
              filterActive={activeEntryIds.has(entry.id)}
              reducedMotion={reducedMotion}
              transitionEntryId={transitionEntryId}
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
