import { useEffect } from "react";
import type { HeroAccent } from "./hero-types";
import { homeNavThemes } from "./hero-types";

const SECTION_SELECTOR = "[data-home-nav-theme]";
const PROBE_Y = 64;

function applyTheme(accent: HeroAccent) {
  const theme = homeNavThemes[accent];
  const header = document.querySelector<HTMLElement>(".home-navbar");
  if (!header) return;

  header.style.setProperty("--home-nav-bg", theme.bg);
  header.style.setProperty("--home-nav-fg", theme.fg);
  header.style.setProperty("--home-nav-logo", theme.logo);
  header.style.setProperty("--home-nav-muted", theme.muted);
  header.dataset.navTheme = accent;
}

function applyFooterTheme() {
  const header = document.querySelector<HTMLElement>(".home-navbar");
  if (!header) return;
  header.style.setProperty("--home-nav-bg", "var(--home-footer-bg)");
  header.style.setProperty("--home-nav-fg", "var(--home-footer-ink)");
  header.style.setProperty("--home-nav-logo", "var(--home-footer-ink)");
  header.dataset.navTheme = "footer";
}

function pageAccentFromDom(): HeroAccent | null {
  const value = document.documentElement.dataset.pageAccent;
  if (value === "builder" || value === "creator" || value === "educator") {
    return value;
  }
  return null;
}

export default function HomeNavbarTheme() {
  useEffect(() => {
    const fixed = pageAccentFromDom();
    if (fixed) {
      applyTheme(fixed);
      return;
    }

    const sections = Array.from(
      document.querySelectorAll<HTMLElement>(SECTION_SELECTOR),
    );
    if (!sections.length) return;

    const initial = sections[0].dataset.homeNavTheme as HeroAccent | undefined;
    if (initial) applyTheme(initial);

    const pickActive = () => {
      const topmost = document
        .elementsFromPoint(window.innerWidth / 2, PROBE_Y + 1)
        .map((element) => element.closest<HTMLElement>(SECTION_SELECTOR))
        .find((section): section is HTMLElement => section !== null);
      if (topmost) {
        const accent = topmost.dataset.homeNavTheme as HeroAccent | undefined;
        if (accent) applyTheme(accent);
        return;
      }

      let best: HTMLElement | null = null;
      let bestTop = -Infinity;

      for (const section of sections) {
        const rect = section.getBoundingClientRect();
        if (rect.top <= PROBE_Y && rect.bottom > PROBE_Y) {
          if (rect.top >= bestTop) {
            bestTop = rect.top;
            best = section;
          }
        }
      }

      if (best) {
        const accent = best.dataset.homeNavTheme as HeroAccent | undefined;
        if (accent) applyTheme(accent);
        return;
      }

      const last = sections[sections.length - 1];
      const lastRect = last?.getBoundingClientRect();
      if (lastRect && lastRect.bottom < PROBE_Y) {
        applyFooterTheme();
        return;
      }

      const footer = document.querySelector<HTMLElement>(".home-footer");
      if (footer) {
        const rect = footer.getBoundingClientRect();
        if (rect.top <= PROBE_Y) {
          applyFooterTheme();
        }
      }
    };

    pickActive();
    window.addEventListener("scroll", pickActive, { passive: true });
    window.addEventListener("resize", pickActive);

    return () => {
      window.removeEventListener("scroll", pickActive);
      window.removeEventListener("resize", pickActive);
    };
  }, []);

  return null;
}
