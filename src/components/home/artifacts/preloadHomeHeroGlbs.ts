import { useGLTF } from "@react-three/drei";
import { homeGlbPaths } from "../hero-types";

let didPreload = false;

/** Preload all three upstream GLBs once. */
export function preloadHomeHeroGlbs(): void {
  if (didPreload) return;
  didPreload = true;
  for (const url of Object.values(homeGlbPaths)) {
    useGLTF.preload(url);
  }
}
