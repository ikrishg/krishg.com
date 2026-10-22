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

type BandCache = {
  progress: number;
  parallax: number;
  artifact: number;
};

/**
 * Homepage scroll-linked transforms (opacity / translate only), driven from
 * Lenis scroll position on the shared Tempus loop.
 */
export default function HomeScrollExperience() {
  const reducedRef = useRef(true);
  const bandCacheRef = useRef(new WeakMap<HTMLElement, BandCache>());
  const linkCacheRef = useRef(new WeakMap<HTMLElement, number>());
  const closingProgressRef = useRef<number | null>(null);

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
        const rect = band.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > vh) continue;

        const progress = bandProgress(rect, vh);
        const parallax = (1 - progress) * 28;
        const artifactShift = (1 - progress) * -16;

        const prev = bandCacheRef.current.get(band);
        if (
          prev &&
          Math.abs(prev.progress - progress) < 0.0005 &&
          Math.abs(prev.parallax - parallax) < 0.05 &&
          Math.abs(prev.artifact - artifactShift) < 0.05
        ) {
          continue;
        }

        bandCacheRef.current.set(band, {
          progress,
          parallax,
          artifact: artifactShift,
        });

        band.style.setProperty("--band-progress", progress.toFixed(4));
        band.style.setProperty("--band-parallax", `${parallax.toFixed(2)}px`);
        band.style.setProperty(
          "--artifact-parallax",
          `${artifactShift.toFixed(2)}px`,
        );
      }

      const links = document.querySelectorAll<HTMLElement>(CLOSING_PRIMARY);
      links.forEach((link, index) => {
        const rect = link.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > vh) return;

        const stagger = index * 0.08;
        const raw = linkProgress(rect, vh) - stagger;
        const p = easeOutCubic(clamp01(raw));
        const prev = linkCacheRef.current.get(link);
        if (prev !== undefined && Math.abs(prev - p) < 0.0005) return;
        linkCacheRef.current.set(link, p);
        link.style.setProperty("--link-in", p.toFixed(4));
      });

      const closing = document.getElementById("home-closing-index");
      if (closing) {
        const rect = closing.getBoundingClientRect();
        if (rect.bottom >= 0 && rect.top <= vh) {
          const p = bandProgress(rect, vh);
          if (
            closingProgressRef.current === null ||
            Math.abs(closingProgressRef.current - p) >= 0.0005
          ) {
            closingProgressRef.current = p;
            closing.style.setProperty("--closing-progress", p.toFixed(4));
          }
        }
      }
    },
    { order: 0, label: "home-scroll" },
  );

  return null;
}
