import type Lenis from "lenis";

let lenisInstance: Lenis | null = null;

export function setLenisInstance(instance: Lenis | null) {
  lenisInstance = instance;
  if (typeof window !== "undefined" && import.meta.env.DEV) {
    const win = window as Window & { __siteScrollTo?: (y: number) => void };
    if (instance) {
      win.__siteScrollTo = (y) => {
        siteScrollTo(y, { immediate: true });
      };
    } else {
      delete win.__siteScrollTo;
    }
  }
}

export function getLenis(): Lenis | null {
  return lenisInstance;
}

export function getScrollY(): number {
  return lenisInstance?.scroll ?? window.scrollY;
}

/** Scroll listeners: Lenis when active, with native `scroll` fallback. */
export function subscribeScroll(listener: () => void): () => void {
  let boundLenis: Lenis | null = null;

  const bindLenis = () => {
    const current = getLenis();
    if (current === boundLenis) return;
    if (boundLenis) boundLenis.off("scroll", listener);
    boundLenis = current;
    if (boundLenis) boundLenis.on("scroll", listener);
  };

  const onWindowScroll = () => {
    bindLenis();
    listener();
  };

  bindLenis();
  window.addEventListener("scroll", onWindowScroll, { passive: true });
  return () => {
    if (boundLenis) boundLenis.off("scroll", listener);
    window.removeEventListener("scroll", onWindowScroll);
  };
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
