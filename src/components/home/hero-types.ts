export type HeroAccent = "creator" | "builder" | "educator";

/** Active surface accent on `<html data-page-accent>` — heroes plus cream footer. */
export type PageAccent = HeroAccent | "footer";

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
  footer: "#f3f0ea",
};

export function isPageAccent(value: string | undefined | null): value is PageAccent {
  return (
    value === "builder" ||
    value === "creator" ||
    value === "educator" ||
    value === "footer"
  );
}

export type HomeNavTheme = {
  bg: string;
  fg: string;
  logo: string;
  muted: string;
};

/** Scene / ink tokens from krish-3d-objects `styles.css` */
export const homeNavThemes: Record<HeroAccent, HomeNavTheme> = {
  builder: {
    bg: "var(--home-builder-bg)",
    fg: "var(--home-builder-fg)",
    logo: "var(--home-builder-fg)",
    muted: "color-mix(in srgb, var(--home-builder-muted) 88%, transparent)",
  },
  creator: {
    bg: "var(--home-creator-bg)",
    fg: "var(--home-creator-fg)",
    logo: "var(--home-creator-fg)",
    muted: "color-mix(in srgb, var(--home-creator-muted) 88%, transparent)",
  },
  educator: {
    bg: "var(--home-educator-bg)",
    fg: "var(--home-educator-fg)",
    logo: "var(--home-educator-fg)",
    muted: "color-mix(in srgb, var(--home-educator-muted) 82%, transparent)",
  },
};
