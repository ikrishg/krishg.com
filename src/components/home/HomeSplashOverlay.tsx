import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  closingSplashHex,
  closingSplashInkHex,
  type ClosingSplashKey,
} from "./home-closing";
import { HOME_SPLASH_PATH, splashBlobDiameter } from "./home-splash-mask";

type PixelOrigin = { x: number; y: number };

type SplashLayer = {
  id: number;
  key: ClosingSplashKey;
  color: string;
  origin: PixelOrigin;
  diameter: number;
  phase: "grow" | "full" | "fade";
};

const CLEAR_DELAY_MS = 120;
const GROW_MS = 520;
const FADE_MS = 260;
const INK_DELAY_MS = 208;
const REDUCED_FADE_MS = 150;
const MIN_SWAP_MS = 340;

let layerId = 0;

function nextLayerId() {
  layerId += 1;
  return layerId;
}

function SplashGrowSvg({
  layer,
  onFull,
}: {
  layer: SplashLayer;
  onFull: (id: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { origin, diameter, color, id } = layer;

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.style.transform = "scale(0.02)";
    const anim = svg.animate(
      [{ transform: "scale(0.02)" }, { transform: "scale(1)" }],
      {
        duration: GROW_MS,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "forwards",
      },
    );
    void anim.finished.then(() => onFull(id));
    return () => anim.cancel();
  }, [id, onFull]);

  const half = diameter / 2;
  return (
    <svg
      ref={svgRef}
      viewBox="-100 -100 200 200"
      width={diameter}
      height={diameter}
      className="absolute"
      style={{
        left: origin.x - half,
        top: origin.y - half,
        transformOrigin: "50% 50%",
        willChange: "transform",
      }}
      aria-hidden="true"
    >
      <path d={HOME_SPLASH_PATH} fill={color} />
    </svg>
  );
}

function SplashReducedLayer({
  layer,
  onFull,
}: {
  layer: SplashLayer;
  onFull: (id: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.opacity = "0";
    const anim = node.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: REDUCED_FADE_MS,
      easing: "ease-out",
      fill: "forwards",
    });
    void anim.finished.then(() => onFull(layer.id));
    return () => anim.cancel();
  }, [layer.id, onFull]);

  return (
    <div
      ref={ref}
      className="absolute inset-0"
      style={{ backgroundColor: layer.color }}
      data-splash-layer={layer.key}
    />
  );
}

function SplashFadeLayer({ layer }: { layer: SplashLayer }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const anim = node.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: FADE_MS,
      easing: "ease-out",
      fill: "forwards",
    });
    return () => anim.cancel();
  }, [layer.id]);

  return (
    <div
      ref={ref}
      className="absolute inset-0"
      style={{ backgroundColor: layer.color }}
      data-splash-layer={layer.key}
    />
  );
}

export default function HomeSplashOverlay() {
  const [layers, setLayers] = useState<SplashLayer[]>([]);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{
    key: ClosingSplashKey;
    origin: PixelOrigin;
  } | null>(null);
  const lastPushRef = useRef(0);
  const layersRef = useRef<SplashLayer[]>([]);

  const syncHtmlSplash = useCallback((key: ClosingSplashKey | null) => {
    const root = document.documentElement;
    if (key) {
      root.dataset.homeSplash = key;
    } else {
      delete root.dataset.homeSplash;
    }
  }, []);

  const clearInkTimer = useCallback(() => {
    if (inkTimerRef.current) {
      clearTimeout(inkTimerRef.current);
      inkTimerRef.current = null;
    }
  }, []);

  const resetInk = useCallback(() => {
    clearInkTimer();
    document.documentElement.style.removeProperty("--home-closing-ink");
  }, [clearInkTimer]);

  const scheduleInk = useCallback(
    (key: ClosingSplashKey) => {
      clearInkTimer();
      const ink = closingSplashInkHex[key];
      if (reducedMotion) {
        document.documentElement.style.setProperty("--home-closing-ink", ink);
        return;
      }
      inkTimerRef.current = setTimeout(() => {
        document.documentElement.style.setProperty("--home-closing-ink", ink);
      }, INK_DELAY_MS);
    },
    [clearInkTimer, reducedMotion],
  );

  const clearSwapTimer = useCallback(() => {
    if (swapTimerRef.current) {
      clearTimeout(swapTimerRef.current);
      swapTimerRef.current = null;
    }
  }, []);

  const clearTimers = useCallback(() => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    clearInkTimer();
    clearSwapTimer();
    pendingRef.current = null;
  }, [clearInkTimer, clearSwapTimer]);

  const markFull = useCallback((id: number) => {
    setLayers((prev) => {
      const i = prev.findIndex((l) => l.id === id);
      if (i < 0) return prev;
      return [{ ...prev[i], phase: "full" as const }, ...prev.slice(i + 1)];
    });
  }, []);

  const beginFadeOut = useCallback(() => {
    clearTimers();
    resetInk();
    setLayers((prev) => {
      if (!prev.length) {
        syncHtmlSplash(null);
        return prev;
      }
      const top = prev[prev.length - 1];
      if (top.phase === "fade") return prev;
      const solid =
        top.phase === "full"
          ? top
          : { ...top, phase: "full" as const };
      return [{ ...solid, phase: "fade" as const }];
    });

    window.setTimeout(() => {
      setLayers([]);
      syncHtmlSplash(null);
    }, reducedMotion ? REDUCED_FADE_MS : FADE_MS);
  }, [clearTimers, reducedMotion, resetInk, syncHtmlSplash]);

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

  const pushLayer = useCallback(
    (key: ClosingSplashKey, origin: PixelOrigin) => {
      cancelClear();
      clearInkTimer();
      document.documentElement.style.removeProperty("--home-closing-ink");

      const id = nextLayerId();
      const color = closingSplashHex[key];
      const diameter = splashBlobDiameter(origin.x, origin.y);
      const layer: SplashLayer = {
        id,
        key,
        color,
        origin,
        diameter,
        phase: reducedMotion ? "grow" : "grow",
      };

      setLayers((prev) => {
        const base = prev.length ? [prev[prev.length - 1]] : [];
        return [...base, layer].slice(-2);
      });
      syncHtmlSplash(key);
      scheduleInk(key);
    },
    [cancelClear, clearInkTimer, reducedMotion, scheduleInk, syncHtmlSplash],
  );

  const flushPendingSwap = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    swapTimerRef.current = null;
    if (!pending) return;
    pushLayer(pending.key, pending.origin);
    lastPushRef.current = performance.now();
  }, [pushLayer]);

  const activate = useCallback(
    (key: ClosingSplashKey, nextOrigin?: PixelOrigin) => {
      const origin = nextOrigin ?? {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      };
      const now = performance.now();
      const elapsed = now - lastPushRef.current;
      const hasLayer = layersRef.current.length > 0;

      if (hasLayer && elapsed < MIN_SWAP_MS) {
        pendingRef.current = { key, origin };
        if (!swapTimerRef.current) {
          swapTimerRef.current = setTimeout(
            () => flushPendingSwap(),
            MIN_SWAP_MS - elapsed,
          );
        }
        return;
      }

      pendingRef.current = null;
      clearSwapTimer();
      pushLayer(key, origin);
      lastPushRef.current = now;
    },
    [clearSwapTimer, flushPendingSwap, pushLayer],
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
        origin?: PixelOrigin;
      }>).detail;
      if (!detail?.key) return;
      activate(detail.key, detail.origin);
    };

    const onImmediateClear = () => beginFadeOut();

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
      resetInk();
    };
  }, [
    activate,
    scheduleClear,
    cancelClear,
    clearTimers,
    beginFadeOut,
    resetInk,
  ]);

  const isVisible = layers.length > 0;
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
      className="home-splash-overlay pointer-events-none fixed inset-0 z-[45]"
      aria-hidden="true"
      data-active={isVisible ? "true" : "false"}
    >
      {layers.map((layer) => {
        if (layer.phase === "fade") {
          return <SplashFadeLayer key={layer.id} layer={layer} />;
        }
        if (layer.phase === "full") {
          return (
            <div
              key={layer.id}
              className="absolute inset-0"
              data-splash-layer={layer.key}
              style={{ backgroundColor: layer.color }}
            />
          );
        }
        if (reducedMotion) {
          return (
            <SplashReducedLayer
              key={layer.id}
              layer={layer}
              onFull={markFull}
            />
          );
        }
        return (
          <SplashGrowSvg key={layer.id} layer={layer} onFull={markFull} />
        );
      })}
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
