import { useEffect, useRef, type MutableRefObject } from "react";

const INTERACTIVE_SELECTOR =
  "button, a, input, textarea, select, label, [data-no-drag]";

const DRAG_THRESHOLD_PX = 8;

export function isVirtualScrollInteractiveTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(INTERACTIVE_SELECTOR));
}

export type VirtualScrollDragState = {
  didDrag: boolean;
};

type Options = {
  enabled: boolean;
  onDelta: (dx: number, dy: number, pointer: "mouse" | "touch") => void;
  element: HTMLElement | null;
  dragStateRef?: MutableRefObject<VirtualScrollDragState>;
};

export function useVirtualScroll({
  enabled,
  onDelta,
  element,
  dragStateRef,
}: Options) {
  const pointerActive = useRef(false);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
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
      pointerActive.current = true;
      dragging.current = false;
      if (dragStateRef) dragStateRef.current.didDrag = false;
      startX.current = e.clientX;
      startY.current = e.clientY;
      lastX.current = e.clientX;
      lastY.current = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointerActive.current) return;
      const totalDx = e.clientX - startX.current;
      const totalDy = e.clientY - startY.current;
      if (
        !dragging.current &&
        Math.hypot(totalDx, totalDy) < DRAG_THRESHOLD_PX
      ) {
        return;
      }
      if (!dragging.current) {
        dragging.current = true;
        if (dragStateRef) dragStateRef.current.didDrag = true;
        lastX.current = e.clientX;
        lastY.current = e.clientY;
        return;
      }
      const dx = e.clientX - lastX.current;
      const dy = e.clientY - lastY.current;
      lastX.current = e.clientX;
      lastY.current = e.clientY;
      const kind = e.pointerType === "touch" ? "touch" : "mouse";
      onDeltaRef.current(dx, dy, kind);
    };

    const onPointerUp = () => {
      pointerActive.current = false;
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
  }, [enabled, element, dragStateRef]);
}
