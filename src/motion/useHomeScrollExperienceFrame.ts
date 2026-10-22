import { useEffect, useRef } from "react";
import { getLenis } from "./lenisStore";

const BAND_SELECTOR = "[data-home-scroll-band]";
const CLOSING_PRIMARY = ".home-closing-link--primary";
const CLOSING_ID = "home-closing-index";

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function bandProgress(rect: DOMRect, vh: number) {
  const center = rect.top + rect.height * 0.5;
  const viewMid = vh * 0.52;
  const span = vh * 0.72;
  const raw = 1 - Math.abs(center - viewMid) / span;
  return easeOutCubic(clamp01(raw));
}

function linkProgressFromTop(top: number, vh: number) {
  const enter = vh * 0.92;
  const raw = (enter - top) / (vh * 0.35);
  return easeOutCubic(clamp01(raw));
}

function viewportTopFromOffset(el: HTMLElement): number {
  let top = 0;
  let node: HTMLElement | null = el;
  while (node) {
    top += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return top - window.scrollY;
}

type BandCache = {
  progress: number;
  parallax: number;
  artifact: number;
};

type BandSample = {
  band: HTMLElement;
  paint: HTMLElement | null;
  artifactParallax: HTMLElement | null;
  copy: HTMLElement | null;
  progress: number;
  parallax: number;
  artifact: number;
};

type LinkSample = {
  el: HTMLElement;
  p: number;
};

/** Returns a frame tick for homepage scroll-linked CSS vars (no Tempus subscription). */
export function useHomeScrollExperienceFrame() {
  const reducedRef = useRef(true);
  const bandCacheRef = useRef(new WeakMap<HTMLElement, BandCache>());
  const linkCacheRef = useRef(new WeakMap<HTMLElement, number>());
  const closingProgressRef = useRef<number | null>(null);
  const bandsRef = useRef<HTMLElement[]>([]);
  const linksRef = useRef<HTMLElement[]>([]);
  const closingRef = useRef<HTMLElement | null>(null);
  const lastScrollRef = useRef(0);
  const forceTickRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reducedRef.current = mq.matches;
    };
    sync();
    mq.addEventListener("change", sync);

    bandsRef.current = [
      ...document.querySelectorAll<HTMLElement>(BAND_SELECTOR),
    ];
    linksRef.current = [
      ...document.querySelectorAll<HTMLElement>(CLOSING_PRIMARY),
    ];
    closingRef.current = document.getElementById(CLOSING_ID);

    const onResize = () => {
      forceTickRef.current = true;
      lastScrollRef.current = Number.NaN;
    };
    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const tick = () => {
    if (reducedRef.current || window.location.pathname !== "/") return;
    const lenis = getLenis();
    if (!lenis) return;

    const scrollY = lenis.scroll;
    const force = forceTickRef.current;
    if (force) forceTickRef.current = false;

    if (
      !force &&
      Math.abs(lenis.velocity) < 0.02 &&
      Math.abs(scrollY - lastScrollRef.current) < 0.25
    ) {
      return;
    }
    lastScrollRef.current = scrollY;

    const vh = window.innerHeight;

    if (bandsRef.current.length === 0) {
      bandsRef.current = [
        ...document.querySelectorAll<HTMLElement>(BAND_SELECTOR),
      ];
      linksRef.current = [
        ...document.querySelectorAll<HTMLElement>(CLOSING_PRIMARY),
      ];
      closingRef.current = document.getElementById(CLOSING_ID);
    }

    const bandSamples: BandSample[] = [];
    for (const band of bandsRef.current) {
      const rect = band.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > vh) continue;

      const progress = bandProgress(rect, vh);
      const parallax = Math.round((1 - progress) * 28);
      const artifactShift = Math.round((1 - progress) * -16);

      const prev = bandCacheRef.current.get(band);
      if (
        prev &&
        Math.abs(prev.progress - progress) < 0.0005 &&
        Math.abs(prev.parallax - parallax) < 0.05 &&
        Math.abs(prev.artifact - artifactShift) < 0.05
      ) {
        continue;
      }

      bandSamples.push({
        band,
        paint: band.querySelector<HTMLElement>(".hero-band-paint"),
        artifactParallax: band.querySelector<HTMLElement>(
          ".artifact-stage__parallax",
        ),
        copy: band.querySelector<HTMLElement>(".hero-copy"),
        progress,
        parallax,
        artifact: artifactShift,
      });
    }

    const linkSamples: LinkSample[] = [];
    linksRef.current.forEach((link, index) => {
      const top = viewportTopFromOffset(link);
      if (top > vh || top + link.offsetHeight < 0) return;

      const stagger = index * 0.08;
      const p = easeOutCubic(clamp01(linkProgressFromTop(top, vh) - stagger));
      const prev = linkCacheRef.current.get(link);
      if (prev !== undefined && Math.abs(prev - p) < 0.0005) return;
      linkSamples.push({ el: link, p });
    });

    let closingP: number | null = null;
    const closing = closingRef.current;
    if (closing) {
      const rect = closing.getBoundingClientRect();
      if (rect.bottom >= 0 && rect.top <= vh) {
        const p = bandProgress(rect, vh);
        if (
          closingProgressRef.current === null ||
          Math.abs(closingProgressRef.current - p) >= 0.0005
        ) {
          closingP = p;
        }
      }
    }

    for (const sample of bandSamples) {
      bandCacheRef.current.set(sample.band, {
        progress: sample.progress,
        parallax: sample.parallax,
        artifact: sample.artifact,
      });
      const progressCss = sample.progress.toFixed(4);
      if (sample.paint) {
        sample.paint.style.setProperty("--band-parallax", `${sample.parallax}px`);
      }
      if (sample.artifactParallax) {
        sample.artifactParallax.style.setProperty(
          "--artifact-parallax",
          `${sample.artifact}px`,
        );
      }
      if (sample.copy) {
        sample.copy.style.setProperty("--band-progress", progressCss);
      }
    }

    for (const sample of linkSamples) {
      linkCacheRef.current.set(sample.el, sample.p);
      sample.el.style.setProperty("--link-in", sample.p.toFixed(4));
    }

    if (closing && closingP !== null) {
      closingProgressRef.current = closingP;
      closing.style.setProperty("--closing-progress", closingP.toFixed(4));
    }
  };

  return tick;
}
