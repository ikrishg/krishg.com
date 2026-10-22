import { useEffect, useState, type CSSProperties } from "react";
import {
  closingSplashHex,
  type ClosingSplashKey,
} from "./home-closing";

type Origin = { x: number; y: number };

const BLOB_RADIUS = "42% 58% 48% 52% / 52% 44% 56% 48%";

export default function HomeSplashOverlay() {
  const [activeKey, setActiveKey] = useState<ClosingSplashKey | null>(null);
  const [origin, setOrigin] = useState<Origin>({ x: 0.5, y: 0.5 });
  const [reducedMotion, setReducedMotion] = useState(false);

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
      if (detail.origin) setOrigin(detail.origin);
      setActiveKey(detail.key);
    };

    const onClear = () => setActiveKey(null);

    window.addEventListener("home-splash:activate", onActivate);
    window.addEventListener("home-splash:clear", onClear);
    return () => {
      window.removeEventListener("home-splash:activate", onActivate);
      window.removeEventListener("home-splash:clear", onClear);
    };
  }, []);

  const color = activeKey ? closingSplashHex[activeKey] : "transparent";
  const isActive = Boolean(activeKey);

  let layerStyle: CSSProperties;
  if (reducedMotion) {
    layerStyle = {
      backgroundColor: color,
      opacity: isActive ? 1 : 0,
      transition: "opacity 0.35s ease",
    };
  } else {
    layerStyle = {
      backgroundColor: color,
      left: `${origin.x * 100}%`,
      top: `${origin.y * 100}%`,
      borderRadius: BLOB_RADIUS,
      transform: isActive
        ? "translate(-50%, -50%) scale(1)"
        : "translate(-50%, -50%) scale(0)",
      transition: isActive
        ? "transform 0.55s cubic-bezier(0.23, 1, 0.32, 1)"
        : "transform 0.45s cubic-bezier(0.77, 0, 0.175, 1)",
    };
  }

  return (
    <div
      className="home-splash-overlay pointer-events-none fixed inset-0 z-[38]"
      aria-hidden="true"
      data-active={isActive ? "true" : "false"}
    >
      <div
        className={
          reducedMotion
            ? "absolute inset-0"
            : "absolute h-[220vmax] w-[220vmax] will-change-transform"
        }
        style={layerStyle}
      />
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
}

export function dispatchSplashClear() {
  window.dispatchEvent(new CustomEvent("home-splash:clear"));
}
