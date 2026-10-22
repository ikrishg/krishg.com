import { useEffect } from "react";
import { getLenis } from "~motion/lenisStore";
import { registerOverscrollWheelFeed } from "~motion/homeOverscrollWheelFeed";

const BOTTOM_EPSILON = 2;
const PAINT_VISIBLE_PULL = 24;
const SURFACE_SELECTOR = ".home-scroll-surface";
const FOOTER_SELECTOR = ".home-footer";
const ART_ASPECT = 1100 / 871;

function atScrollBottom() {
  const root = document.documentElement;
  const nativeAtBottom =
    window.scrollY + window.innerHeight >= root.scrollHeight - BOTTOM_EPSILON;
  const lenis = getLenis();
  if (lenis) {
    return lenis.scroll >= lenis.limit - BOTTOM_EPSILON || nativeAtBottom;
  }
  return nativeAtBottom;
}

function computeMaxPull() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const containHeight = Math.min(vh, vw / ART_ASPECT);
  const letterbox = Math.max(0, vh - containHeight);
  const footer = document.querySelector<HTMLElement>(FOOTER_SELECTOR);
  const footerHeight = footer
    ? Math.min(footer.getBoundingClientRect().height, vh * 0.95)
    : vh * 0.55;
  const revealTarget = Math.max(letterbox + 56, footerHeight * 0.62, 200);
  return Math.min(Math.ceil(revealTarget), Math.round(vh * 0.92));
}

function touchPullPx(delta: number, maxPull: number) {
  return maxPull * (1 - Math.exp(-delta / 240));
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
    let maxPull = computeMaxPull();
    let resetTimer: ReturnType<typeof setTimeout> | undefined;
    let touchAnchorY = 0;
    let bottomTouchStartY = 0;
    let trackingBottomPull = false;
    let touchStartedAtBottom = false;

    const syncMaxPull = () => {
      maxPull = computeMaxPull();
      root.style.setProperty("--home-overscroll-max-pull", `${maxPull}px`);
    };

    syncMaxPull();

    const maxScrollY = () =>
      document.documentElement.scrollHeight - window.innerHeight;

    const pinScrollToBottom = () => {
      const lenis = getLenis();
      if (lenis) {
        if (Math.abs(lenis.scroll - lenis.limit) > 0.5) {
          lenis.scrollTo(lenis.limit, { immediate: true });
        }
        return;
      }
      const y = maxScrollY();
      if (window.scrollY !== y) {
        window.scrollTo(0, y);
      }
    };

    const applyPull = (
      value: number,
      options?: {
        /** Pin scroll to the document bottom when clearing pull (overscroll release). */
        pinBottom?: boolean;
      },
    ) => {
      pull = Math.max(0, Math.min(maxPull, value));
      if (pull <= 0.5) {
        const pinBottom = options?.pinBottom ?? false;
        pulling = false;
        root.style.removeProperty("--home-overscroll-pull");
        surface.style.removeProperty("transform");
        surface.dataset.overscrollPulling = "false";
        delete root.dataset.overscrollReveal;
        if (pinBottom) {
          pinScrollToBottom();
        }
        root.style.scrollSnapType = "";
        return;
      }
      root.style.scrollSnapType = "none";
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
      resetTimer = setTimeout(() => applyPull(0, { pinBottom: true }), 120);
    };

    const processWheelDelta = (deltaY: number) => {
      if (!pulling) {
        if (!atScrollBottom() || deltaY <= 0) {
          if (pull > 0) scheduleReset();
          return;
        }
        pulling = true;
      }

      const next = pull + deltaY * 0.38;
      if (next <= 0.5) {
        applyPull(0, { pinBottom: true });
        return;
      }
      applyPull(next);
      scheduleReset();
    };

    const onWheel = (event: WheelEvent) => {
      if (getLenis()) return;
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
      processWheelDelta(event.deltaY);
    };

    registerOverscrollWheelFeed(processWheelDelta);

    const onTouchStart = (event: TouchEvent) => {
      touchAnchorY = event.touches[0]?.clientY ?? 0;
      touchStartedAtBottom = atScrollBottom();
      trackingBottomPull = touchStartedAtBottom;
      if (trackingBottomPull) bottomTouchStartY = touchAnchorY;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!touchStartedAtBottom) return;
      if (!pulling && !atScrollBottom()) return;
      const y = event.touches[0]?.clientY ?? touchAnchorY;
      const delta = bottomTouchStartY - y;
      if (delta <= 0) {
        const pinBottom = touchStartedAtBottom && atScrollBottom();
        applyPull(0, { pinBottom });
        return;
      }
      pulling = true;
      event.preventDefault();
      applyPull(touchPullPx(delta, maxPull));
    };

    const onTouchEnd = () => {
      const releaseAtBottom =
        touchStartedAtBottom && atScrollBottom() && pull > 0.5;
      trackingBottomPull = false;
      touchStartedAtBottom = false;

      if (releaseAtBottom) {
        scheduleReset();
      } else if (pull > 0.5 || pulling) {
        applyPull(0, { pinBottom: false });
      }
      pulling = false;
    };

    const onScroll = () => {
      if (pulling) return;
      if (!atScrollBottom() && pull > 0) applyPull(0, { pinBottom: false });
    };

    const onResize = () => {
      syncMaxPull();
      if (pull > maxPull) applyPull(maxPull);
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      registerOverscrollWheelFeed(null);
      if (resetTimer) clearTimeout(resetTimer);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      root.style.removeProperty("--home-overscroll-max-pull");
      applyPull(0, { pinBottom: false });
    };
  }, []);

  return null;
}
