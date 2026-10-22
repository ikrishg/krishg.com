import { useEffect } from "react";

const MAX_PULL = 140;
const BOTTOM_EPSILON = 2;

function atScrollBottom() {
  const root = document.documentElement;
  return (
    window.scrollY + window.innerHeight >=
    root.scrollHeight - BOTTOM_EPSILON
  );
}

/**
 * Surfaces the Starry Night layer when the visitor pulls past the document end.
 * Native rubber-band overscroll reads `html` background; wheel/touch pull sets
 * `--home-overscroll-pull` for desktops without bounce.
 */
export default function HomeOverscrollReveal() {
  useEffect(() => {
    const root = document.documentElement;
    let pull = 0;
    let resetTimer: ReturnType<typeof setTimeout> | undefined;

    const setPull = (value: number) => {
      pull = Math.max(0, Math.min(MAX_PULL, value));
      root.style.setProperty("--home-overscroll-pull", `${pull}px`);
      root.dataset.overscrollReveal = pull > 0.5 ? "true" : "false";
    };

    const scheduleReset = () => {
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => setPull(0), 120);
    };

    const onWheel = (event: WheelEvent) => {
      if (!atScrollBottom() || event.deltaY <= 0) {
        if (pull > 0) scheduleReset();
        return;
      }
      setPull(pull + event.deltaY * 0.35);
      scheduleReset();
    };

    let touchStartY = 0;
    const onTouchStart = (event: TouchEvent) => {
      touchStartY = event.touches[0]?.clientY ?? 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!atScrollBottom()) return;
      const y = event.touches[0]?.clientY ?? touchStartY;
      const delta = touchStartY - y;
      if (delta > 0) setPull(delta * 0.65);
    };

    const onTouchEnd = () => {
      scheduleReset();
    };

    const onScroll = () => {
      if (!atScrollBottom() && pull > 0) setPull(0);
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      if (resetTimer) clearTimeout(resetTimer);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("scroll", onScroll);
      setPull(0);
    };
  }, []);

  return null;
}
