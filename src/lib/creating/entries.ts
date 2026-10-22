import type {
  CreatingCategory,
  CreatingCategoryFilter,
  CreatingEntry,
} from "./types";

export function filteredEntries(
  entries: CreatingEntry[],
  filter: CreatingCategoryFilter,
): CreatingEntry[] {
  if (filter === "all") return entries;
  return entries.filter((e) => e.category === filter);
}

export function categoriesPresent(
  entries: CreatingEntry[],
): CreatingCategory[] {
  const set = new Set<CreatingCategory>();
  entries.forEach((e) => set.add(e.category));
  return [...set];
}

export function timelineYearMarkers(
  entries: CreatingEntry[],
): { year: number; entryId: string }[] {
  const sorted = [...entries].sort(
    (a, b) => a.year - b.year || a.order - b.order,
  );
  const markers: { year: number; entryId: string }[] = [];
  let lastYear: number | null = null;
  for (const entry of sorted) {
    if (entry.year !== lastYear) {
      markers.push({ year: entry.year, entryId: entry.id });
      lastYear = entry.year;
    }
  }
  return markers;
}

export function isTextForwardCategory(category: CreatingCategory): boolean {
  return category === "poetry" || category === "prose";
}
