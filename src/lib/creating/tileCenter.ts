import * as THREE from "three";
import type { CreatingView } from "./types";
import type { TileLayout } from "./layout";

const PI = Math.PI;

export type TileCenterState = {
  view: CreatingView;
  globeFormation: number;
  deformScroll: number;
  inputVelocity: number;
  rowsDelta: THREE.Vector3;
};

export function computeTileCenter(
  id: number,
  layout: TileLayout,
  state: TileCenterState,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  const r = 10.5 + Math.sin(id * 6510.0) * 0.01;
  const row = Math.round(layout.row);
  const rowShift = state.rowsDelta.getComponent(row);
  let theta = layout.theta + rowShift;
  let y = layout.y;

  if (state.view === "timeline") {
    const x = r * Math.sin(theta);
    const z = r * Math.cos(theta);
    return target.set(x, y, z);
  }
  if (state.view === "listicle") {
    const x = r * Math.sin(theta);
    const z = r * Math.cos(theta);
    return target.set(y, x, z);
  }

  let x = r * Math.sin(theta);
  let z = r * Math.cos(theta);
  y += Math.sin(id * 181.0) * 0.02;

  const globeY = y + Math.sin(id * 150.0) * 5.0 * state.globeFormation;
  const globeR = Math.hypot(x, z) * (1.0 - Math.abs(y) * 0.05 * state.globeFormation);
  const angle = Math.atan2(z, x);
  y = THREE.MathUtils.lerp(y, globeY, state.globeFormation);
  x = THREE.MathUtils.lerp(x, Math.sin(angle) * globeR, state.globeFormation);
  z = THREE.MathUtils.lerp(z, Math.cos(angle) * globeR, state.globeFormation);

  const deform = 1.0 - 0.35 * Math.cos(y * PI) * state.deformScroll;
  y *= deform;

  const drift = state.inputVelocity * Math.abs(Math.sin(id * 86.0)) * 0.01;
  x += drift;

  return target.set(x, y, z);
}
