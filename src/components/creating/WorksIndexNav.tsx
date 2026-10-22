import type { CreatingEntry } from "~lib/creating/types";
import { useCreatingStore } from "./creating-store";

type Props = {
  entries: CreatingEntry[];
  pointerFine: boolean;
  onOpen: (id: string) => void;
};

export function WorksIndexNav({ entries, pointerFine, onOpen }: Props) {
  const setHoveredId = useCreatingStore((s) => s.setHoveredId);

  return (
    <nav className="creating-works-index" aria-label="Works index">
      <p id="creating-works-hint">
        {pointerFine ? "Select" : "Tap"} any piece to open it.
      </p>
      <ol aria-labelledby="creating-works-hint">
        {entries.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onOpen(e.id)}
              onFocus={() => setHoveredId(e.id)}
              onBlur={() => setHoveredId(null)}
            >
              {e.title}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
