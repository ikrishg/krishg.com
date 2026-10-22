import * as THREE from "three";

/** Frame-rate independent exponential damping from the spec. */
export function damp(
  current: number,
  target: number,
  lambda: number,
  dt: number,
): number {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function dampVec2(
  current: THREE.Vector2,
  target: THREE.Vector2,
  lambda: number,
  dt: number,
  out: THREE.Vector2,
): THREE.Vector2 {
  const t = 1 - Math.exp(-lambda * dt);
  out.x = THREE.MathUtils.lerp(current.x, target.x, t);
  out.y = THREE.MathUtils.lerp(current.y, target.y, t);
  return out;
}

/** Stop demand-mode invalidation once damping / impulses are settled. */
export const MOTION_EPS = 1e-3;

export function motionSettled(value: number, epsilon = MOTION_EPS): boolean {
  return Math.abs(value) < epsilon;
}
