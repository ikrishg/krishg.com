import type { PageAccent } from "./hero-types";

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
  educating: "#d8a12a",
  about: "#7459bd",
  now: "#1f8254",
  sitemap: "#a8488d",
};

/** Link + focus ring ink while a splash is active */
export const closingSplashInkHex: Record<ClosingSplashKey, string> = {
  building: "#141a2b",
  creating: "#fff9ec",
  educating: "#141a2b",
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
  { key: "building", label: "building", href: "/building" },
  { key: "creating", label: "creating", href: "/creating" },
  { key: "educating", label: "educating", href: "/educating" },
];

export const closingNavRow: ClosingLink[] = [
  { key: "about", label: "about", href: "/about" },
  { key: "now", label: "now", href: "/now" },
  { key: "sitemap", label: "sitemap", href: "/sitemap" },
];

/** Mobile stack order: three band links then three nav links. */
export const closingMobileLinks: ClosingLink[] = [
  ...closingBandRow,
  ...closingNavRow,
];

/** Static ink on mobile colour blocks (no hover splash). */
/** Navbar / theme-color accent while a mobile closing band is under the nav. */
export const closingMobileNavAccent: Record<ClosingSplashKey, PageAccent> = {
  building: "builder",
  creating: "creator",
  educating: "educator",
  about: "about",
  now: "now",
  sitemap: "sitemap",
};

export const closingMobileInkHex: Record<ClosingSplashKey, string> = {
  building: "#141a2b",
  creating: "#fff9ec",
  educating: "#141a2b",
  about: "#fff9ec",
  now: "#fff9ec",
  sitemap: "#fff9ec",
};
