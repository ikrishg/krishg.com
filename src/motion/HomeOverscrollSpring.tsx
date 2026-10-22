import { useTempus } from "tempus/react";
import { stepOverscrollSpring } from "./homeOverscrollEngine";

/** Smooth overscroll pull/release via spring physics on the Tempus loop. */
export default function HomeOverscrollSpring() {
  useTempus(
    ({ delta }) => {
      stepOverscrollSpring(delta);
    },
    { order: 0.5, label: "overscroll-spring" },
  );
  return null;
}
