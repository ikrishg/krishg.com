import { useEffect } from "react";
import {
  ensureSplashScrollGate,
  flushPendingSplashHover,
  subscribeSplashScrollSettled,
} from "./homeSplashScrollGate";

/** Tracks Lenis / wheel / touch scroll so closing-link splashes stay idle while scrolling. */
export default function HomeSplashScrollGate() {
  useEffect(() => {
    ensureSplashScrollGate();
    return subscribeSplashScrollSettled(() => {
      flushPendingSplashHover();
    });
  }, []);

  return null;
}
