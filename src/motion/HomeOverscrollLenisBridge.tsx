import { useLenis } from "lenis/react";
import { useEffect, useRef } from "react";
import { feedOverscrollWheelDelta } from "./homeOverscrollWheelFeed";
import { markSplashWheelInput } from "./homeSplashScrollGate";

const BOTTOM_EPSILON = 2;
const PULL_VAR = "--home-overscroll-pull";

/**
 * Single wheel path for Lenis: forwards bottom-limit deltas to the overscroll
 * pull controller (no DOM re-dispatch). Pins Lenis while pull CSS var is active.
 */
export default function HomeOverscrollLenisBridge() {
  const lenis = useLenis();
  const lenisRef = useRef(lenis);
  lenisRef.current = lenis;

  useEffect(() => {
    const instance = lenisRef.current;
    if (!instance) return;

    const atLimit = () =>
      instance.scroll >= instance.limit - BOTTOM_EPSILON;

    const readPullPx = () => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue(
        PULL_VAR,
      );
      return Number.parseFloat(raw) || 0;
    };

    const pinAtLimit = () => {
      if (Math.abs(instance.scroll - instance.limit) > 0.5) {
        instance.scrollTo(instance.limit, { immediate: true });
      }
    };

    const onVirtualScroll = (data: {
      deltaX: number;
      deltaY: number;
      event: WheelEvent | TouchEvent;
    }) => {
      const { deltaY, event } = data;
      if (!event.type.includes("wheel")) return;

      const pulling = readPullPx() > 0.5;
      if (!pulling && (!atLimit() || deltaY <= 0)) return;

      if (event.cancelable) event.preventDefault();
      (event as WheelEvent & { lenisStopPropagation?: boolean }).lenisStopPropagation =
        true;

      markSplashWheelInput();
      feedOverscrollWheelDelta(deltaY);
    };

    const onScroll = () => {
      if (readPullPx() > 0.5) pinAtLimit();
    };

    const observer = new MutationObserver(() => {
      if (readPullPx() > 0.5) pinAtLimit();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "data-overscroll-reveal"],
    });

    instance.on("virtual-scroll", onVirtualScroll);
    instance.on("scroll", onScroll);

    return () => {
      observer.disconnect();
      instance.off("virtual-scroll", onVirtualScroll);
      instance.off("scroll", onScroll);
    };
  }, [lenis]);

  return null;
}
