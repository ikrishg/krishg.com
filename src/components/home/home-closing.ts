/** Splash + link tokens for the homepage closing index. */

export type ClosingSplashKey =
  | "building"
  | "creating"
  | "educating"
  | "about"
  | "now"
  | "sitemap";

export const closingSplashHex: Record<ClosingSplashKey, string> = {
  building: "#398fd0",
  creating: "#b94a3f",
  educating: "#d8a12a",
  about: "#7a52c4",
  now: "#3a9660",
  sitemap: "#b44787",
};

export type ClosingLink = {
  key: ClosingSplashKey;
  label: string;
  href: string;
  underlined?: boolean;
};

export const closingBandRow: ClosingLink[] = [
  { key: "building", label: "building", href: "#builder", underlined: true },
  { key: "creating", label: "creating", href: "#creator", underlined: true },
  { key: "educating", label: "educating", href: "#educator", underlined: true },
];

export const closingNavRow: ClosingLink[] = [
  { key: "about", label: "about", href: "/about" },
  { key: "now", label: "now", href: "/now" },
  { key: "sitemap", label: "sitemap", href: "/sitemap" },
];
