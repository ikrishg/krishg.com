import * as THREE from "three";
import type { CreatingCategoryFilter, CreatingEntry, CreatingView } from "./types";
import { maxPictureSize } from "./layout";

const _instance = new THREE.Matrix4();
const _worldMatrix = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _world = new THREE.Vector3();
const _localOrigin = new THREE.Vector3();
const _localDir = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _ndc = new THREE.Vector3();

function tileHalfExtents(pictureSize: number) {
  const tileW = pictureSize * 0.5;
  const tileH = pictureSize * 0.625;
  const planeHalfHeight = 0.625;
  return { halfW: tileW * 0.5, halfH: tileH * planeHalfHeight };
}

function rayHitsTileLocal(
  ray: THREE.Ray,
  matrix: THREE.Matrix4,
  halfW: number,
  halfH: number,
): number | null {
  _inv.copy(matrix).invert();
  _localOrigin.copy(ray.origin).applyMatrix4(_inv);
  _localDir.copy(ray.direction).transformDirection(_inv).normalize();

  const denom = _localDir.z;
  if (Math.abs(denom) < 1e-6) return null;
  const t = -_localOrigin.z / denom;
  if (t < 1e-4) return null;

  _hit.copy(_localDir).multiplyScalar(t).add(_localOrigin);
  const slop = 1.015;
  if (Math.abs(_hit.x) > halfW * slop || Math.abs(_hit.y) > halfH * slop) {
    return null;
  }
  return t;
}

export function pickTileInstanceId(
  mesh: THREE.InstancedMesh,
  camera: THREE.Camera,
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  view: CreatingView,
): number {
  const rect = canvas.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);

  mesh.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);

  const pictureSize = maxPictureSize(view);
  const savedRaycast = mesh.raycast;
  mesh.raycast = THREE.InstancedMesh.prototype.raycast;
  const hits = raycaster.intersectObject(mesh, false);
  mesh.raycast = savedRaycast;

  if (hits.length > 0 && hits[0].instanceId != null) {
    return hits[0].instanceId;
  }

  const { halfW, halfH } = tileHalfExtents(pictureSize);
  const ray = raycaster.ray;
  let bestId = -1;
  let bestT = Infinity;

  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, _instance);
    _worldMatrix.multiplyMatrices(mesh.matrixWorld, _instance);
    const t = rayHitsTileLocal(ray, _worldMatrix, halfW, halfH);
    if (t == null || t >= bestT) continue;
    bestT = t;
    bestId = i;
  }

  return bestId;
}

export function pickPointForInstance(
  mesh: THREE.InstancedMesh,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
  view: CreatingView,
  instanceId: number,
): { x: number; y: number } | null {
  const projected = projectTileCenters(mesh, camera, canvas);
  const center = projected.find((p) => p.instanceId === instanceId);
  if (!center) return null;

  for (let radius = 0; radius <= 28; radius += 4) {
    const steps = radius === 0 ? 1 : 10;
    for (let s = 0; s < steps; s += 1) {
      const angle = (s / steps) * Math.PI * 2;
      const x = center.x + Math.cos(angle) * radius;
      const y = center.y + Math.sin(angle) * radius;
      if (
        pickTileInstanceId(mesh, camera, x, y, canvas, view) === instanceId
      ) {
        return { x, y };
      }
    }
  }
  return null;
}

export function projectTileCenters(
  mesh: THREE.InstancedMesh,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
): { instanceId: number; x: number; y: number }[] {
  const rect = canvas.getBoundingClientRect();
  const out: { instanceId: number; x: number; y: number }[] = [];
  mesh.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);

  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, _instance);
    _worldMatrix.multiplyMatrices(mesh.matrixWorld, _instance);
    _world.set(0, 0, 0).applyMatrix4(_worldMatrix);
    _ndc.copy(_world).project(camera);
    if (_ndc.z > 1) continue;
    const x = ((_ndc.x + 1) / 2) * rect.width + rect.left;
    const y = ((1 - _ndc.y) / 2) * rect.height + rect.top;
    out.push({ instanceId: i, x, y });
  }
  return out;
}

export function entryAtInstance(
  entries: CreatingEntry[],
  filter: CreatingCategoryFilter,
  instanceId: number,
): CreatingEntry | undefined {
  const visible =
    filter === "all" ? entries : entries.filter((e) => e.category === filter);
  return visible[instanceId];
}
