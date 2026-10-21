import * as THREE from "three";

export type FitResult = {
  center: THREE.Vector3;
  distance: number;
  box: THREE.Box3;
};

export function bookClosedFitBox(root: THREE.Object3D): THREE.Box3 {
  const cover = root.getObjectByName("Cover_Hinge");
  const savedY = cover?.rotation.y ?? 0;
  if (cover) cover.rotation.y = 0;
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(root);
  if (cover) cover.rotation.y = savedY;
  root.updateWorldMatrix(true, true);
  return box;
}

export function bookEnvelopeFitBox(root: THREE.Object3D): THREE.Box3 {
  const cover = root.getObjectByName("Cover_Hinge");
  const savedY = cover?.rotation.y ?? 0;
  const box = new THREE.Box3();
  for (const angle of [0, -Math.PI / 2, -Math.PI]) {
    if (cover) cover.rotation.y = angle;
    root.updateWorldMatrix(true, true);
    box.union(new THREE.Box3().setFromObject(root));
  }
  if (cover) cover.rotation.y = savedY;
  root.updateWorldMatrix(true, true);
  return box;
}

/** @deprecated use bookEnvelopeFitBox */
export function bookSpreadFitBox(root: THREE.Object3D): THREE.Box3 {
  return bookEnvelopeFitBox(root);
}

export function expandBoxForShadow(box: THREE.Box3, shadowY: number): THREE.Box3 {
  const expanded = box.clone();
  expanded.min.y = Math.min(expanded.min.y, shadowY - 0.14);
  expanded.max.y += 0.06;
  expanded.min.x -= 0.04;
  expanded.max.x += 0.04;
  return expanded;
}

export function nudgeFitCenterScreenPx(
  camera: THREE.PerspectiveCamera,
  center: THREE.Vector3,
  distance: number,
  viewDirection: THREE.Vector3,
  pxX: number,
  pxY: number,
  viewportWidth: number,
  viewportHeight: number,
): THREE.Vector3 {
  if (!pxX && !pxY) return center;
  const dir = viewDirection.clone().normalize();
  const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();
  const fovRad = (camera.fov * Math.PI) / 180;
  const worldPerPxX =
    (2 * distance * Math.tan(fovRad / 2) * camera.aspect) / viewportWidth;
  const worldPerPxY = (2 * distance * Math.tan(fovRad / 2)) / viewportHeight;
  return center
    .clone()
    .addScaledVector(right, pxX * worldPerPxX)
    .addScaledVector(up, -pxY * worldPerPxY);
}

export function fitPerspectiveCamera(
  camera: THREE.PerspectiveCamera,
  object: THREE.Object3D,
  margin = 1.38,
  viewDirection = new THREE.Vector3(0, 0.06, 1),
  boxOverride?: THREE.Box3,
  shadowY?: number,
  screenNudgePx?: [number, number],
  viewportSize?: { width: number; height: number },
): FitResult {
  object.updateWorldMatrix(true, true);
  let box = boxOverride ?? new THREE.Box3().setFromObject(object);
  if (shadowY !== undefined) {
    box = expandBoxForShadow(box, shadowY);
  }
  if (box.isEmpty()) {
    return {
      center: new THREE.Vector3(),
      distance: 6,
      box: new THREE.Box3(),
    };
  }

  let center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const fovRad = (camera.fov * Math.PI) / 180;
  const tanHalfFov = Math.tan(fovRad / 2);
  const fitHeightDistance = size.y / (2 * tanHalfFov);
  const fitWidthDistance = size.x / (2 * tanHalfFov * camera.aspect);
  const distance = margin * Math.max(fitHeightDistance, fitWidthDistance, 0.01);

  const dir = viewDirection.clone().normalize();
  if (screenNudgePx && viewportSize) {
    center = nudgeFitCenterScreenPx(
      camera,
      center,
      distance,
      dir,
      screenNudgePx[0],
      screenNudgePx[1],
      viewportSize.width,
      viewportSize.height,
    );
  }
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.lookAt(center);
  camera.near = Math.max(0.02, distance / 200);
  camera.far = distance * 200;
  camera.updateProjectionMatrix();

  return { center, distance, box };
}
