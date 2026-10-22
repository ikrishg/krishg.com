import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  layoutsForView,
  maxPictureSize,
  parallaxForView,
} from "~lib/creating/layout";
import { damp, MOTION_EPS, motionSettled } from "~lib/creating/damp";
import type { CreatingEntry, CreatingView } from "~lib/creating/types";
import { useCreatingStore } from "./creating-store";
import { tileFragmentShader, tileVertexShader } from "./tile-shaders";
import { buildTextureAtlas } from "./buildAtlas";
import { computeTileCenter } from "~lib/creating/tileCenter";

const _dummy = new THREE.Object3D();
const _center = new THREE.Vector3();

type Props = {
  visibleEntries: CreatingEntry[];
  view: CreatingView;
  globeFormation: number;
  openProgress: number;
  openId: number;
  reducedMotion: boolean;
  renderActive?: boolean;
};

function makePlaceholderAtlas(): THREE.DataTexture {
  const data = new Uint8Array([231, 221, 204, 255]);
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function writeLayoutAttributes(
  geo: THREE.BufferGeometry,
  visibleEntries: CreatingEntry[],
  layouts: ReturnType<typeof layoutsForView>,
  uvEntries?: { uvOffset: [number, number]; uvScale: [number, number] }[],
) {
  const count = visibleEntries.length;
  const aUvOffset = new Float32Array(count * 2);
  const aUvScale = new Float32Array(count * 2);
  const aId = new Float32Array(count);
  const defaultUv = { uvOffset: [0, 0] as [number, number], uvScale: [1, 1] as [number, number] };

  for (let i = 0; i < count; i++) {
    const uv = uvEntries?.[i] ?? defaultUv;
    aUvOffset[i * 2] = uv.uvOffset[0];
    aUvOffset[i * 2 + 1] = uv.uvOffset[1];
    aUvScale[i * 2] = uv.uvScale[0];
    aUvScale[i * 2 + 1] = uv.uvScale[1];
    aId[i] = i;
  }

  geo.setAttribute("aUvOffset", new THREE.InstancedBufferAttribute(aUvOffset, 2));
  geo.setAttribute("aUvScale", new THREE.InstancedBufferAttribute(aUvScale, 2));
  geo.setAttribute("aId", new THREE.InstancedBufferAttribute(aId, 1));
}

export function CreatingTiles({
  visibleEntries,
  view,
  globeFormation,
  openProgress,
  openId,
  reducedMotion,
  renderActive = true,
}: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const rowsDelta = useRef(new THREE.Vector3());
  const scrollImpulse = useRef(0);
  const inputVelocity = useRef(0);
  const deformScroll = useRef(0);
  const lastHoveredInstance = useRef(-2);
  const lastOpenId = useRef(-2);
  const lastOpenProgress = useRef(-1);
  const lastGlobeFormation = useRef(-1);
  const hoveredId = useCreatingStore((s) => s.hoveredId);
  const { invalidate } = useThree();

  const geometry = useMemo(() => {
    const geo = new THREE.InstancedBufferGeometry();
    geo.copy(new THREE.PlaneGeometry(1, 1.25, 1, 1));
    return geo;
  }, []);

  const layouts = useMemo(
    () => layoutsForView(visibleEntries, view),
    [visibleEntries, view],
  );

  const idMap = useMemo(() => {
    const m = new Map<string, number>();
    visibleEntries.forEach((e, i) => m.set(e.id, i));
    return m;
  }, [visibleEntries]);

  const uniforms = useMemo(
    () => ({
      uAtlas: { value: makePlaceholderAtlas() },
      uOpenProgress: { value: 0 },
      uOpenId: { value: -1 },
      uHoveredId: { value: -1 },
      uTint: { value: new THREE.Color("#b94a3f") },
      uPictureSize: { value: 1.7 },
    }),
    [],
  );

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.name = "creating-tiles";
    mesh.raycast = () => {};
    useCreatingStore.getState().setTileMesh(mesh);
    writeLayoutAttributes(geometry, visibleEntries, layouts);
    mesh.geometry = geometry;
    mesh.count = visibleEntries.length;
    invalidate();
  }, [geometry, visibleEntries, layouts, invalidate]);

  useEffect(() => {
    let cancelled = false;
    useCreatingStore.getState().setAtlasReady(false);
    const sources = visibleEntries.map((e) => ({
      url: e.cover,
      stampDemo: Boolean(e.demo),
    }));
    void buildTextureAtlas(sources).then(({ texture, entries }) => {
      if (cancelled || !materialRef.current || !meshRef.current) return;
      materialRef.current.uniforms.uAtlas.value = texture;
      writeLayoutAttributes(geometry, visibleEntries, layouts, entries);
      meshRef.current.count = visibleEntries.length;
      useCreatingStore.getState().setAtlasReady(true);
      invalidate();
    });
    return () => {
      cancelled = true;
    };
  }, [geometry, visibleEntries, layouts, invalidate]);

  useFrame((_, dt) => {
    if (!renderActive) return;
    const mesh = meshRef.current;
    if (mesh && layouts.length === visibleEntries.length) {
      const centerState = {
        view,
        globeFormation,
        deformScroll: deformScroll.current,
        inputVelocity: inputVelocity.current,
        rowsDelta: rowsDelta.current,
      };
      for (let i = 0; i < visibleEntries.length; i++) {
        const layout = layouts[i];
        if (!layout) continue;
        computeTileCenter(i, layout, centerState, _center);
        _dummy.position.copy(_center);
        _dummy.lookAt(0, 0, 0);
        _dummy.updateMatrix();
        mesh.setMatrixAt(i, _dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    const mat = materialRef.current;
    if (!mat) return;
    const store = useCreatingStore.getState();
    mat.uniforms.uOpenProgress.value = openProgress;
    mat.uniforms.uOpenId.value = openId;
    mat.uniforms.uHoveredId.value =
      hoveredId != null ? (idMap.get(hoveredId) ?? -1) : -1;

    mat.uniforms.uPictureSize.value = maxPictureSize(view);

    if (!reducedMotion) {
      const parallax = parallaxForView(view);
      const impulse = scrollImpulse.current;
      scrollImpulse.current *= Math.exp(-3.5 * dt);
      const push = impulse * dt * 2.8;

      if (view === "listicle") {
        rowsDelta.current.y += push * (parallax[1] ?? 1);
      } else {
        rowsDelta.current.x += push * (parallax[1] ?? 1);
        rowsDelta.current.z += push * (parallax[0] ?? 0.8);
      }

      inputVelocity.current = damp(inputVelocity.current, impulse * 350, 8, dt);
      deformScroll.current = damp(
        deformScroll.current,
        Math.min(1, Math.abs(impulse) * 2.5),
        4,
        dt,
      );
    }
    store.setListicleScrollY(rowsDelta.current.y);
    store.setRingScrollX(rowsDelta.current.x);

    const hoveredInstance =
      hoveredId != null ? (idMap.get(hoveredId) ?? -1) : -1;
    const uniformsDirty =
      lastHoveredInstance.current !== hoveredInstance ||
      lastOpenId.current !== openId ||
      Math.abs(lastOpenProgress.current - openProgress) > MOTION_EPS;
    lastHoveredInstance.current = hoveredInstance;
    lastOpenId.current = openId;
    lastOpenProgress.current = openProgress;

    const globeMoving =
      Math.abs(globeFormation - lastGlobeFormation.current) > MOTION_EPS;
    lastGlobeFormation.current = globeFormation;

    const motionActive =
      !motionSettled(scrollImpulse.current) ||
      !motionSettled(inputVelocity.current) ||
      !motionSettled(deformScroll.current) ||
      uniformsDirty ||
      globeMoving;

    if (motionActive) invalidate();
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ dx: number; dy?: number }>).detail;
      const dx = detail.dx ?? 0;
      const dy = detail.dy ?? 0;
      if (view === "listicle") {
        scrollImpulse.current += (dy !== 0 ? dy : dx) * 0.002;
      } else {
        scrollImpulse.current += (dx + dy) * 0.0015;
      }
      invalidate();
    };
    window.addEventListener("creating-scroll", handler);
    return () => window.removeEventListener("creating-scroll", handler);
  }, [invalidate, view]);

  if (visibleEntries.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, visibleEntries.length]}
      frustumCulled={false}
    >
      <shaderMaterial
        ref={materialRef}
        vertexShader={tileVertexShader}
        fragmentShader={tileFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite
      />
    </instancedMesh>
  );
}
