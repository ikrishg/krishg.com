import { getLenis, subscribeScroll } from "./lenisStore";
import type { ClosingSplashKey } from "~components/home/home-closing";
import { canUseClosingHoverSplash } from "~components/home/closingHoverSplash";

const INPUT_GATE_MS = 150;
const VELOCITY_THRESHOLD = 0.35;
const VELOCITY_STALE_MS = 180;

let lastWheelAt = 0;
let lastTouchAt = 0;
let lastMotionAt = 0;
let lastVelocity = 0;
let lastVelocityAt = 0;
let settleTimer: ReturnType<typeof setTimeout> | null = null;
const settleListeners = new Set<() => void>();

type PendingHover = {
  key: ClosingSplashKey;
  x: number;
  y: number;
};

let pendingHover: PendingHover | null = null;

function markMotion() {
  lastMotionAt = Date.now();
}

export function markSplashWheelInput() {
  lastWheelAt = Date.now();
  markMotion();
}

export function markSplashTouchInput() {
  lastTouchAt = Date.now();
  markMotion();
}

function effectiveScrollVelocity(): number {
  const age = Date.now() - lastVelocityAt;
  if (age > VELOCITY_STALE_MS) return 0;
  const decay = Math.max(0, 1 - age / VELOCITY_STALE_MS);

  const lenis = getLenis();
  const raw = lenis?.velocity ?? lastVelocity;
  if (Math.abs(raw) < 0.02) return 0;
  return raw * decay;
}

export function getSplashScrollVelocity() {
  return effectiveScrollVelocity();
}

export function isSplashScrollBlocked(): boolean {
  const now = Date.now();
  if (now - lastWheelAt < INPUT_GATE_MS) return true;
  if (now - lastTouchAt < INPUT_GATE_MS) return true;

  if (now - lastMotionAt < INPUT_GATE_MS) {
    if (Math.abs(effectiveScrollVelocity()) > VELOCITY_THRESHOLD) return true;
  }

  return false;
}

export function queueSplashAfterScroll(key: ClosingSplashKey, x: number, y: number) {
  pendingHover = { key, x, y };
}

function clearPendingHover() {
  pendingHover = null;
}

function notifySettled() {
  for (const listener of settleListeners) listener();
}

function scheduleSettled() {
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    settleTimer = null;
    if (!isSplashScrollBlocked()) notifySettled();
  }, INPUT_GATE_MS + 20);
}

function onScrollSample() {
  const lenis = getLenis();
  const velocity = lenis?.velocity ?? 0;
  lastVelocity = velocity;
  lastVelocityAt = Date.now();
  if (Math.abs(velocity) > VELOCITY_THRESHOLD) {
    markMotion();
    window.dispatchEvent(new CustomEvent("home-splash:immediate-clear"));
    scheduleSettled();
    return;
  }
  scheduleSettled();
}

let wired = false;

export function ensureSplashScrollGate() {
  if (wired || typeof window === "undefined") return;
  wired = true;

  window.addEventListener(
    "wheel",
    () => {
      markSplashWheelInput();
      if (isSplashScrollBlocked()) {
        window.dispatchEvent(new CustomEvent("home-splash:immediate-clear"));
      }
      scheduleSettled();
    },
    { passive: true },
  );

  window.addEventListener(
    "touchmove",
    () => {
      markSplashTouchInput();
      if (isSplashScrollBlocked()) {
        window.dispatchEvent(new CustomEvent("home-splash:immediate-clear"));
      }
      scheduleSettled();
    },
    { passive: true },
  );

  subscribeScroll(onScrollSample);
}

export function subscribeSplashScrollSettled(listener: () => void): () => void {
  settleListeners.add(listener);
  return () => {
    settleListeners.delete(listener);
  };
}

export function consumePendingSplashHover(): PendingHover | null {
  const next = pendingHover;
  pendingHover = null;
  return next;
}

export function flushPendingSplashHover() {
  if (!canUseClosingHoverSplash() || isSplashScrollBlocked()) return;
  const pending = consumePendingSplashHover();
  if (!pending) return;

  const target = document.elementFromPoint(pending.x, pending.y);
  const link = target?.closest<HTMLElement>("[data-splash-key]");
  const key = link?.dataset.splashKey as ClosingSplashKey | undefined;
  if (!link || !key || key !== pending.key) {
    clearPendingHover();
    return;
  }

  const rect = link.getBoundingClientRect();
  window.dispatchEvent(
    new CustomEvent("home-splash:activate", {
      detail: {
        key,
        origin: {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        },
      },
    }),
  );
}
