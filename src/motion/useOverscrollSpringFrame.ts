import { useEffect, useRef } from "react";
import {
  resetOverscrollEngine,
  setOverscrollReducedMotionSpring,
  stepOverscrollSpring,
} from "./homeOverscrollEngine";

/** Returns a frame tick for overscroll spring physics (no Tempus subscription). */
export function useOverscrollSpringFrame() {
  const reducedMotionRef = useRef(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reducedMotionRef.current = mq.matches;
      setOverscrollReducedMotionSpring(mq.matches);
      if (mq.matches) resetOverscrollEngine();
    };
    sync();
    mq.addEventListener("change", sync);
    return () => {
      mq.removeEventListener("change", sync);
      setOverscrollReducedMotionSpring(false);
    };
  }, []);

  return (deltaTime: number) => {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) return;
    stepOverscrollSpring(deltaTime / 1000);
  };
}
