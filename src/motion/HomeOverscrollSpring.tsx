import { useEffect, useRef } from "react";
import { useTempus } from "tempus/react";
import {
  resetOverscrollEngine,
  setOverscrollReducedMotionSpring,
  stepOverscrollSpring,
} from "./homeOverscrollEngine";

/** Smooth overscroll pull/release via spring physics on the Tempus loop. */
export default function HomeOverscrollSpring() {
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

  useTempus(
    ({ deltaTime }) => {
      if (reducedMotionRef.current) {
        if (!Number.isFinite(deltaTime) || deltaTime <= 0) return;
        stepOverscrollSpring(deltaTime / 1000);
        return;
      }
      if (!Number.isFinite(deltaTime) || deltaTime <= 0) return;
      stepOverscrollSpring(deltaTime / 1000);
    },
    { order: 0.5, label: "overscroll-spring" },
  );
  return null;
}
