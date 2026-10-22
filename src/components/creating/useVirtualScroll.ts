import { useEffect, useRef } from "react";

const INTERACTIVE_SELECTOR =
  "button, a, input, textarea, select, label, [data-no-drag]";

export function isVirtualScrollInteractiveTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(INTERACTIVE_SELECTOR));
}

type Options = {
  enabled: boolean;
  onDelta: (dx: number, dy: number, pointer: "mouse" | "touch") => void;
  element: HTMLElement | null;
};

export function useVirtualScroll({ enabled, onDelta, element }: Options) {
  const dragging = useRef(false);
  const lastX = useRef(0);
  const lastY = useRef(0);
  const onDeltaRef = useRef(onDelta);
  onDeltaRef.current = onDelta;

  useEffect(() => {
    if (!enabled || !element) return;

    const scrollSurface =
      element instanceof HTMLCanvasElement
        ? element
        : element.querySelector("canvas");

    const wheelTarget =
      scrollSurface instanceof HTMLCanvasElement ? scrollSurface : element;

    const onWheel = (e: WheelEvent) => {
      if (isVirtualScrollInteractiveTarget(e.target)) return;
      e.preventDefault();
      onDeltaRef.current(e.deltaX + e.deltaY, e.deltaY, "mouse");
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (isVirtualScrollInteractiveTarget(e.target)) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      const canvas =
        target instanceof HTMLCanvasElement
          ? target
          : target.closest("canvas");
      if (!(canvas instanceof HTMLCanvasElement)) return;
      dragging.current = true;
      lastX.current = e.clientX;
      lastY.current = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - lastX.current;
      const dy = e.clientY - lastY.current;
      lastX.current = e.clientX;
      lastY.current = e.clientY;
      const kind = e.pointerType === "touch" ? "touch" : "mouse";
      onDeltaRef.current(dx, dy, kind);
    };

    const onPointerUp = () => {
      dragging.current = false;
    };

    wheelTarget.addEventListener("wheel", onWheel, { passive: false });
    wheelTarget.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      wheelTarget.removeEventListener("wheel", onWheel);
      wheelTarget.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [enabled, element]);
}
