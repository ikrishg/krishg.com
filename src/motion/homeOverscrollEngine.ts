const SURFACE_SELECTOR = ".home-scroll-surface";
const PAINT_VISIBLE_PULL = 24;
const BOTTOM_EPSILON = 2;

let surfaceEl: HTMLElement | null = null;
let maxPullPx = 320;
let pull = 0;
let pullTarget = 0;
let pullVelocity = 0;
let releasing = false;

export function bindOverscrollSurface(el: HTMLElement | null) {
  surfaceEl = el;
}

export function setOverscrollMaxPull(px: number) {
  maxPullPx = Math.max(0, px);
  pullTarget = Math.min(pullTarget, maxPullPx);
}

export function getOverscrollPull() {
  return pull;
}

export function nudgeOverscrollTarget(deltaY: number) {
  releasing = false;
  const next = pullTarget + deltaY * 0.34;
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
    root.style.removeProperty("--home-overscroll-pull");
    surface.style.removeProperty("transform");
    surface.dataset.overscrollPulling = "false";
    delete root.dataset.overscrollReveal;
    root.style.setProperty("--home-overscroll-reveal", "0");
    return;
  }

  root.style.setProperty("--home-overscroll-pull", `${value.toFixed(2)}px`);
  surface.style.transform = `translate3d(0, ${-value}px, 0)`;
  surface.dataset.overscrollPulling = "true";

  const reveal = value > PAINT_VISIBLE_PULL ? 1 : value / PAINT_VISIBLE_PULL;
  root.style.setProperty("--home-overscroll-reveal", reveal.toFixed(3));
  if (value > PAINT_VISIBLE_PULL) {
    root.dataset.overscrollReveal = "true";
  } else {
    delete root.dataset.overscrollReveal;
  }
}

/** Spring step on the shared Tempus loop (dt in seconds). */
export function stepOverscrollSpring(dt: number) {
  const stiffness = 9.5;
  const damping = 11.5;
  const dtClamped = Math.min(dt, 0.05);

  const displacement = pullTarget - pull;
  pullVelocity += displacement * stiffness * dtClamped;
  pullVelocity *= Math.exp(-damping * dtClamped);
  pull += pullVelocity * dtClamped * 60;

  if (
    releasing &&
    Math.abs(pull) < 0.45 &&
    Math.abs(pullTarget) < 0.45 &&
    Math.abs(pullVelocity) < 0.35
  ) {
    pull = 0;
    pullTarget = 0;
    pullVelocity = 0;
    releasing = false;
  }

  applyPullVisual(pull);
}

export function resetOverscrollEngine() {
  pull = 0;
  pullTarget = 0;
  pullVelocity = 0;
  releasing = false;
  applyPullVisual(0);
}
