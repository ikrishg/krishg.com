import { useTempus } from "tempus/react";
import { stepOverscrollSpring } from "./homeOverscrollEngine";

/** Smooth overscroll pull/release via spring physics on the Tempus loop. */
export default function HomeOverscrollSpring() {
  useTempus(
    ({ deltaTime }) => {
      if (!Number.isFinite(deltaTime) || deltaTime <= 0) return;
      stepOverscrollSpring(deltaTime / 1000);
    },
    { order: 0.5, label: "overscroll-spring" },
  );
  return null;
}
