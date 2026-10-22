import { useEffect } from "react";
import type { CreatingEntry } from "~lib/creating/types";
import { CreatingWorkCard } from "./CreatingWorkCard";

type Props = {
  entries: CreatingEntry[];
  reducedMotion: boolean;
  transitionEntryId: string | null;
  onOpen: (id: string, el: HTMLElement) => void;
  onHover: (id: string | null) => void;
};

export function CreatingGalleryGrid({
  entries,
  reducedMotion,
  transitionEntryId,
  onOpen,
  onHover,
}: Props) {
  useEffect(() => {
    const root = document.querySelector(
      '[data-view-region="gallery"]',
    );
    if (!(root instanceof HTMLElement) || reducedMotion) return;

    let ticking = false;
    const update = () => {
      ticking = false;
      const cards = root.querySelectorAll<HTMLElement>("[data-entry-id]");
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
    <div className="creating-gallery-grid-wrap" data-view-region="gallery">
      <div className="creating-gallery-grid" role="list">
        {entries.map((entry) => (
          <CreatingWorkCard
            key={entry.id}
            entry={entry}
            variant="gallery"
            reducedMotion={reducedMotion}
            transitionEntryId={transitionEntryId}
            onOpen={onOpen}
            onHover={onHover}
          />
        ))}
      </div>
    </div>
  );
}
