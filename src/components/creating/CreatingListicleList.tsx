import { useMemo } from "react";
import type { CreatingEntry } from "~lib/creating/types";
import { useCreatingStore } from "./creating-store";

const LISTICLE_SPACING = 0.55;
const ITEM_HEIGHT_PX = 44;

type Props = {
  entries: CreatingEntry[];
  hoveredId: string | null;
};

export function CreatingListicleList({ entries, hoveredId }: Props) {
  const scrollY = useCreatingStore((s) => s.listicleScrollY);

  const { activeIndex, translateY } = useMemo(() => {
    const n = entries.length;
    if (n === 0) return { activeIndex: 0, translateY: 0 };
    const centered = (n - 1) / 2 - scrollY / LISTICLE_SPACING;
    const activeIndex = Math.max(0, Math.min(n - 1, Math.round(centered)));
    const translateY = ((n - 1) / 2 - centered) * ITEM_HEIGHT_PX;
    return { activeIndex, translateY };
  }, [entries.length, scrollY]);

  return (
    <ol
      className="creating-listicle"
      aria-label="Work titles"
      style={{ transform: `translateY(${translateY}px)` }}
    >
      {entries.map((entry, index) => (
        <li
          key={entry.id}
          className="creating-listicle__item"
          data-active={
            entry.id === hoveredId || index === activeIndex ? "true" : undefined
          }
        >
          <span className="creating-listicle__line" aria-hidden="true" />
          {entry.title}
        </li>
      ))}
    </ol>
  );
}
