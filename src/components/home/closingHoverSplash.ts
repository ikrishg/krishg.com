/** Desktop-only full-screen hover splash for closing index links (not mobile blocks). */
export function canUseClosingHoverSplash(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(max-width: 767px)").matches) return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}
