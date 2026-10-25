import { useEffect } from "react";
import { subscribeScroll } from "~motion/lenisStore";
import { closingMobileNavAccent } from "./home-closing";
import {
  homeAccentCanvasHex,
  isPageAccent,
  type PageAccent,
} from "./hero-types";

const SECTION_SELECTOR = "[data-home-nav-theme]";
const TAIL_SELECTOR = ".home-closing-tail";
const PROBE_Y = 64;
const THEME_COLOR_META = 'meta[name="theme-color"]';
const DESKTOP_CLOSING_MQ = "(min-width: 768px)";

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

    const desktopClosingMq = window.matchMedia(DESKTOP_CLOSING_MQ);

    const pickActive = () => {
      const root = document.documentElement;
      const desktopClosingNav = desktopClosingMq.matches;

      const splashKey = root.dataset.homeSplash;
      if (
        splashKey &&
        splashKey in closingMobileNavAccent &&
        isPageAccent(closingMobileNavAccent[splashKey as keyof typeof closingMobileNavAccent])
      ) {
        setPageAccent(
          closingMobileNavAccent[splashKey as keyof typeof closingMobileNavAccent],
        );
        return;
      }

      if (desktopClosingNav) {
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
          const tailAtRest =
            rect.top <= PROBE_Y + 0.5 &&
            rect.bottom >= window.innerHeight - 2;
          if (tailAtRest) {
            setPageAccent("closing");
            return;
          }
        }
      }

      if (!desktopClosingMq.matches) {
        const navBottom =
          document.querySelector<HTMLElement>(".home-navbar")?.getBoundingClientRect()
            .bottom ?? PROBE_Y;
        const underY = navBottom + 2;
        const underBand = document
          .elementsFromPoint(window.innerWidth / 2, underY)
          .map((element) =>
            element.closest<HTMLElement>(
              ".home-closing-link--mobile, .home-footer",
            ),
          )
          .find((section): section is HTMLElement => Boolean(section));
        const underAccent = accentFromSection(underBand ?? null);
        if (underAccent) {
          setPageAccent(underAccent);
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
    const onMqChange = () => pickActive();
    const onWindowScroll = () => {
      if (!desktopClosingMq.matches) pickActive();
    };
    const onWheel = () => {
      pickActive();
    };
    const onSplashActivate = (event: Event) => {
      const key = (event as CustomEvent<{ key?: string }>).detail?.key;
      if (
        key &&
        key in closingMobileNavAccent &&
        isPageAccent(
          closingMobileNavAccent[key as keyof typeof closingMobileNavAccent],
        )
      ) {
        setPageAccent(
          closingMobileNavAccent[key as keyof typeof closingMobileNavAccent],
        );
        return;
      }
      pickActive();
    };
    const onSplashTheme = () => {
      pickActive();
    };

    window.addEventListener("resize", pickActive);
    window.addEventListener("scroll", onWindowScroll, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("home-splash:activate", onSplashActivate);
    window.addEventListener("home-splash:immediate-clear", onSplashTheme);
    window.addEventListener("home-splash:schedule-clear", onSplashTheme);
    desktopClosingMq.addEventListener("change", onMqChange);

    return () => {
      offScroll();
      window.removeEventListener("resize", pickActive);
      window.removeEventListener("scroll", onWindowScroll);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("home-splash:activate", onSplashActivate);
      window.removeEventListener("home-splash:immediate-clear", onSplashTheme);
      window.removeEventListener("home-splash:schedule-clear", onSplashTheme);
      desktopClosingMq.removeEventListener("change", onMqChange);
    };
  }, []);

  return null;
}
