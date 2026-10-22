import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  closingSplashHex,
  type ClosingSplashKey,
} from "./home-closing";

type Origin = { x: number; y: number };

const BLOB_RADIUS = "42% 58% 48% 52% / 52% 44% 56% 48%";
const CLEAR_DELAY_MS = 250;
const COLOR_FADE_MS = 400;
const THROTTLE_MS = 350;
const SHRINK_MS = 420;
const EXPAND_MS = 550;
const EDUCATING_WASH_EDGE = "inset 0 0 0 6px rgba(20, 26, 43, 0.3)";

type Phase = "idle" | "expand" | "full" | "shrink";

export default function HomeSplashOverlay() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [displayColor, setDisplayColor] = useState("transparent");
  const [activeKey, setActiveKey] = useState<ClosingSplashKey | null>(null);
  const [origin, setOrigin] = useState<Origin>({ x: 0.5, y: 0.5 });
  const [reducedMotion, setReducedMotion] = useState(false);

  const lastChangeRef = useRef(0);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shrinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingKeyRef = useRef<{
    key: ClosingSplashKey;
    origin?: Origin;
  } | null>(null);

  const clearTimers = useCallback(() => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    if (shrinkTimerRef.current) {
      clearTimeout(shrinkTimerRef.current);
      shrinkTimerRef.current = null;
    }
  }, []);

  const beginShrink = useCallback(() => {
    clearTimers();
    setActiveKey(null);
    delete document.documentElement.dataset.homeSplash;
    setPhase("shrink");
    shrinkTimerRef.current = setTimeout(() => {
      setPhase("idle");
      setDisplayColor("transparent");
    }, reducedMotion ? 200 : SHRINK_MS);
  }, [clearTimers, reducedMotion]);

  const scheduleClear = useCallback(() => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    clearTimerRef.current = setTimeout(() => beginShrink(), CLEAR_DELAY_MS);
  }, [beginShrink]);

  const cancelClear = useCallback(() => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  }, []);

  const applyKey = useCallback(
    (key: ClosingSplashKey, nextOrigin?: Origin) => {
      cancelClear();
      if (nextOrigin) setOrigin(nextOrigin);
      const color = closingSplashHex[key];
      setDisplayColor(color);
      setActiveKey(key);
      document.documentElement.dataset.homeSplash = key;
      lastChangeRef.current = performance.now();
      if (reducedMotion) {
        setPhase("full");
        return;
      }
      if (phase === "full" || phase === "expand") {
        setPhase("full");
        return;
      }
      setPhase("expand");
    },
    [cancelClear, phase, reducedMotion],
  );

  useEffect(() => {
    if (phase !== "expand") return;
    const id = requestAnimationFrame(() => setPhase("full"));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  const activate = useCallback(
    (key: ClosingSplashKey, nextOrigin?: Origin) => {
      const now = performance.now();
      const elapsed = now - lastChangeRef.current;
      if (
        activeKey &&
        activeKey !== key &&
        elapsed < THROTTLE_MS &&
        phase !== "idle"
      ) {
        pendingKeyRef.current = { key, origin: nextOrigin };
        window.setTimeout(() => {
          const pending = pendingKeyRef.current;
          if (pending?.key === key) {
            pendingKeyRef.current = null;
            applyKey(key, pending.origin);
          }
        }, THROTTLE_MS - elapsed);
        return;
      }
      pendingKeyRef.current = null;
      if (shrinkTimerRef.current) {
        clearTimeout(shrinkTimerRef.current);
        shrinkTimerRef.current = null;
      }
      applyKey(key, nextOrigin);
    },
    [activeKey, applyKey, phase],
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const onActivate = (event: Event) => {
      const detail = (event as CustomEvent<{
        key: ClosingSplashKey;
        origin?: Origin;
      }>).detail;
      if (!detail?.key) return;
      activate(detail.key, detail.origin);
    };

    const onImmediateClear = () => beginShrink();

    window.addEventListener("home-splash:activate", onActivate);
    window.addEventListener("home-splash:schedule-clear", scheduleClear);
    window.addEventListener("home-splash:cancel-clear", cancelClear);
    window.addEventListener("home-splash:immediate-clear", onImmediateClear);
    return () => {
      window.removeEventListener("home-splash:activate", onActivate);
      window.removeEventListener("home-splash:schedule-clear", scheduleClear);
      window.removeEventListener("home-splash:cancel-clear", cancelClear);
      window.removeEventListener("home-splash:immediate-clear", onImmediateClear);
      clearTimers();
    };
  }, [activate, scheduleClear, cancelClear, clearTimers, beginShrink]);

  const isVisible = phase !== "idle";
  const blobScale =
    phase === "full" ? 1 : phase === "expand" ? 1 : phase === "shrink" ? 0 : 0;

  const blobStyle: CSSProperties = reducedMotion
    ? {
        backgroundColor: displayColor,
        opacity: isVisible ? 1 : 0,
        transition: `opacity ${COLOR_FADE_MS}ms ease`,
      }
    : {
        backgroundColor: displayColor,
        left: `${origin.x * 100}%`,
        top: `${origin.y * 100}%`,
        borderRadius: BLOB_RADIUS,
        transform: `translate(-50%, -50%) scale(${phase === "expand" ? 0 : blobScale})`,
        transition:
          phase === "shrink"
            ? `transform ${SHRINK_MS}ms cubic-bezier(0.77, 0, 0.175, 1)`
            : `transform ${EXPAND_MS}ms cubic-bezier(0.23, 1, 0.32, 1), background-color ${COLOR_FADE_MS}ms ease`,
      };

  const washStyle: CSSProperties = {
    backgroundColor: displayColor,
    opacity: phase === "full" || (reducedMotion && isVisible) ? 1 : 0,
    transition: `opacity ${COLOR_FADE_MS}ms ease, background-color ${COLOR_FADE_MS}ms ease`,
  };

  const showEducatingEdge =
    activeKey === "educating" &&
    (phase === "full" || (reducedMotion && isVisible));

  return (
    <div
      className="home-splash-overlay pointer-events-none fixed inset-0 z-[38]"
      aria-hidden="true"
      data-active={isVisible ? "true" : "false"}
      data-phase={phase}
    >
      {!reducedMotion ? (
        <div className="absolute inset-0" style={washStyle} />
      ) : (
        <div className="absolute inset-0" style={washStyle} />
      )}
      {!reducedMotion ? (
        <div
          className="absolute h-[220vmax] w-[220vmax] will-change-transform"
          style={blobStyle}
        />
      ) : null}
      {showEducatingEdge ? (
        <div
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{ boxShadow: EDUCATING_WASH_EDGE }}
        />
      ) : null}
    </div>
  );
}

export function dispatchSplashActivate(
  key: ClosingSplashKey,
  element: HTMLElement,
) {
  const rect = element.getBoundingClientRect();
  const origin = {
    x: (rect.left + rect.width / 2) / window.innerWidth,
    y: (rect.top + rect.height / 2) / window.innerHeight,
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
