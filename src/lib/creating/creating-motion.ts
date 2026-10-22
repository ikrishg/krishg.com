import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { registerCreatingEasings } from "./easings";

registerCreatingEasings();
gsap.registerPlugin(Flip);

export function captureFlipTargets(root: ParentNode | null): Element[] {
  if (!root) return [];
  return [...root.querySelectorAll("[data-flip-id]")];
}

export function captureFlipState(root: ParentNode | null) {
  const targets = captureFlipTargets(root);
  if (targets.length === 0) return null;
  return Flip.getState(targets, {
    props: "transform,opacity",
    nested: true,
    scale: true,
  });
}

export function runFlipFrom(
  state: Flip.FlipState,
  reducedMotion: boolean,
  options?: { stagger?: number; duration?: number },
) {
  if (reducedMotion || !state) return;
  Flip.from(state, {
    duration: options?.duration ?? 0.72,
    ease: "creating.cubicInOut",
    stagger: options?.stagger ?? 0.035,
    nested: true,
    scale: true,
    absolute: true,
    prune: true,
    onEnter: (els) => {
      gsap.fromTo(
        els,
        { opacity: 0, scale: 0.92 },
        {
          opacity: 1,
          scale: 1,
          duration: 0.55,
          ease: "creating.cubicOut",
        },
      );
    },
    onLeave: (els) => {
      gsap.to(els, {
        opacity: 0,
        scale: 0.9,
        duration: 0.35,
        ease: "creating.cubicInOut",
      });
    },
  });
}

export function staggerCardsIn(
  root: ParentNode | null,
  reducedMotion: boolean,
  selector = "[data-flip-id]",
) {
  if (reducedMotion || !root) return;
  const cards = [...root.querySelectorAll(selector)];
  if (cards.length === 0) return;
  gsap.fromTo(
    cards,
    { opacity: 0, y: 36, scale: 0.94, rotateX: 8 },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      rotateX: 0,
      duration: 0.85,
      ease: "creating.cubicOut",
      stagger: { each: 0.045, from: "random" },
      clearProps: "transform",
    },
  );
}

export async function withViewTransition(
  reducedMotion: boolean,
  update: () => void | Promise<void>,
) {
  if (reducedMotion || typeof document.startViewTransition !== "function") {
    await update();
    return;
  }
  const transition = document.startViewTransition(() => {
    void update();
  });
  await transition.finished.catch(() => undefined);
}
