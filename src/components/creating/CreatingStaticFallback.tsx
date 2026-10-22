import type { CreatingEntry, CreatingCategoryFilter } from "~lib/creating/types";
import { CATEGORY_LABELS } from "~lib/creating/types";

type Props = {
  entries: CreatingEntry[];
  filter: CreatingCategoryFilter;
  onOpenEntry: (id: string) => void;
};

export function CreatingStaticFallback({
  entries,
  filter,
  onOpenEntry,
}: Props) {
  const filtered =
    filter === "all" ? entries : entries.filter((e) => e.category === filter);

  return (
    <section className="creating-static" aria-labelledby="creating-static-heading">
      <h2 id="creating-static-heading" className="sr-only">
        Works list
      </h2>
      <ul className="creating-static__list">
        {filtered.map((entry) => (
          <li key={entry.id} className="creating-static__item">
            <button
              type="button"
              className="creating-static__open"
              onClick={() => onOpenEntry(entry.id)}
            >
              <img src={entry.cover} alt="" width={120} height={150} loading="lazy" />
              <span className="creating-static__copy">
                <span className="creating-static__title">{entry.title}</span>
                <span className="creating-static__meta">
                  {CATEGORY_LABELS[entry.category]}
                  {entry.year ? ` · ${entry.year}` : ""}
                </span>
                <span className="creating-static__body">{entry.body}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
