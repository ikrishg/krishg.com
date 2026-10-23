export type CreatingView = "gallery" | "listicle" | "timeline";

export type CreatingCategory =
  | "poetry"
  | "prose"
  | "photography"
  | "paintings"
  | "design";

export type CreatingEntry = {
  id: string;
  demo?: boolean;
  title: string;
  subtitle?: string;
  year: number;
  category: CreatingCategory;
  medium?: string;
  order: number;
  cover: string;
  body: string;
  published?: string;
};

export type CreatingCategoryFilter = "all" | CreatingCategory;

export const VIEW_LABELS: Record<CreatingView, string> = {
  gallery: "Gallery",
  listicle: "Listicle",
  timeline: "Timeline",
};

export const CATEGORY_LABELS: Record<CreatingCategory, string> = {
  poetry: "Poetry",
  prose: "Prose",
  photography: "Photography",
  paintings: "Paintings",
  design: "Design",
};

export const VIEW_TINT: Record<CreatingView, string> = {
  gallery: "#b94a3f",
  listicle: "#8f362e",
  timeline: "#d98a7f",
};

/** Category accents from the homepage closing palette. */
export const CATEGORY_ACCENT: Record<CreatingCategory, string> = {
  poetry: "#b94a3f",
  prose: "#398fd0",
  photography: "#d8a12a",
  paintings: "#7459bd",
  design: "#1f8254",
};

export const CREATING_PAPER = "#e7ddcc";
export const CREATING_CANVAS = "#b94a3f";
export const CREATING_INK = "#141a2b";
export const CREATING_ON_CANVAS = "#fff8ea";
