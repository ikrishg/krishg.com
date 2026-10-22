import { useCallback, useRef } from "react";
import gsap from "gsap";
import { registerCreatingEasings } from "~lib/creating/easings";
import { useCreatingStore } from "./creating-store";

registerCreatingEasings();

export function useMorphTransition() {
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  const runMorph = useCallback((label: string, onMid: () => void) => {
    const store = useCreatingStore.getState();
    tweenRef.current?.kill();
    store.setMorphLabel(label);
    store.setMorphProgress(0);

    const tl = gsap.timeline({
      onComplete: () => {
        store.setMorphProgress(0);
        store.setMorphLabel(null);
      },
    });

    tl.to(
      { v: 0 },
      {
        v: 1,
        duration: 1.75,
        ease: "creating.cubicInOut",
        onUpdate() {
          store.setMorphProgress(this.targets()[0].v);
        },
      },
    );
    tl.call(onMid, undefined, 1.75);
    tl.to(
      { v: 1 },
      {
        v: 0,
        duration: 1.35,
        ease: "creating.cubicInOut",
        onUpdate() {
          store.setMorphProgress(this.targets()[0].v);
        },
      },
    );

    tweenRef.current = tl;
  }, []);

  return { runMorph };
}
