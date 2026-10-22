const NAV_VAR = "--home-nav-height";
const SURFACE_SELECTOR = ".home-scroll-surface";

export const HOME_BAND_IDS = ["builder", "creator", "educator"] as const;

function navHeightPx(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(
    NAV_VAR,
  );
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 64;
}

function bandIndex(bandId: string): number {
  return HOME_BAND_IDS.indexOf(bandId as (typeof HOME_BAND_IDS)[number]);
}

/**
 * Scroll to sticky band i using the homepage scroll-surface origin and
 * viewport-sized band steps (not section offsetTop while stuck).
 */
export function scrollToHomeBand(bandId: string) {
  const i = bandIndex(bandId);
  if (i < 0) return;

  const surface = document.querySelector<HTMLElement>(SURFACE_SELECTOR);
  if (!surface) return;

  const navH = navHeightPx();
  const step = window.innerHeight - navH;
  const target = surface.offsetTop - navH + i * step;

  const root = document.documentElement;
  const prevSnap = root.style.scrollSnapType;
  root.style.scrollSnapType = "none";

  const restoreSnap = () => {
    root.style.scrollSnapType = prevSnap;
  };

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  window.scrollTo({
    top: Math.max(0, target),
    behavior: reduced ? "auto" : "smooth",
  });

  if (reduced) {
    restoreSnap();
    return;
  }

  const fallback = window.setTimeout(restoreSnap, 900);
  const onScrollEnd = () => {
    window.clearTimeout(fallback);
    restoreSnap();
  };

  if ("onscrollend" in window) {
    window.addEventListener("scrollend", onScrollEnd, { once: true });
  } else {
    window.setTimeout(restoreSnap, 700);
  }
}
