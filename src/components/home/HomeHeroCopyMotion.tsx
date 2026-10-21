import { useEffect } from "react";
import {
  introAllowsCopyReveal,
  introSkipped,
  prefersReducedMotion,
} from "./homeIntro";

const SECTION_SELECTOR = "[data-home-nav-theme]";
const COPY_SELECTOR = ".hero-copy";

function revealCopy(copy: HTMLElement) {
  if (copy.dataset.revealed) return;
  if (!introAllowsCopyReveal()) return;
  copy.dataset.revealed = "true";
}

/**
 * One-shot staggered rise for hero copy when a band becomes the active
 * viewport subject. Waits for intro phase "ready" so the first band never
 * animates under the page loader.
 */
export default function HomeHeroCopyMotion() {
  useEffect(() => {
    const copies = Array.from(
      document.querySelectorAll<HTMLElement>(COPY_SELECTOR),
    );
    if (!copies.length) return;

    if (prefersReducedMotion()) {
      for (const copy of copies) copy.dataset.revealed = "true";
      return;
    }

    if (introSkipped()) {
      for (const section of document.querySelectorAll<HTMLElement>(
        SECTION_SELECTOR,
      )) {
        const copy = section.querySelector<HTMLElement>(COPY_SELECTOR);
        if (!copy) continue;
        const rect = section.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          copy.dataset.revealed = "static";
        }
      }
    }

    const root = document.documentElement;
    root.dataset.copyReveal = "armed";

    const revealVisible = () => {
      if (!introAllowsCopyReveal()) return;
      for (const section of document.querySelectorAll<HTMLElement>(
        SECTION_SELECTOR,
      )) {
        const copy = section.querySelector<HTMLElement>(COPY_SELECTOR);
        if (!copy || copy.dataset.revealed) continue;
        const rect = section.getBoundingClientRect();
        const mid = window.innerHeight * 0.45;
        if (rect.top <= mid && rect.bottom >= mid) {
          revealCopy(copy);
        }
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const copy = entry.target.querySelector<HTMLElement>(COPY_SELECTOR);
          if (copy) revealCopy(copy);
        }
      },
      { threshold: 0.35, rootMargin: "-8% 0px -18% 0px" },
    );

    for (const section of document.querySelectorAll(SECTION_SELECTOR)) {
      if (!(section instanceof HTMLElement)) continue;
      if (!section.querySelector(COPY_SELECTOR)) continue;
      observer.observe(section);
    }

    const phaseObserver = new MutationObserver(() => {
      if (introAllowsCopyReveal()) {
        phaseObserver.disconnect();
        revealVisible();
      }
    });
    phaseObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-intro-phase"],
    });

    revealVisible();

    return () => {
      observer.disconnect();
      phaseObserver.disconnect();
      delete root.dataset.copyReveal;
    };
  }, []);

  return null;
}
