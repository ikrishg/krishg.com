import { useEffect } from "react";

const MAX_PULL = 140;
const BOTTOM_EPSILON = 2;
const SURFACE_SELECTOR = ".home-scroll-surface";

function atScrollBottom() {
  const root = document.documentElement;
  return (
    window.scrollY + window.innerHeight >=
    root.scrollHeight - BOTTOM_EPSILON
  );
}

function touchPullPx(delta: number) {
  return MAX_PULL * (1 - Math.exp(-delta / 200));
}

/**
 * Pulls the homepage scroll surface (not the navbar or splash overlay) to reveal
 * the Starry Night layer beneath.
 */
export default function HomeOverscrollReveal() {
  useEffect(() => {
    const root = document.documentElement;
    const surface = document.querySelector<HTMLElement>(SURFACE_SELECTOR);
    if (!surface) return;

    let pull = 0;
    let resetTimer: ReturnType<typeof setTimeout> | undefined;
    let touchAnchorY = 0;
    let bottomTouchStartY = 0;
    let trackingBottomPull = false;

    const applyPull = (value: number) => {
      pull = Math.max(0, Math.min(MAX_PULL, value));
      if (pull <= 0.5) {
        root.style.removeProperty("--home-overscroll-pull");
        surface.style.removeProperty("transform");
        surface.dataset.overscrollPulling = "false";
        root.dataset.overscrollReveal = "false";
        return;
      }
      root.style.setProperty("--home-overscroll-pull", `${pull}px`);
      surface.style.transform = `translate3d(0, ${-pull}px, 0)`;
      surface.dataset.overscrollPulling = "true";
      root.dataset.overscrollReveal = "true";
    };

    const scheduleReset = () => {
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => applyPull(0), 120);
    };

    const onWheel = (event: WheelEvent) => {
      if (!atScrollBottom() || event.deltaY <= 0) {
        if (pull > 0) scheduleReset();
        return;
      }
      applyPull(pull + event.deltaY * 0.35);
      scheduleReset();
    };

    const onTouchStart = (event: TouchEvent) => {
      touchAnchorY = event.touches[0]?.clientY ?? 0;
      trackingBottomPull = atScrollBottom();
      if (trackingBottomPull) bottomTouchStartY = touchAnchorY;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!trackingBottomPull || !atScrollBottom()) return;
      const y = event.touches[0]?.clientY ?? touchAnchorY;
      const delta = bottomTouchStartY - y;
      if (delta <= 0) {
        applyPull(0);
        return;
      }
      applyPull(touchPullPx(delta));
    };

    const onTouchEnd = () => {
      trackingBottomPull = false;
      scheduleReset();
    };

    const onScroll = () => {
      if (!atScrollBottom() && pull > 0) applyPull(0);
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      if (resetTimer) clearTimeout(resetTimer);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("scroll", onScroll);
      applyPull(0);
    };
  }, []);

  return null;
}
