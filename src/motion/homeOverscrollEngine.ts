import { setPageAccent } from "~components/home/HomeNavbarTheme";

const SURFACE_SELECTOR = ".home-scroll-surface";
const PAINT_VISIBLE_PULL = 24;
const BOTTOM_EPSILON = 2;
const SPLASH_CLEAR_PULL = 6;

let splashClearedForPull = false;

let surfaceEl: HTMLElement | null = null;
let maxPullPx = 320;
let wheelGain = 0.45;
let pull = 0;
let pullTarget = 0;
let pullVelocity = 0;
let releasing = false;
let reducedMotionSpring = false;
let surfacePullingDataset: "true" | "false" | null = null;
let rootPullingDataset: "true" | "false" | null = null;
let rootRevealDataset: "true" | undefined;
let overscrollAccentApplied = false;
let lastPullCss: string | null = null;
let lastRevealCss: string | null = null;

export function bindOverscrollSurface(el: HTMLElement | null) {
  surfaceEl = el;
}

export function setOverscrollMaxPull(px: number) {
  maxPullPx = Math.max(0, px);
  pullTarget = Math.min(pullTarget, maxPullPx);
  pull = Math.min(pull, maxPullPx);
}

export function setOverscrollWheelGain(gain: number) {
  wheelGain = Math.max(0, gain);
}

export function getOverscrollPull() {
  return pull;
}

export function getOverscrollRevealProgress() {
  if (pull <= 0.35) return 0;
  return pull > PAINT_VISIBLE_PULL ? 1 : pull / PAINT_VISIBLE_PULL;
}

export function setOverscrollReducedMotionSpring(enabled: boolean) {
  reducedMotionSpring = enabled;
  if (enabled) {
    pullVelocity = 0;
    pull = pullTarget;
    applyPullVisual(pull);
  }
}

export function nudgeOverscrollTarget(deltaY: number) {
  releasing = false;
  const next = pullTarget + deltaY * wheelGain;
  pullTarget = Math.max(0, Math.min(maxPullPx, next));
}

export function setOverscrollTarget(value: number) {
  releasing = false;
  pullTarget = Math.max(0, Math.min(maxPullPx, value));
}

export function releaseOverscrollTarget() {
  releasing = true;
  pullTarget = 0;
}

export function overscrollAtBottom(
  lenisScroll: number,
  lenisLimit: number,
  nativeScrollY: number,
  viewportHeight: number,
  scrollHeight: number,
) {
  const nativeAtBottom =
    nativeScrollY + viewportHeight >= scrollHeight - BOTTOM_EPSILON;
  const lenisAtBottom =
    lenisLimit > 0 && lenisScroll >= lenisLimit - BOTTOM_EPSILON;
  return nativeAtBottom || lenisAtBottom;
}

function applyPullVisual(value: number) {
  const root = document.documentElement;
  const surface = surfaceEl ?? document.querySelector<HTMLElement>(SURFACE_SELECTOR);
  if (!surface) return;

  if (value <= 0.35) {
    if (lastPullCss !== null) {
      root.style.removeProperty("--home-overscroll-pull");
      lastPullCss = null;
    }
    surface.style.removeProperty("transform");
    overscrollAccentApplied = false;
    if (surfacePullingDataset !== "false") {
      surface.dataset.overscrollPulling = "false";
      surfacePullingDataset = "false";
    }
    if (rootRevealDataset !== undefined) {
      delete root.dataset.overscrollReveal;
      rootRevealDataset = undefined;
    }
    if (rootPullingDataset !== "false") {
      delete root.dataset.overscrollPulling;
      rootPullingDataset = "false";
    }
    if (lastRevealCss !== "0") {
      root.style.setProperty("--home-overscroll-reveal", "0");
      lastRevealCss = "0";
    }
    splashClearedForPull = false;
    return;
  }

  const pullCss = `${value.toFixed(2)}px`;
  if (pullCss !== lastPullCss) {
    root.style.setProperty("--home-overscroll-pull", pullCss);
    lastPullCss = pullCss;
  }
  surface.style.transform = `translate3d(0, ${-value}px, 0)`;
  if (surfacePullingDataset !== "true") {
    surface.dataset.overscrollPulling = "true";
    surfacePullingDataset = "true";
  }
  if (rootPullingDataset !== "true") {
    root.dataset.overscrollPulling = "true";
    rootPullingDataset = "true";
  }
  if (!overscrollAccentApplied) {
    overscrollAccentApplied = true;
    setPageAccent("closing");
    window.dispatchEvent(new CustomEvent("home-splash:immediate-clear"));
  }

  if (value > SPLASH_CLEAR_PULL && !splashClearedForPull) {
    splashClearedForPull = true;
    window.dispatchEvent(new CustomEvent("home-splash:immediate-clear"));
  }

  const reveal = value > PAINT_VISIBLE_PULL ? 1 : value / PAINT_VISIBLE_PULL;
  const revealCss = reveal.toFixed(3);
  if (revealCss !== lastRevealCss) {
    root.style.setProperty("--home-overscroll-reveal", revealCss);
    lastRevealCss = revealCss;
  }
  if (value > PAINT_VISIBLE_PULL) {
    if (rootRevealDataset !== "true") {
      root.dataset.overscrollReveal = "true";
      rootRevealDataset = "true";
    }
  } else if (rootRevealDataset !== undefined) {
    delete root.dataset.overscrollReveal;
    rootRevealDataset = undefined;
  }
}

/** Spring step on the shared Tempus loop (dt in seconds). */
export function stepOverscrollSpring(dt: number) {
  if (!Number.isFinite(dt) || dt <= 0) return;

  if (reducedMotionSpring) {
    pull = pullTarget;
    if (!Number.isFinite(pull)) {
      pull = 0;
      pullTarget = 0;
    }
    applyPullVisual(pull);
    return;
  }

  if (
    !releasing &&
    Math.abs(pull - pullTarget) < 0.02 &&
    Math.abs(pullVelocity) < 0.02 &&
    pull < 0.35 &&
    pullTarget < 0.35
  ) {
    return;
  }

  const dtClamped = Math.min(dt, 0.05);

  if (releasing) {
    const settleRate = 18;
    const next = pull + (pullTarget - pull) * settleRate * dtClamped;
    pull = Math.max(0, next);
    pullVelocity = (pullTarget - pull) * settleRate;
    if (pull <= 0.35) {
      pull = 0;
      pullTarget = 0;
      pullVelocity = 0;
      releasing = false;
    }
  } else {
    const stiffness = 9.5;
    const damping = 11.5;
    const displacement = pullTarget - pull;
    pullVelocity += displacement * stiffness * dtClamped;
    pullVelocity *= Math.exp(-damping * dtClamped);
    pull += pullVelocity * dtClamped * 60;
    pull = Math.max(0, pull);

    if (pull <= 0 && pullTarget <= 0) {
      pull = 0;
      pullVelocity = 0;
    }
  }

  if (!Number.isFinite(pull)) {
    pull = 0;
    pullTarget = 0;
    pullVelocity = 0;
  }

  pull = Math.min(pull, maxPullPx);
  pullTarget = Math.min(pullTarget, maxPullPx);

  applyPullVisual(pull);
}

export function resetOverscrollEngine() {
  pull = 0;
  pullTarget = 0;
  pullVelocity = 0;
  releasing = false;
  splashClearedForPull = false;
  surfacePullingDataset = null;
  rootPullingDataset = null;
  rootRevealDataset = undefined;
  overscrollAccentApplied = false;
  lastPullCss = null;
  lastRevealCss = null;
  applyPullVisual(0);
}

export function isOverscrollPullActive() {
  return pull > 0.35 || pullTarget > 0.35;
}
