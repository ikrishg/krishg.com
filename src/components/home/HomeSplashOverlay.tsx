import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  closingSplashHex,
  type ClosingSplashKey,
} from "./home-closing";
import { HOME_SPLASH_MASK_IMAGE } from "./home-splash-mask";

type Origin = { x: number; y: number };

type SplashLayer = {
  id: number;
  key: ClosingSplashKey;
  color: string;
  origin: Origin;
  phase: "grow" | "full" | "shrink";
  maskExpanded: boolean;
};

const CLEAR_DELAY_MS = 250;
const COLOR_FADE_MS = 320;
const THROTTLE_MS = 350;
const GROW_MS = 580;
const SHRINK_MS = 480;
const FULL_MASK_SIZE = "420vmax";
const EDUCATING_WASH_EDGE = "inset 0 0 0 6px rgba(20, 26, 43, 0.3)";

let layerId = 0;

function nextLayerId() {
  layerId += 1;
  return layerId;
}

function maskLayerStyle(
  layer: SplashLayer,
  reducedMotion: boolean,
): CSSProperties {
  const atOrigin = `${layer.origin.x * 100}% ${layer.origin.y * 100}%`;
  if (reducedMotion) {
    const visible = layer.phase !== "shrink";
    return {
      backgroundColor: layer.color,
      opacity: visible ? 1 : 0,
      transition: `opacity ${COLOR_FADE_MS}ms ease`,
    };
  }

  if (layer.phase === "shrink") {
    return {
      backgroundColor: layer.color,
      opacity: 0,
      transition: `opacity ${SHRINK_MS}ms ease`,
    };
  }

  if (layer.phase === "full") {
    return {
      backgroundColor: layer.color,
    };
  }

  const maskSize = layer.maskExpanded ? FULL_MASK_SIZE : "2vmax";
  const transition = `mask-size ${GROW_MS}ms cubic-bezier(0.23, 1, 0.32, 1), -webkit-mask-size ${GROW_MS}ms cubic-bezier(0.23, 1, 0.32, 1)`;

  return {
    backgroundColor: layer.color,
    maskImage: HOME_SPLASH_MASK_IMAGE,
    WebkitMaskImage: HOME_SPLASH_MASK_IMAGE,
    maskRepeat: "no-repeat",
    maskPosition: atOrigin,
    WebkitMaskPosition: atOrigin,
    maskSize,
    WebkitMaskSize: maskSize,
    transition,
  };
}

export default function HomeSplashOverlay() {
  const [layers, setLayers] = useState<SplashLayer[]>([]);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [topKey, setTopKey] = useState<ClosingSplashKey | null>(null);

  const lastChangeRef = useRef(0);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingKeyRef = useRef<{
    key: ClosingSplashKey;
    origin?: Origin;
  } | null>(null);
  const growTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const syncHtmlSplash = useCallback((key: ClosingSplashKey | null) => {
    const root = document.documentElement;
    if (key) {
      root.dataset.homeSplash = key;
    } else {
      delete root.dataset.homeSplash;
    }
    setTopKey(key);
  }, []);

  const clearTimers = useCallback(() => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    for (const timer of growTimersRef.current.values()) {
      clearTimeout(timer);
    }
    growTimersRef.current.clear();
  }, []);

  const removeLayer = useCallback((id: number) => {
    setLayers((prev) => prev.filter((layer) => layer.id !== id));
    const timer = growTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      growTimersRef.current.delete(id);
    }
  }, []);

  const beginShrinkAll = useCallback(() => {
    clearTimers();
    setLayers((prev) => {
      if (!prev.length) {
        syncHtmlSplash(null);
        return prev;
      }
      return prev.map((layer) => ({ ...layer, phase: "shrink" as const }));
    });

    const delay = reducedMotion ? COLOR_FADE_MS : SHRINK_MS;
    window.setTimeout(() => {
      setLayers([]);
      syncHtmlSplash(null);
    }, delay);
  }, [clearTimers, reducedMotion, syncHtmlSplash]);

  const scheduleClear = useCallback(() => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    clearTimerRef.current = setTimeout(() => beginShrinkAll(), CLEAR_DELAY_MS);
  }, [beginShrinkAll]);

  const cancelClear = useCallback(() => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  }, []);

  const pushLayer = useCallback(
    (key: ClosingSplashKey, origin: Origin) => {
      cancelClear();
      const id = nextLayerId();
      const color = closingSplashHex[key];
      const layer: SplashLayer = {
        id,
        key,
        color,
        origin,
        phase: reducedMotion ? "full" : "grow",
        maskExpanded: Boolean(reducedMotion),
      };
      setLayers((prev) => [...prev, layer]);
      syncHtmlSplash(key);
      lastChangeRef.current = performance.now();
      if (!reducedMotion) {
        requestAnimationFrame(() => {
          setLayers((prev) =>
            prev.map((item) =>
              item.id === id ? { ...item, maskExpanded: true } : item,
            ),
          );
        });
      }
    },
    [cancelClear, reducedMotion, syncHtmlSplash],
  );

  const activate = useCallback(
    (key: ClosingSplashKey, nextOrigin?: Origin) => {
      const origin = nextOrigin ?? { x: 0.5, y: 0.5 };
      const now = performance.now();
      const elapsed = now - lastChangeRef.current;
      if (topKey && topKey !== key && elapsed < THROTTLE_MS && layers.length) {
        pendingKeyRef.current = { key, origin };
        window.setTimeout(() => {
          const pending = pendingKeyRef.current;
          if (pending?.key === key) {
            pendingKeyRef.current = null;
            pushLayer(key, pending.origin ?? origin);
          }
        }, THROTTLE_MS - elapsed);
        return;
      }
      pendingKeyRef.current = null;
      pushLayer(key, origin);
    },
    [layers.length, pushLayer, topKey],
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

    const onImmediateClear = () => beginShrinkAll();

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
  }, [activate, scheduleClear, cancelClear, clearTimers, beginShrinkAll]);

  const isVisible = layers.length > 0;
  const showEducatingEdge =
    topKey === "educating" &&
    layers.some((layer) => layer.phase === "full" || reducedMotion);

  const [portal, setPortal] = useState<HTMLElement | null>(null);

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
      className="home-splash-overlay pointer-events-none fixed inset-0 z-[39]"
      aria-hidden="true"
      data-active={isVisible ? "true" : "false"}
    >
      {layers.map((layer) => (
        <div
          key={layer.id}
          className="absolute inset-0"
          data-splash-layer={layer.key}
          style={maskLayerStyle(layer, reducedMotion)}
          onTransitionEnd={(event) => {
            if (layer.phase === "grow") {
              if (
                event.propertyName === "mask-size" ||
                event.propertyName === "-webkit-mask-size"
              ) {
                setLayers((prev) =>
                  prev.map((item) =>
                    item.id === layer.id ? { ...item, phase: "full" } : item,
                  ),
                );
              }
              return;
            }
            if (
              layer.phase === "shrink" &&
              event.propertyName === "opacity"
            ) {
              removeLayer(layer.id);
            }
          }}
        />
      ))}
      {showEducatingEdge ? (
        <div
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{ boxShadow: EDUCATING_WASH_EDGE }}
        />
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
