export type HeroAccent = "creator" | "builder" | "educator";

/** Active surface accent on `<html data-page-accent>`. */
export type PageAccent =
  | HeroAccent
  | "closing"
  | "about"
  | "now"
  | "sitemap";

export const homeGlbPaths = {
  creator: "/home-3d/portrait-frame.glb",
  builder: "/home-3d/computer.glb",
  educator: "/home-3d/book.glb",
} as const;

export const homeTexturePaths = {
  creator: "/home-3d/img/portrait.webp",
  builder: "/home-3d/img/computer.webp",
  educator: "/home-3d/img/book-cover.webp",
} as const;

/** Resolved canvas / `theme-color` hexes for browser chrome + meta. */
export const homeAccentCanvasHex: Record<PageAccent, string> = {
  builder: "#398fd0",
  creator: "#b94a3f",
  educator: "#d8a12a",
  closing: "#e7ddcc",
  about: "#7459bd",
  now: "#1f8254",
  sitemap: "#a8488d",
};

export function isPageAccent(
  value: string | undefined | null,
): value is PageAccent {
  return (
    value === "builder" ||
    value === "creator" ||
    value === "educator" ||
    value === "closing" ||
    value === "about" ||
    value === "now" ||
    value === "sitemap"
  );
}
