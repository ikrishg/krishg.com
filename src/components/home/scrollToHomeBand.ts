import {
  pauseHomeLenisSnap,
  resumeHomeLenisSnap,
} from "~motion/homeLenisSnapControl";
import { getLenis, siteScrollTo } from "~motion/lenisStore";

const SURFACE_SELECTOR = ".home-scroll-surface";
const NAV_SELECTOR = ".home-navbar";

export const HOME_BAND_IDS = ["builder", "creator", "educator"] as const;

export function homeNavHeightPx(): number {
  const nav = document.querySelector<HTMLElement>(NAV_SELECTOR);
  if (nav && nav.offsetHeight > 0) return nav.offsetHeight;
  return 64;
}

function bandIndex(bandId: string): number {
  return HOME_BAND_IDS.indexOf(bandId as (typeof HOME_BAND_IDS)[number]);
}

function priorBandsOffsetHeight(bandIndex: number): number {
  let sum = 0;
  for (let j = 0; j < bandIndex; j++) {
    const band = document.getElementById(HOME_BAND_IDS[j]);
    if (band) sum += band.offsetHeight;
  }
  return sum;
}

/** Scroll offset where sticky band `bandId` sits flush under the navbar. */
export function homeBandScrollTarget(bandId: string): number {
  const i = bandIndex(bandId);
  if (i < 0) return 0;

  const surface = document.querySelector<HTMLElement>(SURFACE_SELECTOR);
  if (!surface) return 0;

  const navH = homeNavHeightPx();
  return Math.max(0, surface.offsetTop - navH + priorBandsOffsetHeight(i));
}

/**
 * Scroll to sticky band using measured band heights (not viewport steps).
 */
export function scrollToHomeBand(bandId: string) {
  const target = homeBandScrollTarget(bandId);
  if (bandIndex(bandId) < 0) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  pauseHomeLenisSnap();

  const restoreSnap = () => {
    resumeHomeLenisSnap();
  };

  siteScrollTo(target, {
    immediate: reduced,
    onComplete: restoreSnap,
  });

  if (reduced) {
    restoreSnap();
    return;
  }

  const lenis = getLenis();
  const fallback = window.setTimeout(restoreSnap, 900);

  if (lenis) {
    const onScroll = () => {
      if (Math.abs(lenis.scroll - target) < 2) {
        lenis.off("scroll", onScroll);
        window.clearTimeout(fallback);
        restoreSnap();
      }
    };
    lenis.on("scroll", onScroll);
    return;
  }

  if ("onscrollend" in window) {
    window.addEventListener(
      "scrollend",
      () => {
        window.clearTimeout(fallback);
        restoreSnap();
      },
      { once: true },
    );
  } else {
    window.setTimeout(restoreSnap, 700);
  }
}
