import type Lenis from "lenis";

let lenisInstance: Lenis | null = null;

export function setLenisInstance(instance: Lenis | null) {
  lenisInstance = instance;
}

export function getLenis(): Lenis | null {
  return lenisInstance;
}

export function getScrollY(): number {
  return lenisInstance?.scroll ?? window.scrollY;
}

/** Scroll listeners: Lenis when active, otherwise native `scroll`. */
export function subscribeScroll(listener: () => void): () => void {
  const lenis = lenisInstance;
  if (lenis) {
    lenis.on("scroll", listener);
    return () => lenis.off("scroll", listener);
  }
  window.addEventListener("scroll", listener, { passive: true });
  return () => window.removeEventListener("scroll", listener);
}

export type LenisScrollToOptions = {
  immediate?: boolean;
  duration?: number;
  lock?: boolean;
  onComplete?: () => void;
};

export function siteScrollTo(
  target: number | string | Element,
  options?: LenisScrollToOptions,
) {
  const lenis = lenisInstance;
  if (lenis) {
    lenis.scrollTo(target, options);
    return;
  }
  const top =
    typeof target === "number"
      ? target
      : typeof target === "string"
        ? (document.querySelector(target)?.getBoundingClientRect().top ??
          window.scrollY)
        : target.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({
    top,
    behavior: options?.immediate ? "auto" : "smooth",
  });
  options?.onComplete?.();
}
