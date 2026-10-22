import { useEffect, useRef } from "react";
import { useTempus } from "tempus/react";
import { getLenis } from "./lenisStore";

const BAND_SELECTOR = "[data-home-scroll-band]";
const CLOSING_PRIMARY = ".home-closing-link--primary";

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

/** 0 → entering, 1 → band centered in viewport. */
function bandProgress(rect: DOMRect, vh: number) {
  const center = rect.top + rect.height * 0.5;
  const viewMid = vh * 0.52;
  const span = vh * 0.72;
  const raw = 1 - Math.abs(center - viewMid) / span;
  return easeOutCubic(clamp01(raw));
}

function linkProgress(rect: DOMRect, vh: number) {
  const enter = vh * 0.92;
  const raw = (enter - rect.top) / (vh * 0.35);
  return easeOutCubic(clamp01(raw));
}

/**
 * Homepage scroll-linked transforms (opacity / translate only), driven from
 * Lenis scroll position on the shared Tempus loop.
 */
export default function HomeScrollExperience() {
  const reducedRef = useRef(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reducedRef.current = mq.matches;
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useTempus(
    () => {
      if (reducedRef.current || window.location.pathname !== "/") return;
      const lenis = getLenis();
      if (!lenis) return;

      const vh = window.innerHeight;
      void lenis.scroll;

      const bands = document.querySelectorAll<HTMLElement>(BAND_SELECTOR);
      for (const band of bands) {
        const progress = bandProgress(band.getBoundingClientRect(), vh);
        band.style.setProperty("--band-progress", progress.toFixed(4));
        const parallax = (1 - progress) * 28;
        band.style.setProperty("--band-parallax", `${parallax.toFixed(2)}px`);
        const artifactShift = (1 - progress) * -16;
        band.style.setProperty(
          "--artifact-parallax",
          `${artifactShift.toFixed(2)}px`,
        );
      }

      const links = document.querySelectorAll<HTMLElement>(CLOSING_PRIMARY);
      links.forEach((link, index) => {
        const stagger = index * 0.08;
        const raw = linkProgress(link.getBoundingClientRect(), vh) - stagger;
        const p = easeOutCubic(clamp01(raw));
        link.style.setProperty("--link-in", p.toFixed(4));
      });

      const closing = document.getElementById("home-closing-index");
      if (closing) {
        const p = bandProgress(closing.getBoundingClientRect(), vh);
        closing.style.setProperty("--closing-progress", p.toFixed(4));
      }
    },
    { order: 0, label: "home-scroll" },
  );

  return null;
}
