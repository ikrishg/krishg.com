/** Shared homepage intro phase — loader, artifact ready, copy reveal. */

export const STROKE_MS = 1400;
export const MORPH_MS = 520;
/** Clear the loader even if a hero GLB never reports ready. */
export const ARTIFACT_READY_TIMEOUT_MS = 5000;

export type IntroPhase = "draw" | "morph" | "ready";

export function getIntroPhase(): IntroPhase | null {
  const value = document.documentElement.dataset.introPhase;
  if (value === "draw" || value === "morph" || value === "ready") return value;
  return null;
}

export function setIntroPhase(phase: IntroPhase) {
  const root = document.documentElement;
  root.dataset.introPhase = phase;
  if (phase === "ready") {
    delete root.dataset.logoMorph;
  } else {
    root.dataset.logoMorph = "pending";
  }
}

export function introAllowsCopyReveal(): boolean {
  return getIntroPhase() === "ready";
}

export function prefersReducedMotion(): boolean {
  return (
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
  );
}
