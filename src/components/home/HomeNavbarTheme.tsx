import { useEffect } from "react";
import { subscribeScroll } from "~motion/lenisStore";
import {
  homeAccentCanvasHex,
  isPageAccent,
  type PageAccent,
} from "./hero-types";

const SECTION_SELECTOR = "[data-home-nav-theme]";
const TAIL_SELECTOR = ".home-closing-tail";
const PROBE_Y = 64;
const THEME_COLOR_META = 'meta[name="theme-color"]';

/**
 * Single pathway for surface accent: set `html[data-page-accent]`.
 * CSS maps that attribute to canvas, navbar, and loader colors.
 * `theme-color` meta follows so mobile browser chrome matches the band.
 */
export function setPageAccent(accent: PageAccent) {
  const root = document.documentElement;
  if (root.dataset.pageAccent === accent) {
    syncThemeColor(accent);
    return;
  }
  root.dataset.pageAccent = accent;
  syncThemeColor(accent);
}

/**
 * WebKit (Safari / Chrome on iOS) often ignores in-place `content` updates on
 * theme-color. Remove and re-insert so the browser chrome picks up the band.
 */
function syncThemeColor(accent: PageAccent) {
  const hex = homeAccentCanvasHex[accent];
  for (const meta of document.querySelectorAll(THEME_COLOR_META)) {
    meta.remove();
  }
  const medias = [
    undefined,
    "(prefers-color-scheme: light)",
    "(prefers-color-scheme: dark)",
  ] as const;
  for (const media of medias) {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = hex;
    if (media) meta.media = media;
    document.head.appendChild(meta);
  }
}

function accentFromSection(section: HTMLElement | null): PageAccent | null {
  const value = section?.dataset.homeNavTheme;
  return isPageAccent(value) ? value : null;
}

function pageAccentFromDom(): PageAccent | null {
  return isPageAccent(document.documentElement.dataset.pageAccent)
    ? document.documentElement.dataset.pageAccent
    : null;
}

export default function HomeNavbarTheme() {
  useEffect(() => {
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>(SECTION_SELECTOR),
    );

    if (!sections.length) {
      const fixed = pageAccentFromDom();
      if (fixed) setPageAccent(fixed);
      return;
    }

    const pickActive = () => {
      const root = document.documentElement;
      if (
        root.dataset.overscrollReveal === "true" ||
        root.dataset.overscrollPulling === "true"
      ) {
        setPageAccent("closing");
        return;
      }

      const tail = document.querySelector<HTMLElement>(TAIL_SELECTOR);
      if (tail) {
        const rect = tail.getBoundingClientRect();
        if (rect.top <= PROBE_Y + 0.5) {
          setPageAccent("closing");
          return;
        }
      }

      const topmost = document
        .elementsFromPoint(window.innerWidth / 2, PROBE_Y + 1)
        .map((element) => element.closest<HTMLElement>(SECTION_SELECTOR))
        .find((section): section is HTMLElement => Boolean(section));
      const fromPoint = accentFromSection(topmost ?? null);
      if (fromPoint) {
        setPageAccent(fromPoint);
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

      const fromBest = accentFromSection(best);
      if (fromBest) setPageAccent(fromBest);
    };

    pickActive();
    const offScroll = subscribeScroll(pickActive);
    window.addEventListener("resize", pickActive);

    return () => {
      offScroll();
      window.removeEventListener("resize", pickActive);
    };
  }, []);

  return null;
}
