import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { registerCreatingEasings } from "./easings";

registerCreatingEasings();
gsap.registerPlugin(Flip);

const CARD_FLIP_SELECTOR = ".creating-card[data-flip-id]";

export type CapturedFlip = Flip.FlipState;

export function captureFlipTargets(root: ParentNode | null): Element[] {
  if (!root) return [];
  return [...root.querySelectorAll(CARD_FLIP_SELECTOR)];
}

export function captureFlipState(root: ParentNode | null): CapturedFlip | null {
  const cards = captureFlipTargets(root);
  if (cards.length === 0) return null;
  return Flip.getState(cards, {
    props: "transform,opacity",
    nested: true,
  });
}

export function runFlipFrom(
  state: CapturedFlip,
  root: ParentNode | null,
  reducedMotion: boolean,
  options?: { duration?: number; onComplete?: () => void },
) {
  if (reducedMotion || !state || !root) {
    options?.onComplete?.();
    return;
  }

  const cardTargets = root.querySelectorAll(CARD_FLIP_SELECTOR);

  const duration = options?.duration ?? 0.72;
  const staggerAmount = Math.min(0.15, 0.25);
  const stagger = { amount: staggerAmount };
  const ease = "creating.cubicInOut";

  const flipRoot = root instanceof HTMLElement ? root : null;
  if (flipRoot) flipRoot.dataset.flipActive = "true";

  const notifyDone = () => {
    if (flipRoot) delete flipRoot.dataset.flipActive;
    window.dispatchEvent(new CustomEvent("creating-flip-complete"));
  };

  Flip.from(state, {
    targets: cardTargets,
    duration,
    ease,
    stagger,
    nested: true,
    prune: true,
    absolute: ".creating-card--filter-leaving",
    fade: true,
    onEnter: (els) =>
      gsap.fromTo(
        els,
        { opacity: 0, y: 18 },
        {
          opacity: 1,
          y: 0,
          duration: 0.55,
          ease: "creating.cubicOut",
        },
      ),
    onLeave: (els) =>
      gsap.to(els, {
        opacity: 0,
        duration: 0.35,
        ease: "creating.cubicInOut",
      }),
    onComplete: notifyDone,
  });

  gsap.delayedCall(duration + staggerAmount, () => {
    options?.onComplete?.();
  });
}

export function staggerCardsIn(
  root: ParentNode | null,
  reducedMotion: boolean,
  selector = CARD_FLIP_SELECTOR,
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
