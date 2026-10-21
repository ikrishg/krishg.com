export type HeroAccent = "creator" | "builder" | "educator";

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
