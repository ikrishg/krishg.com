import { useEffect } from "react";

const SECTION_SELECTOR = "[data-home-nav-theme]";
const COPY_SELECTOR = ".hero-copy";

function logoMorphPending(): boolean {
  return document.documentElement.dataset.logoMorph === "pending";
}

function revealCopy(copy: HTMLElement) {
  if (copy.dataset.revealed === "true") return;
  if (logoMorphPending()) return;
  copy.dataset.revealed = "true";
}

/**
 * One-shot staggered rise for hero copy when a band becomes the active
 * viewport subject. Waits for the logo morph handoff so the first band
 * doesn't animate under the page loader.
 */
export default function HomeHeroCopyMotion() {
  useEffect(() => {
    const reduced =
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ??
      false;

    const copies = Array.from(
      document.querySelectorAll<HTMLElement>(COPY_SELECTOR),
    );
    if (!copies.length) return;

    if (reduced) {
      for (const copy of copies) copy.dataset.revealed = "true";
      return;
    }

    const revealVisible = () => {
      for (const section of document.querySelectorAll<HTMLElement>(
        SECTION_SELECTOR,
      )) {
        const copy = section.querySelector<HTMLElement>(COPY_SELECTOR);
        if (!copy || copy.dataset.revealed === "true") continue;
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

    const morphObserver = new MutationObserver(() => {
      if (!logoMorphPending()) {
        morphObserver.disconnect();
        revealVisible();
      }
    });
    morphObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-logo-morph"],
    });

    if (!logoMorphPending()) revealVisible();

    return () => {
      observer.disconnect();
      morphObserver.disconnect();
    };
  }, []);

  return null;
}
