import { useEffect, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Group } from "three";
import * as THREE from "three";
import { useArtifactShell } from "./ArtifactShellContext";

type Props = {
  children: ReactNode;
};

/**
 * Horizontal cursor position drives horizontal yaw only on fine-pointer devices.
 */
export function HeroCursorTilt({ children }: Props) {
  const shellRef = useArtifactShell();
  const groupRef = useRef<Group>(null);
  const pointerX = useRef(0);
  const reducedMotion = useRef(false);
  const finePointer = useRef(false);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    reducedMotion.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const hoverFine = window.matchMedia("(hover: hover) and (pointer: fine)");
    finePointer.current = hoverFine.matches;
    if (!hoverFine.matches) return;

    const shell = shellRef?.current;
    if (!shell) return;
    const zone = shell.closest("section") ?? shell;

    const update = (clientX: number, clientY: number) => {
      const rect = zone.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const nx = (clientX - rect.left) / rect.width;
      const ny = (clientY - rect.top) / rect.height;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) {
        pointerX.current = 0;
      } else {
        pointerX.current = (nx - 0.5) * 2;
      }
      invalidate();
    };

    const onMove = (event: PointerEvent) => {
      update(event.clientX, event.clientY);
    };
    const onLeave = () => {
      pointerX.current = 0;
      invalidate();
    };

    zone.addEventListener("pointermove", onMove);
    zone.addEventListener("pointerleave", onLeave);
    return () => {
      zone.removeEventListener("pointermove", onMove);
      zone.removeEventListener("pointerleave", onLeave);
    };
  }, [shellRef, invalidate]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group || reducedMotion.current || !finePointer.current) return;

    const targetY = pointerX.current * THREE.MathUtils.degToRad(8);
    const damp = 1 - Math.exp(-14 * Math.min(delta, 0.05));
    const nextY = THREE.MathUtils.lerp(group.rotation.y, targetY, damp);
    const changed =
      Math.abs(nextY - group.rotation.y) > 0.0001 ||
      group.rotation.x !== 0 ||
      group.rotation.z !== 0 ||
      group.position.x !== 0 ||
      group.position.y !== 0 ||
      group.position.z !== 0;
    if (changed) {
      group.rotation.set(0, nextY, 0);
      group.position.set(0, 0, 0);
      invalidate();
    }
  });

  return <group ref={groupRef}>{children}</group>;
}
