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
  header.style.setProperty(
    "--home-nav-muted",
    "color-mix(in srgb, var(--home-footer-ink) 55%, var(--home-footer-bg))",
  );
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
    ).filter((section) => section.dataset.homeNavTheme !== "footer");
    if (!sections.length) return;

    const initial = sections[0].dataset.homeNavTheme as HeroAccent | undefined;
    if (initial) applyTheme(initial);

    const pickActive = () => {
      const footer = document.querySelector<HTMLElement>(".home-footer");
      if (footer) {
        const footerRect = footer.getBoundingClientRect();
        if (footerRect.top <= PROBE_Y + 1) {
          applyFooterTheme();
          return;
        }
      }

      const topmost = document
        .elementsFromPoint(window.innerWidth / 2, PROBE_Y + 1)
        .map((element) => element.closest<HTMLElement>(SECTION_SELECTOR))
        .find((section): section is HTMLElement => {
          if (!section) return false;
          return section.dataset.homeNavTheme !== "footer";
        });
      if (topmost) {
        const theme = topmost.dataset.homeNavTheme;
        if (
          theme === "builder" ||
          theme === "creator" ||
          theme === "educator"
        ) {
          applyTheme(theme);
          return;
        }
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
        const theme = best.dataset.homeNavTheme;
        if (
          theme === "builder" ||
          theme === "creator" ||
          theme === "educator"
        ) {
          applyTheme(theme);
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
