import * as THREE from "three";
import type { KrishModelKind } from "./artifact-types";

export const ARTIFACT_PAD_PX = 24;
export const ORBIT_AZIMUTH_RAD = (35 * Math.PI) / 180;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export function fitPadPx(_kind: KrishModelKind): number {
  return ARTIFACT_PAD_PX;
}

export function bandHeightPx(viewportWidth: number): number {
  return viewportWidth < 768 ? 542.5 : 600;
}

/** Max CSS canvas height so WebGL does not clip inside a fixed desktop band. */
export function maxStageCanvasHeightPx(viewportWidth: number): number {
  if (viewportWidth < 768) {
    return Math.round(bandHeightPx(viewportWidth) * 0.56);
  }
  return bandHeightPx(viewportWidth) - 16;
}

/** Shared mesh height fraction so computer, frame, and book align visually. */
export const HERO_MESH_BAND_FRACTION_DESKTOP = 0.68;
export const HERO_MESH_BAND_FRACTION_MOBILE = 0.38;

export function targetMeshHeightPx(
  _kind: KrishModelKind,
  viewportWidth: number,
): number {
  const band = bandHeightPx(viewportWidth);
  const fraction =
    viewportWidth < 768
      ? HERO_MESH_BAND_FRACTION_MOBILE
      : HERO_MESH_BAND_FRACTION_DESKTOP;
  return Math.round(band * fraction);
}

export function maxMeshWidthFraction(kind: KrishModelKind): number {
  return kind === "computer" ? 0.48 : 1;
}

export function shadowDropWorld(kind: KrishModelKind): number {
  if (kind === "computer") return 0.22;
  if (kind === "frame") return 0.22;
  return 0.28;
}

export function meshWorldBox(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const name = mesh.name ?? "";
    if (name.includes("Shadow") || name.includes("Contact")) return;
    box.union(new THREE.Box3().setFromObject(mesh));
  });
  return box;
}

function boxCorners(box: THREE.Box3): THREE.Vector3[] {
  const { min, max } = box;
  const corners: THREE.Vector3[] = [];
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) {
        corners.push(new THREE.Vector3(x, y, z));
      }
    }
  }
  return corners;
}

export function rotateBoxAroundY(
  box: THREE.Box3,
  center: THREE.Vector3,
  angle: number,
): THREE.Box3 {
  const out = new THREE.Box3();
  const offset = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (const corner of boxCorners(box)) {
    offset.copy(corner).sub(center);
    p.copy(offset).applyAxisAngle(Y_AXIS, angle).add(center);
    out.expandByPoint(p);
  }
  return out;
}

export function frameFitBox(
  meshBox: THREE.Box3,
  shadowGroundY: number,
  shadowDrop: number,
  kind: KrishModelKind,
): THREE.Box3 {
  const frame = meshBox.clone();
  frame.min.y = Math.min(frame.min.y, shadowGroundY - shadowDrop);
  const padX =
    kind === "computer" ? 0.06 : kind === "frame" ? 0.08 : 0.1;
  frame.min.x -= padX;
  frame.max.x += padX;
  frame.max.y += kind === "frame" ? 0.03 : 0.02;
  return frame;
}

export function buildClearanceBoxes(
  meshBox: THREE.Box3,
  shadowGroundY: number,
  kind: KrishModelKind,
): THREE.Box3[] {
  return [frameFitBox(meshBox, shadowGroundY, shadowDropWorld(kind), kind)];
}

function distanceForMeshHeight(
  camera: THREE.PerspectiveCamera,
  meshHeight: number,
  viewH: number,
  targetMeshPx: number,
): number {
  const fovRad = (camera.fov * Math.PI) / 180;
  const tanHalf = Math.tan(fovRad / 2);
  return meshHeight / 2 / (tanHalf * (targetMeshPx / viewH));
}

function distanceForMeshWidth(
  camera: THREE.PerspectiveCamera,
  meshWidth: number,
  viewW: number,
  viewH: number,
  maxWidthPx: number,
): number {
  const fovRad = (camera.fov * Math.PI) / 180;
  const tanHalf = Math.tan(fovRad / 2);
  return meshWidth / 2 / (tanHalf * camera.aspect * (maxWidthPx / viewW));
}

export type StageFitResult = {
  center: THREE.Vector3;
  distance: number;
  meshBox: THREE.Box3;
  frameBox: THREE.Box3;
  canvasHeightPx: number;
  projectedMeshHeightPx: number;
};

function frameFitsWithPad(
  camera: THREE.PerspectiveCamera,
  frameBox: THREE.Box3,
  center: THREE.Vector3,
  distance: number,
  viewDirection: THREE.Vector3,
  viewW: number,
  viewH: number,
  padPx: number,
): boolean {
  const savedPos = camera.position.clone();
  const savedQuat = camera.quaternion.clone();
  applyCameraFit(camera, center, distance, viewDirection);
  const screen = projectBoxToScreenPx(camera, frameBox, viewW, viewH);
  camera.position.copy(savedPos);
  camera.quaternion.copy(savedQuat);
  camera.updateProjectionMatrix();
  if (!screen) return false;
  return (
    screen.minX >= padPx - 0.5 &&
    screen.minY >= padPx - 0.5 &&
    viewW - screen.maxX >= padPx - 0.5 &&
    viewH - screen.maxY >= padPx - 0.5
  );
}

export function solveStageCanvasHeight(
  camera: THREE.PerspectiveCamera,
  meshBox: THREE.Box3,
  frameBox: THREE.Box3,
  viewW: number,
  targetMeshPx: number,
  padPx: number,
  minCanvasH: number,
  viewDirection: THREE.Vector3,
  initialViewH?: number,
  widthCapPx?: number,
  maxCanvasH?: number,
): StageFitResult {
  const center = frameBox.getCenter(new THREE.Vector3());
  const meshSize = meshBox.getSize(new THREE.Vector3());
  const meshSizeY = meshSize.y;
  const meshSizeX = meshSize.x;
  const fovRad = (camera.fov * Math.PI) / 180;
  const tanHalf = Math.tan(fovRad / 2);
  const bandLimit =
    maxCanvasH && maxCanvasH > 0
      ? maxCanvasH
      : minCanvasH + 120;

  let canvasH = Math.min(
    bandLimit,
    Math.max(minCanvasH, initialViewH ?? 0, targetMeshPx + 2 * padPx + 32),
  );

  for (let i = 0; i < 64; i++) {
    let distance = distanceForMeshHeight(
      camera,
      meshSizeY,
      canvasH,
      targetMeshPx,
    );
    if (widthCapPx && widthCapPx > 0) {
      distance = Math.max(
        distance,
        distanceForMeshWidth(
          camera,
          meshSizeX,
          viewW,
          canvasH,
          widthCapPx,
        ),
      );
    }

    if (
      frameFitsWithPad(
        camera,
        frameBox,
        center,
        distance,
        viewDirection,
        viewW,
        canvasH,
        padPx,
      )
    ) {
      return {
        center,
        distance,
        meshBox,
        frameBox,
        canvasHeightPx: Math.ceil(canvasH),
        projectedMeshHeightPx:
          (meshSizeY / (2 * distance * tanHalf)) * canvasH,
      };
    }

    if (canvasH >= bandLimit) {
      let distance = distanceForMeshHeight(
        camera,
        meshSizeY,
        canvasH,
        targetMeshPx,
      );
      let guard = 0;
      while (
        !frameFitsWithPad(
          camera,
          frameBox,
          center,
          distance,
          viewDirection,
          viewW,
          canvasH,
          padPx,
        ) &&
        guard < 48
      ) {
        distance *= 1.012;
        guard++;
      }
      return {
        center,
        distance,
        meshBox,
        frameBox,
        canvasHeightPx: Math.ceil(canvasH),
        projectedMeshHeightPx:
          (meshSizeY / (2 * distance * tanHalf)) * canvasH,
      };
    }
    canvasH += 10;
  }

  const distance = distanceForMeshHeight(
    camera,
    meshSizeY,
    canvasH,
    targetMeshPx,
  );
  return {
    center,
    distance,
    meshBox,
    frameBox,
    canvasHeightPx: Math.ceil(canvasH),
    projectedMeshHeightPx:
      (meshSizeY / (2 * distance * tanHalf)) * canvasH,
  };
}

export function applyCameraFit(
  camera: THREE.PerspectiveCamera,
  center: THREE.Vector3,
  distance: number,
  viewDirection: THREE.Vector3,
): void {
  const dir = viewDirection.clone().normalize();
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.lookAt(center);
  camera.near = Math.max(0.02, distance / 200);
  camera.far = distance * 200;
  camera.updateProjectionMatrix();
}

export function projectBoxToScreenPx(
  camera: THREE.PerspectiveCamera,
  box: THREE.Box3,
  viewW: number,
  viewH: number,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (!(camera instanceof THREE.PerspectiveCamera)) return null;
  const corners: THREE.Vector3[] = [];
  const { min, max } = box;
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) {
        corners.push(new THREE.Vector3(x, y, z));
      }
    }
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const v = new THREE.Vector3();
  for (const corner of corners) {
    v.copy(corner).project(camera);
    const sx = (v.x * 0.5 + 0.5) * viewW;
    const sy = (-v.y * 0.5 + 0.5) * viewH;
    minX = Math.min(minX, sx);
    minY = Math.min(minY, sy);
    maxX = Math.max(maxX, sx);
    maxY = Math.max(maxY, sy);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

export function screenMeshHeightPx(
  camera: THREE.PerspectiveCamera,
  meshBox: THREE.Box3,
  viewW: number,
  viewH: number,
): number {
  const screen = projectBoxToScreenPx(camera, meshBox, viewW, viewH);
  if (!screen) return 0;
  return screen.maxY - screen.minY;
}

export function minClearancePx(
  camera: THREE.PerspectiveCamera,
  boxes: THREE.Box3[],
  center: THREE.Vector3,
  distance: number,
  viewDirection: THREE.Vector3,
  viewW: number,
  viewH: number,
  orbitAzimuth = 0,
): number {
  const padPx = ARTIFACT_PAD_PX;
  let min = Infinity;
  for (const box of boxes) {
    const angles =
      orbitAzimuth > 0 ? [-orbitAzimuth, 0, orbitAzimuth] : [0];
    for (const a of angles) {
      const test = a === 0 ? box : rotateBoxAroundY(box, center, a);
      const savedPos = camera.position.clone();
      const savedQuat = camera.quaternion.clone();
      applyCameraFit(camera, center, distance, viewDirection);
      const screen = projectBoxToScreenPx(camera, test, viewW, viewH);
      camera.position.copy(savedPos);
      camera.quaternion.copy(savedQuat);
      camera.updateProjectionMatrix();
      if (!screen) return 0;
      min = Math.min(
        min,
        screen.minX,
        screen.minY,
        viewW - screen.maxX,
        viewH - screen.maxY,
      );
    }
  }
  return min;
}

export function bumpDistanceForOrbitClearance(
  camera: THREE.PerspectiveCamera,
  clearanceBoxes: THREE.Box3[],
  center: THREE.Vector3,
  distance: number,
  viewDirection: THREE.Vector3,
  viewW: number,
  viewH: number,
  orbitAzimuth: number,
  maxDistance: number,
): number {
  let d = distance;
  for (let i = 0; i < 32; i++) {
    const clear = minClearancePx(
      camera,
      clearanceBoxes,
      center,
      d,
      viewDirection,
      viewW,
      viewH,
      orbitAzimuth,
    );
    if (clear >= ARTIFACT_PAD_PX - 0.5) return d;
    d = Math.min(d * 1.012, maxDistance);
    if (d >= maxDistance - 1e-6) return d;
  }
  return d;
}
