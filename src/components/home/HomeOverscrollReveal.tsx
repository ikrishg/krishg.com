import { useEffect } from "react";
import { getLenis } from "~motion/lenisStore";
import {
  bindOverscrollSurface,
  nudgeOverscrollTarget,
  overscrollAtBottom,
  releaseOverscrollTarget,
  setOverscrollTarget,
  resetOverscrollEngine,
  setOverscrollMaxPull,
} from "~motion/homeOverscrollEngine";
import { registerOverscrollWheelFeed } from "~motion/homeOverscrollWheelFeed";

const FOOTER_SELECTOR = ".home-footer";
const SURFACE_SELECTOR = ".home-scroll-surface";
const ART_ASPECT = 1100 / 871;

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

function readBottomState() {
  const lenis = getLenis();
  const root = document.documentElement;
  return overscrollAtBottom(
    lenis?.scroll ?? window.scrollY,
    lenis?.limit ?? 0,
    window.scrollY,
    window.innerHeight,
    root.scrollHeight,
  );
}

/**
 * Pulls the homepage scroll surface to reveal the Starry Night layer beneath.
 * Target pull is spring-smoothed on the Tempus loop (HomeOverscrollSpring).
 */
export default function HomeOverscrollReveal() {
  useEffect(() => {
    const root = document.documentElement;
    const surface = document.querySelector<HTMLElement>(SURFACE_SELECTOR);
    if (!surface) return;

    bindOverscrollSurface(surface);

    let pulling = false;
    let releaseTimer: ReturnType<typeof setTimeout> | undefined;
    let touchAnchorY = 0;
    let bottomTouchStartY = 0;
    let touchStartedAtBottom = false;

    const syncMaxPull = () => {
      const maxPull = computeMaxPull();
      setOverscrollMaxPull(maxPull);
      root.style.setProperty("--home-overscroll-max-pull", `${maxPull}px`);
    };

    syncMaxPull();

    const pinScrollToBottom = () => {
      const lenis = getLenis();
      if (lenis) {
        if (Math.abs(lenis.scroll - lenis.limit) > 0.5) {
          lenis.scrollTo(lenis.limit, { immediate: true });
        }
        return;
      }
      const y = document.documentElement.scrollHeight - window.innerHeight;
      if (window.scrollY !== y) window.scrollTo(0, y);
    };

    const scheduleRelease = () => {
      if (releaseTimer) clearTimeout(releaseTimer);
      releaseTimer = setTimeout(() => {
        releaseOverscrollTarget();
        pinScrollToBottom();
      }, 70);
    };

    const processWheelDelta = (deltaY: number) => {
      if (!pulling) {
        if (!readBottomState() || deltaY <= 0) {
          if (pulling) scheduleRelease();
          return;
        }
        pulling = true;
        pinScrollToBottom();
      }

      if (deltaY > 0) {
        nudgeOverscrollTarget(deltaY);
        scheduleRelease();
        return;
      }

      releaseOverscrollTarget();
    };

    const onWheel = (event: WheelEvent) => {
      if (getLenis()) return;
      if (!pulling) {
        if (!readBottomState() || event.deltaY <= 0) return;
        pulling = true;
        pinScrollToBottom();
      }
      if (event.deltaY > 0) event.preventDefault();
      processWheelDelta(event.deltaY);
    };

    registerOverscrollWheelFeed(processWheelDelta);

    const onTouchStart = (event: TouchEvent) => {
      touchAnchorY = event.touches[0]?.clientY ?? 0;
      touchStartedAtBottom = readBottomState();
      if (touchStartedAtBottom) bottomTouchStartY = touchAnchorY;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!touchStartedAtBottom) return;
      const y = event.touches[0]?.clientY ?? touchAnchorY;
      const delta = bottomTouchStartY - y;
      if (delta <= 0) {
        releaseOverscrollTarget();
        return;
      }
      pulling = true;
      pinScrollToBottom();
      event.preventDefault();
      const maxPull = Number.parseFloat(
        getComputedStyle(root).getPropertyValue("--home-overscroll-max-pull"),
      );
      setOverscrollTarget(touchPullPx(delta, maxPull || 320));
    };

    const onTouchEnd = () => {
      touchStartedAtBottom = false;
      pulling = false;
      scheduleRelease();
    };

    const onScroll = () => {
      if (!readBottomState()) {
        releaseOverscrollTarget();
        pulling = false;
      }
    };

    const onResize = () => syncMaxPull();

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      registerOverscrollWheelFeed(null);
      if (releaseTimer) clearTimeout(releaseTimer);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      root.style.removeProperty("--home-overscroll-max-pull");
      bindOverscrollSurface(null);
      resetOverscrollEngine();
    };
  }, []);

  return null;
}
