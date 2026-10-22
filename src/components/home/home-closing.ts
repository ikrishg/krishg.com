/** Splash + link tokens for the homepage closing index. */

export type ClosingSplashKey =
  | "building"
  | "creating"
  | "educating"
  | "about"
  | "now"
  | "sitemap";

/** Full-screen splash fill colours */
export const closingSplashHex: Record<ClosingSplashKey, string> = {
  building: "#398fd0",
  creating: "#b94a3f",
  educating: "#c99220",
  about: "#7459bd",
  now: "#1f8254",
  sitemap: "#a8488d",
};

/** Link + focus ring ink while a splash is active */
export const closingSplashInkHex: Record<ClosingSplashKey, string> = {
  building: "#141a2b",
  creating: "#fff9ec",
  educating: "#252d45",
  about: "#fff9ec",
  now: "#fff9ec",
  sitemap: "#fff9ec",
};

export type ClosingLink = {
  key: ClosingSplashKey;
  label: string;
  href: string;
  bandId?: string;
};

export const closingBandRow: ClosingLink[] = [
  { key: "building", label: "building", href: "#builder", bandId: "builder" },
  { key: "creating", label: "creating", href: "#creator", bandId: "creator" },
  {
    key: "educating",
    label: "educating",
    href: "#educator",
    bandId: "educator",
  },
];

export const closingNavRow: ClosingLink[] = [
  { key: "about", label: "about", href: "/about" },
  { key: "now", label: "now", href: "/now" },
  { key: "sitemap", label: "sitemap", href: "/sitemap" },
];
