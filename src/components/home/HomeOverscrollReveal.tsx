import { useEffect } from "react";

const MAX_PULL = 140;
const BOTTOM_EPSILON = 2;
const PAINT_VISIBLE_PULL = 24;
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
    let pulling = false;
    let resetTimer: ReturnType<typeof setTimeout> | undefined;
    let touchAnchorY = 0;
    let bottomTouchStartY = 0;
    let trackingBottomPull = false;

    const maxScrollY = () =>
      document.documentElement.scrollHeight - window.innerHeight;

    const pinScrollToBottom = () => {
      const y = maxScrollY();
      if (window.scrollY !== y) {
        window.scrollTo(0, y);
      }
    };

    const applyPull = (value: number) => {
      pull = Math.max(0, Math.min(MAX_PULL, value));
      if (pull <= 0.5) {
        pulling = false;
        root.style.removeProperty("--home-overscroll-pull");
        surface.style.removeProperty("transform");
        surface.dataset.overscrollPulling = "false";
        delete root.dataset.overscrollReveal;
        pinScrollToBottom();
        return;
      }
      pinScrollToBottom();
      root.style.setProperty("--home-overscroll-pull", `${pull}px`);
      surface.style.transform = `translate3d(0, ${-pull}px, 0)`;
      surface.dataset.overscrollPulling = "true";
      if (pull > PAINT_VISIBLE_PULL) {
        root.dataset.overscrollReveal = "true";
      } else {
        delete root.dataset.overscrollReveal;
      }
    };

    const scheduleReset = () => {
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => applyPull(0), 120);
    };

    const onWheel = (event: WheelEvent) => {
      if (!pulling) {
        if (!atScrollBottom() || event.deltaY <= 0) {
          if (pull > 0) scheduleReset();
          return;
        }
        pulling = true;
      }

      if (event.deltaY > 0) {
        event.preventDefault();
      }

      const next = pull + event.deltaY * 0.35;
      if (next <= 0.5) {
        applyPull(0);
        return;
      }
      applyPull(next);
      scheduleReset();
    };

    const onTouchStart = (event: TouchEvent) => {
      touchAnchorY = event.touches[0]?.clientY ?? 0;
      trackingBottomPull = atScrollBottom();
      if (trackingBottomPull) bottomTouchStartY = touchAnchorY;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!trackingBottomPull) return;
      if (!pulling && !atScrollBottom()) return;
      const y = event.touches[0]?.clientY ?? touchAnchorY;
      const delta = bottomTouchStartY - y;
      if (delta <= 0) {
        applyPull(0);
        return;
      }
      pulling = true;
      applyPull(touchPullPx(delta));
    };

    const onTouchEnd = () => {
      trackingBottomPull = false;
      scheduleReset();
    };

    const onScroll = () => {
      if (pulling) return;
      if (!atScrollBottom() && pull > 0) applyPull(0);
    };

    window.addEventListener("wheel", onWheel, { passive: false });
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
