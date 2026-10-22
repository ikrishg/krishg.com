import Snap from "lenis/snap";
import { useLenis } from "lenis/react";
import { useEffect, useRef } from "react";
import { registerHomeLenisSnap } from "~motion/homeLenisSnapControl";

const SNAP_SELECTOR =
  ".home-band-min-h.snap-start, #home-closing-index.snap-start, .home-footer.snap-start";

/**
 * Replaces CSS scroll-snap on the homepage with lenis/snap proximity points.
 */
export default function HomeLenisSnap() {
  const lenis = useLenis();
  const snapRef = useRef<Snap | null>(null);

  useEffect(() => {
    if (!lenis) return;

    const snap = new Snap(lenis, {
      type: "proximity",
      distanceThreshold: "50%",
    });
    snapRef.current = snap;
    registerHomeLenisSnap(snap);

    const elements = document.querySelectorAll<HTMLElement>(SNAP_SELECTOR);
    if (elements.length) {
      snap.addElements(elements, { align: "start" });
    }
    snap.start();

    const onResize = () => snap.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      snap.stop();
      registerHomeLenisSnap(null);
      snapRef.current = null;
    };
  }, [lenis]);

  return null;
}
