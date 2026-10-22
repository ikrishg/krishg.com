const NAV_VAR = "--home-nav-height";

function navHeightPx(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(
    NAV_VAR,
  );
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 64;
}

/** Scroll so a sticky hero band sits at its natural start (below the navbar). */
export function scrollToHomeBand(bandId: string) {
  const section = document.getElementById(bandId);
  if (!section) return;

  const nav = navHeightPx();
  const target = section.offsetTop - nav;
  window.scrollTo({
    top: Math.max(0, target),
    behavior:
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
  });
}
