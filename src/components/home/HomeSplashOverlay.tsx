import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  closingSplashHex,
  closingSplashInkHex,
  type ClosingSplashKey,
} from "./home-closing";
import { HOME_SPLASH_PATH, splashBlobDiameter } from "./home-splash-mask";
import { isSplashScrollBlocked } from "~motion/homeSplashScrollGate";
import { canUseClosingHoverSplash } from "./closingHoverSplash";

type PixelOrigin = { x: number; y: number };
type SplashMask = "circle" | "organic";

const CLEAR_DELAY_MS = 90;
const GROW_MS = 620;
const SHRINK_MS = 280;
const COLOR_MS = 200;
const GROW_EASE = "cubic-bezier(0.25, 0.9, 0.35, 1)";
const SPLASH_EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
const SHRINK_EASE = SPLASH_EASE;

function coverRadius(ox: number, oy: number): number {
  return (
    Math.ceil(
      Math.hypot(
        Math.max(ox, window.innerWidth - ox),
        Math.max(oy, window.innerHeight - oy),
      ),
    ) + 12
  );
}

function readSplashMask(): SplashMask {
  if (typeof window === "undefined") return "circle";
  const value = new URLSearchParams(window.location.search).get("splashMask");
  return value === "organic" ? "organic" : "circle";
}

export default function HomeSplashOverlay() {
  const overlayRef = useRef<HTMLDivElement>(null);
  const organicSvgRef = useRef<SVGSVGElement>(null);
  const organicPathRef = useRef<SVGPathElement>(null);
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const motionRef = useRef<Animation | null>(null);
  const stateRef = useRef<"idle" | "growing" | "full" | "hiding">("idle");
  const keyRef = useRef<ClosingSplashKey | null>(null);
  const originRef = useRef<PixelOrigin>({ x: 0, y: 0 });
  const reducedMotionRef = useRef(false);
  const maskRef = useRef<SplashMask>("circle");
  const [maskMode, setMaskMode] = useState<SplashMask>("circle");

  const syncHtmlSplash = useCallback((key: ClosingSplashKey | null) => {
    const root = document.documentElement;
    if (key) {
      root.dataset.homeSplash = key;
    } else {
      delete root.dataset.homeSplash;
    }
  }, []);

  const setInk = useCallback((key: ClosingSplashKey | null) => {
    const root = document.documentElement;
    if (!key) {
      root.style.removeProperty("--home-closing-ink");
      return;
    }
    root.style.setProperty("--home-closing-ink", closingSplashInkHex[key]);
  }, []);

  const cancelMotion = useCallback(() => {
    const anim = motionRef.current;
    motionRef.current = null;
    anim?.cancel();
  }, []);

  const whenAnimDone = useCallback(
    (anim: Animation, onDone: () => void) => {
      motionRef.current = anim;
      void anim.finished.then(onDone).catch(() => {
        /* aborted by a newer splash transition */
      });
    },
    [],
  );

  const layoutOrganicSplash = useCallback(
    (origin: PixelOrigin, color: string) => {
      const svg = organicSvgRef.current;
      const path = organicPathRef.current;
      if (!svg || !path) return;
      const diameter = splashBlobDiameter(origin.x, origin.y);
      const half = diameter / 2;
      svg.style.left = `${origin.x - half}px`;
      svg.style.top = `${origin.y - half}px`;
      svg.style.width = `${diameter}px`;
      svg.style.height = `${diameter}px`;
      path.setAttribute("fill", color);
      svg.style.transform = "scale(0.02)";
    },
    [],
  );

  const resetOverlay = useCallback(() => {
    const el = overlayRef.current;
    const svg = organicSvgRef.current;
    if (!el) return;
    cancelMotion();
    el.style.opacity = "0";
    el.style.removeProperty("clip-path");
    el.style.removeProperty("background-color");
    if (svg && maskRef.current === "organic") {
      svg.style.transform = "scale(0.02)";
      svg.style.opacity = "1";
      organicPathRef.current?.setAttribute("fill", "transparent");
    }
    stateRef.current = "idle";
    keyRef.current = null;
  }, [cancelMotion]);

  const clearTimers = useCallback(() => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  }, []);

  const playGrow = useCallback(
    (key: ClosingSplashKey, origin: PixelOrigin) => {
      const el = overlayRef.current;
      if (!el) return;

      cancelMotion();
      clearTimers();

      const color = closingSplashHex[key];
      keyRef.current = key;
      originRef.current = origin;
      syncHtmlSplash(key);
      setInk(key);
      el.style.opacity = "1";

      if (reducedMotionRef.current) {
        if (maskRef.current === "organic") {
          el.style.backgroundColor = "transparent";
          el.style.clipPath = "none";
          layoutOrganicSplash(origin, color);
          const svg = organicSvgRef.current;
          if (svg) svg.style.transform = "scale(1)";
        } else {
          el.style.backgroundColor = color;
          el.style.clipPath = "none";
        }
        stateRef.current = "full";
        return;
      }

      stateRef.current = "growing";

      if (maskRef.current === "organic") {
        el.style.backgroundColor = "transparent";
        el.style.clipPath = "none";
        layoutOrganicSplash(origin, color);
        const svg = organicSvgRef.current;
        if (!svg) return;
        const anim = svg.animate(
          [{ transform: "scale(0.02)" }, { transform: "scale(1)" }],
          {
            duration: GROW_MS,
            easing: GROW_EASE,
            fill: "forwards",
          },
        );
        whenAnimDone(anim, () => {
          if (stateRef.current === "growing") stateRef.current = "full";
        });
        return;
      }

      el.style.backgroundColor = color;
      const radius = coverRadius(origin.x, origin.y);
      const anim = el.animate(
        [
          { clipPath: `circle(0px at ${origin.x}px ${origin.y}px)` },
          {
            clipPath: `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
          },
        ],
        {
          duration: GROW_MS,
          easing: GROW_EASE,
          fill: "forwards",
        },
      );
      whenAnimDone(anim, () => {
        if (stateRef.current === "growing") {
          stateRef.current = "full";
        }
      });
    },
    [
      cancelMotion,
      clearTimers,
      layoutOrganicSplash,
      setInk,
      syncHtmlSplash,
      whenAnimDone,
    ],
  );

  const retargetColor = useCallback(
    (key: ClosingSplashKey) => {
      const el = overlayRef.current;
      if (!el || stateRef.current === "idle" || stateRef.current === "hiding") {
        return false;
      }

      clearTimers();
      const from = closingSplashHex[keyRef.current ?? key];
      const to = closingSplashHex[key];
      keyRef.current = key;
      syncHtmlSplash(key);
      setInk(key);

      if (from === to) return true;

      if (stateRef.current === "growing") {
        if (maskRef.current === "organic") {
          organicPathRef.current?.setAttribute("fill", to);
        } else {
          el.style.backgroundColor = to;
        }
        return true;
      }

      if (reducedMotionRef.current) {
        if (maskRef.current === "organic") {
          organicPathRef.current?.setAttribute("fill", to);
        } else {
          el.style.backgroundColor = to;
        }
        return true;
      }

      cancelMotion();

      if (maskRef.current === "organic") {
        const path = organicPathRef.current;
        if (!path) return true;
        const anim = path.animate(
          [{ fill: from }, { fill: to }],
          { duration: COLOR_MS, easing: SPLASH_EASE, fill: "forwards" },
        );
        whenAnimDone(anim, () => {});
        return true;
      }

      const anim = el.animate(
        [{ backgroundColor: from }, { backgroundColor: to }],
        {
          duration: COLOR_MS,
          easing: SPLASH_EASE,
          fill: "forwards",
        },
      );
      whenAnimDone(anim, () => {});
      return true;
    },
    [cancelMotion, clearTimers, setInk, syncHtmlSplash, whenAnimDone],
  );

  const beginFadeOut = useCallback(() => {
    const el = overlayRef.current;
    if (!el || stateRef.current === "idle" || stateRef.current === "hiding") {
      return;
    }

    clearTimers();
    cancelMotion();
    stateRef.current = "hiding";
    setInk(null);
    syncHtmlSplash(null);

    const finish = () => {
      resetOverlay();
    };

    if (reducedMotionRef.current) {
      finish();
      return;
    }

    if (maskRef.current === "organic") {
      const svg = organicSvgRef.current;
      if (!svg) {
        finish();
        return;
      }
      const anim = svg.animate(
        [{ transform: "scale(1)" }, { transform: "scale(0.02)" }],
        {
          duration: SHRINK_MS,
          easing: SHRINK_EASE,
          fill: "forwards",
        },
      );
      whenAnimDone(anim, finish);
      return;
    }

    const { x, y } = originRef.current;
    const radius = coverRadius(x, y);
    const anim = el.animate(
      [
        { clipPath: `circle(${radius}px at ${x}px ${y}px)` },
        { clipPath: `circle(0px at ${x}px ${y}px)` },
      ],
      {
        duration: SHRINK_MS,
        easing: SHRINK_EASE,
        fill: "forwards",
      },
    );
    whenAnimDone(anim, finish);
  }, [
    cancelMotion,
    clearTimers,
    resetOverlay,
    setInk,
    syncHtmlSplash,
    whenAnimDone,
  ]);

  const scheduleClear = useCallback(() => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    clearTimerRef.current = setTimeout(() => beginFadeOut(), CLEAR_DELAY_MS);
  }, [beginFadeOut]);

  const cancelClear = useCallback(() => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  }, []);

  const activate = useCallback(
    (key: ClosingSplashKey, origin: PixelOrigin) => {
      if (!canUseClosingHoverSplash() || isSplashScrollBlocked()) return;

      cancelClear();
      if (stateRef.current === "hiding") {
        resetOverlay();
        stateRef.current = "idle";
      }
      if (stateRef.current === "full" || stateRef.current === "growing") {
        if (retargetColor(key)) return;
      }
      playGrow(key, origin);
    },
    [cancelClear, playGrow, retargetColor, resetOverlay],
  );

  useEffect(() => {
    const mask = readSplashMask();
    maskRef.current = mask;
    setMaskMode(mask);
    document.documentElement.dataset.homeSplashMask = mask;
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reducedMotionRef.current = mq.matches;
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const onActivate = (event: Event) => {
      const detail = (event as CustomEvent<{
        key: ClosingSplashKey;
        origin?: PixelOrigin;
      }>).detail;
      if (!detail?.key) return;
      const origin = detail.origin ?? {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      };
      activate(detail.key, origin);
    };

    window.addEventListener("home-splash:activate", onActivate);
    window.addEventListener("home-splash:schedule-clear", scheduleClear);
    window.addEventListener("home-splash:cancel-clear", cancelClear);
    window.addEventListener("home-splash:immediate-clear", beginFadeOut);
    return () => {
      window.removeEventListener("home-splash:activate", onActivate);
      window.removeEventListener("home-splash:schedule-clear", scheduleClear);
      window.removeEventListener("home-splash:cancel-clear", cancelClear);
      window.removeEventListener("home-splash:immediate-clear", beginFadeOut);
      clearTimers();
      setInk(null);
      syncHtmlSplash(null);
      resetOverlay();
    };
  }, [
    activate,
    beginFadeOut,
    cancelClear,
    clearTimers,
    resetOverlay,
    scheduleClear,
    setInk,
    syncHtmlSplash,
  ]);

  useEffect(() => {
    const node = document.createElement("div");
    node.id = "home-splash-portal";
    document.body.appendChild(node);
    setPortal(node);
    return () => {
      node.remove();
    };
  }, []);

  const tree = (
    <div
      ref={overlayRef}
      className="home-splash-overlay pointer-events-none fixed inset-0 z-[45] opacity-0"
      aria-hidden="true"
    >
      {maskMode === "organic" ? (
        <svg
          ref={organicSvgRef}
          viewBox="-100 -100 200 200"
          className="home-splash-organic absolute origin-center will-change-transform"
          style={{
            transform: "scale(0.02)",
            opacity: 1,
          }}
          aria-hidden="true"
        >
          <path
            ref={organicPathRef}
            d={HOME_SPLASH_PATH}
            fill="transparent"
          />
        </svg>
      ) : null}
    </div>
  );

  if (!portal) return null;
  return createPortal(tree, portal);
}

export function dispatchSplashActivate(
  key: ClosingSplashKey,
  element: HTMLElement,
) {
  if (!canUseClosingHoverSplash()) return;
  const rect = element.getBoundingClientRect();
  const origin = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
  window.dispatchEvent(
    new CustomEvent("home-splash:activate", {
      detail: { key, origin },
    }),
  );
  window.dispatchEvent(new CustomEvent("home-splash:cancel-clear"));
}

export function dispatchSplashScheduleClear() {
  window.dispatchEvent(new CustomEvent("home-splash:schedule-clear"));
}

export function dispatchSplashImmediateClear() {
  window.dispatchEvent(new CustomEvent("home-splash:immediate-clear"));
}
