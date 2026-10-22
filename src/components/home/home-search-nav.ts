import { scrollToHomeBand } from "./scrollToHomeBand";
import type { SiteSearchEntry } from "./home-search-index";

export function isHomePagePath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return normalized === "/";
}

export function bandIdFromSearchHref(href: string): string | null {
  if (href.startsWith("/#")) return href.slice(2);
  if (href.startsWith("#")) return href.slice(1);
  return null;
}

export function navigateSearchEntry(entry: SiteSearchEntry) {
  const bandId = bandIdFromSearchHref(entry.href);
  const onHome = isHomePagePath(window.location.pathname);

  if (bandId && onHome) {
    history.replaceState(null, "", `/#${bandId}`);
    scrollToHomeBand(bandId);
    return;
  }

  if (bandId && !onHome) {
    window.location.assign(`/#${bandId}`);
    return;
  }

  window.location.assign(entry.href);
}
