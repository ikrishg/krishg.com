import { useEffect } from "react";
import { getLenis } from "~motion/lenisStore";
import {
  bindOverscrollSurface,
  getOverscrollPull,
  isOverscrollPullActive,
  nudgeOverscrollTarget,
  overscrollAtBottom,
  releaseOverscrollTarget,
  setOverscrollTarget,
  resetOverscrollEngine,
  setOverscrollMaxPull,
  setOverscrollWheelGain,
} from "~motion/homeOverscrollEngine";
import { registerOverscrollWheelFeed } from "~motion/homeOverscrollWheelFeed";
import {
  markSplashTouchInput,
  markSplashWheelInput,
} from "~motion/homeSplashScrollGate";

const SURFACE_SELECTOR = ".home-scroll-surface";
const PIN_PULL_THRESHOLD = 0.5;
/** Idle gap between wheel notches before spring-back (hold pull through detents). */
const RELEASE_DELAY_MS = 280;
const MAX_PULL_VH = 0.3;
const PEAK_PULL_VH = 0.25;
/** Wheel gain at 25vh peak / 30vh cap (scaled from 0.54). */
const WHEEL_GAIN = 0.54 * (PEAK_PULL_VH / MAX_PULL_VH);

function computeMaxPull(vh: number) {
  return Math.round(vh * MAX_PULL_VH);
}

function computePeakPull(vh: number) {
  return Math.round(vh * PEAK_PULL_VH);
}

function touchPullPx(delta: number, peakPull: number, maxPull: number) {
  const eased = peakPull * (1 - Math.exp(-delta / 240));
  return Math.min(maxPull, eased);
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
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reducedMotion) return;

    const root = document.documentElement;
    const surface = document.querySelector<HTMLElement>(SURFACE_SELECTOR);
    if (!surface) return;

    bindOverscrollSurface(surface);

    let pulling = false;
    let pullEngaged = false;
    let releaseTimer: ReturnType<typeof setTimeout> | undefined;
    let touchAnchorY = 0;
    let bottomTouchStartY = 0;
    let touchStartedAtBottom = false;
    let maxPullCached = 320;
    let peakPullCached = 260;

    const syncMaxPull = () => {
      const vh = window.innerHeight;
      const maxPull = computeMaxPull(vh);
      const peakPull = computePeakPull(vh);
      maxPullCached = maxPull;
      peakPullCached = peakPull;
      setOverscrollMaxPull(maxPull);
      setOverscrollWheelGain(WHEEL_GAIN);
      root.style.setProperty("--home-overscroll-max-pull", `${maxPull}px`);
      root.style.setProperty("--home-overscroll-peak-pull", `${peakPull}px`);
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

    const finishRelease = (opts: {
      fromWheel?: boolean;
      bottomTouch?: boolean;
    } = {}) => {
      const allowPin = Boolean(opts.fromWheel || opts.bottomTouch);
      if (!allowPin || (!pullEngaged && !isOverscrollPullActive())) {
        pulling = false;
        pullEngaged = false;
        releaseOverscrollTarget();
        return;
      }

      const peakPull = getOverscrollPull();
      const shouldPin =
        allowPin &&
        (pullEngaged || peakPull > PIN_PULL_THRESHOLD || isOverscrollPullActive());
      releaseOverscrollTarget();
      if (shouldPin) pinScrollToBottom();
      pulling = false;
      pullEngaged = false;
    };

    const scheduleWheelRelease = () => {
      if (releaseTimer) clearTimeout(releaseTimer);
      if (!pullEngaged && !isOverscrollPullActive()) {
        finishRelease({ fromWheel: true });
        return;
      }
      releaseTimer = setTimeout(() => {
        finishRelease({ fromWheel: true });
      }, RELEASE_DELAY_MS);
    };

    const processWheelDelta = (deltaY: number) => {
      if (!pulling) {
        if (!readBottomState() || deltaY <= 0) return;
        pulling = true;
      }

      if (deltaY > 0) {
        pullEngaged = true;
        nudgeOverscrollTarget(deltaY);
        pinScrollToBottom();
        scheduleWheelRelease();
        return;
      }

      releaseOverscrollTarget();
      pulling = false;
      pullEngaged = false;
    };

    const onWheel = (event: WheelEvent) => {
      markSplashWheelInput();
      if (getLenis()) return;
      if (!pulling) {
        if (!readBottomState() || event.deltaY <= 0) return;
        pulling = true;
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
      markSplashTouchInput();
      if (!touchStartedAtBottom) return;
      const y = event.touches[0]?.clientY ?? touchAnchorY;
      const delta = bottomTouchStartY - y;
      if (delta <= 8) {
        if (delta <= 0) releaseOverscrollTarget();
        return;
      }
      pulling = true;
      pullEngaged = true;
      event.preventDefault();
      pinScrollToBottom();
      setOverscrollTarget(touchPullPx(delta, peakPullCached, maxPullCached));
    };

    const endTouch = () => {
      const bottomTouch = touchStartedAtBottom;
      touchStartedAtBottom = false;

      if (!bottomTouch) {
        return;
      }

      if (pullEngaged || isOverscrollPullActive()) {
        if (releaseTimer) clearTimeout(releaseTimer);
        finishRelease({ bottomTouch: true });
      } else {
        pulling = false;
      }
    };

    const onScroll = () => {
      if (!readBottomState()) {
        releaseOverscrollTarget();
        pulling = false;
        pullEngaged = false;
      }
    };

    const onResize = () => syncMaxPull();

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", endTouch, { passive: true });
    window.addEventListener("touchcancel", endTouch, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      registerOverscrollWheelFeed(null);
      if (releaseTimer) clearTimeout(releaseTimer);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", endTouch);
      window.removeEventListener("touchcancel", endTouch);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      root.style.removeProperty("--home-overscroll-max-pull");
      root.style.removeProperty("--home-overscroll-peak-pull");
      bindOverscrollSurface(null);
      resetOverscrollEngine();
    };
  }, []);

  return null;
}
