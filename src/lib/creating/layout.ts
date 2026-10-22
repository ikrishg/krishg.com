import type { CreatingEntry, CreatingView } from "./types";

export type TileLayout = {
  theta: number;
  y: number;
  row: number;
  isYearLabel?: boolean;
  yearLabel?: number;
};

const ROWS_GALLERY = 3;
const CYLINDER_RADIUS = 10.5;

export function parallaxForView(view: CreatingView): number[] {
  switch (view) {
    case "gallery":
      return [0.8, 1, 0.6];
    case "listicle":
      return [0.29, 1, 0.33];
    case "timeline":
      return [0.7, 1];
    default:
      return [1, 1, 1];
  }
}

export function layoutsForView(
  entries: CreatingEntry[],
  view: CreatingView,
): TileLayout[] {
  const n = entries.length;
  if (n === 0) return [];

  if (view === "gallery") {
    const perRow = Math.ceil(n / ROWS_GALLERY);
    const spacing = (Math.PI * 2) / perRow;
    return entries.map((_, i) => {
      const row = i % ROWS_GALLERY;
      const col = Math.floor(i / ROWS_GALLERY);
      const theta = col * spacing;
      const y = (row - 1) * 0.7;
      return { theta, y, row };
    });
  }

  if (view === "listicle") {
    const spacing = 0.55;
    return entries.map((_, i) => ({
      theta: 0,
      y: (i - (n - 1) / 2) * spacing,
      row: 1,
    }));
  }

  const sorted = [...entries].sort((a, b) => a.year - b.year || a.order - b.order);
  const layoutById = new Map<string, TileLayout>();
  const rowCount = 2;
  const columns = Math.ceil(n / rowCount);
  const spacing = (Math.PI * 2) / columns;

  sorted.forEach((entry, idx) => {
    const row = idx % rowCount;
    const col = Math.floor(idx / rowCount);
    layoutById.set(entry.id, {
      theta: col * spacing,
      y: (row - 0.5) * 0.55,
      row,
    });
  });

  return entries.map((entry) => layoutById.get(entry.id)!);
}

export function timelineYearMarkers(entries: CreatingEntry[]): { year: number; theta: number }[] {
  const sorted = [...entries].sort((a, b) => a.year - b.year || a.order - b.order);
  const markers: { year: number; theta: number }[] = [];
  const rowCount = 2;
  const columns = Math.ceil(sorted.length / rowCount);
  const spacing = (Math.PI * 2) / columns;
  let lastYear: number | null = null;
  sorted.forEach((entry, idx) => {
    const col = Math.floor(idx / rowCount);
    if (entry.year !== lastYear) {
      markers.push({ year: entry.year, theta: col * spacing });
      lastYear = entry.year;
    }
  });
  return markers;
}

export function tileWorldPosition(
  layout: TileLayout,
  view: CreatingView,
  rowDelta: number,
  id: number,
  stagger: number,
): [number, number, number] {
  const r = CYLINDER_RADIUS + Math.sin(id * 6510) * 0.01;
  let theta = layout.theta + rowDelta;
  let y = layout.y;

  if (view === "listicle") {
    theta += rowDelta;
    const x = r * Math.sin(theta);
    const z = r * Math.cos(theta);
    return [y, x, z];
  }

  theta += rowDelta;
  const x = r * Math.sin(theta);
  const z = r * Math.cos(theta);
  y += Math.sin(id * 181) * 2 * stagger;
  return [x, y, z];
}

export function maxPictureSize(view: CreatingView): number {
  if (view === "gallery") return 1.7;
  return 0.6;
}
