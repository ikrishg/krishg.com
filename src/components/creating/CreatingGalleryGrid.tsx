import { useEffect, useRef } from "react";
import type { CreatingEntry } from "~lib/creating/types";
import { CreatingWorkCard } from "./CreatingWorkCard";

type Props = {
  entries: CreatingEntry[];
  reducedMotion: boolean;
  onOpen: (id: string, el: HTMLElement) => void;
  onHover: (id: string | null) => void;
};

export function CreatingGalleryGrid({
  entries,
  reducedMotion,
  onOpen,
  onHover,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const parallaxRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || reducedMotion) return;

    let ticking = false;
    const update = () => {
      ticking = false;
      const cards = root.querySelectorAll<HTMLElement>("[data-entry-id]");
      const viewportMid = root.scrollTop + root.clientHeight / 2;
      cards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        const cardMid = rect.top + rect.height / 2;
        const dist = (cardMid - root.clientHeight / 2) / root.clientHeight;
        const y = Math.max(-18, Math.min(18, dist * -28));
        card.style.setProperty("--card-parallax", `${y}px`);
      });
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };

    root.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => root.removeEventListener("scroll", onScroll);
  }, [entries, reducedMotion]);

  return (
    <div
      ref={scrollRef}
      className="creating-gallery-scroll"
      data-view-region="gallery"
    >
      <div className="creating-gallery-grid" role="list">
        {entries.map((entry) => (
          <CreatingWorkCard
            key={entry.id}
            entry={entry}
            variant="gallery"
            reducedMotion={reducedMotion}
            onOpen={onOpen}
            onHover={onHover}
            parallaxY={parallaxRef.current.get(entry.id) ?? 0}
          />
        ))}
      </div>
    </div>
  );
}
