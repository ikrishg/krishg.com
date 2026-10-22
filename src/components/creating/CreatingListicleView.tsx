import type { CreatingEntry } from "~lib/creating/types";
import { CreatingWorkCard } from "./CreatingWorkCard";

type Props = {
  entries: CreatingEntry[];
  activeEntryIds: Set<string>;
  reducedMotion: boolean;
  transitionEntryId: string | null;
  onOpen: (id: string, el: HTMLElement) => void;
  onHover: (id: string | null) => void;
};

export function CreatingListicleView({
  entries,
  activeEntryIds,
  reducedMotion,
  transitionEntryId,
  onOpen,
  onHover,
}: Props) {
  return (
    <div className="creating-listicle-wrap" data-view-region="listicle">
      <ol className="creating-listicle-dom" aria-label="Works list">
        {entries.map((entry) => (
          <li key={entry.id} className="creating-listicle-dom__item">
            <CreatingWorkCard
              entry={entry}
              variant="listicle"
              filterActive={activeEntryIds.has(entry.id)}
              reducedMotion={reducedMotion}
              transitionEntryId={transitionEntryId}
              onOpen={onOpen}
              onHover={onHover}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
