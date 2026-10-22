import type { CreatingEntry } from "~lib/creating/types";

type Props = {
  entries: CreatingEntry[];
  pointerFine: boolean;
  onOpen: (id: string) => void;
  onHover: (id: string | null) => void;
};

export function WorksIndexNav({
  entries,
  pointerFine,
  onOpen,
  onHover,
}: Props) {
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
              onFocus={() => onHover(e.id)}
              onBlur={() => onHover(null)}
            >
              {e.title}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
