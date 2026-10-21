import { useEffect } from "react";
import { preloadHomeHeroGlbs } from "./preloadHomeHeroGlbs";

export default function PreloadHomeHeroGlbs() {
  useEffect(() => {
    const run = () => preloadHomeHeroGlbs();
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(run, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const t = window.setTimeout(run, 400);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
