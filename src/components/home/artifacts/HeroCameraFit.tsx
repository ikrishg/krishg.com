import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { useThree } from "@react-three/fiber";
import type { Group } from "three";
import * as THREE from "three";
import type { KrishModelKind } from "./artifact-types";
import {
  ARTIFACT_PAD_PX,
  fitPadPx,
  applyCameraFit,
  frameFitBox,
  meshWorldBox,
  shadowDropWorld,
  solveStageCanvasHeight,
  targetMeshHeightPx,
  maxMeshWidthFraction,
  maxStageCanvasHeightPx,
  buildClearanceBoxes,
  screenMeshHeightPx,
  minClearancePx,
  projectBoxToScreenPx,
} from "./fitArtifactStage";
import { useArtifactShell } from "./ArtifactShellContext";

type Props = {
  children: ReactNode;
  kind: KrishModelKind;
  modelRoot: THREE.Object3D;
  viewDirection?: [number, number, number];
  onFitted?: (info: {
    shadowY: number;
    restTarget: THREE.Vector3;
    canvasHeightPx: number;
    meshBox: THREE.Box3;
    viewW: number;
    viewH: number;
  }) => void;
  fitRef?: MutableRefObject<(() => void) | null>;
};

export function HeroCameraFit({
  children,
  kind,
  modelRoot,
  viewDirection = [0, 0.06, 1],
  onFitted,
  fitRef,
}: Props) {
  const groupRef = useRef<Group>(null);
  const shellRef = useArtifactShell();
  const { camera, size, invalidate } = useThree();
  const dir = useRef(new THREE.Vector3(...viewDirection));

  const fit = useCallback(() => {
    const group = groupRef.current;
    if (!group || !(camera instanceof THREE.PerspectiveCamera)) return;

    let groupScale = 1;
    group.scale.setScalar(groupScale);
    group.updateWorldMatrix(true, true);
    modelRoot.updateWorldMatrix(true, true);

    const meshBox = meshWorldBox(group);
    if (meshBox.isEmpty()) return;

    const shadowGroundY = meshBox.min.y - 0.008;
    const frameBox = frameFitBox(
      meshBox,
      shadowGroundY,
      shadowDropWorld(kind),
      kind,
    );
    const clearanceBoxes = buildClearanceBoxes(
      meshBox,
      shadowGroundY,
      kind,
    );
    const zoomClearanceBoxes =
      kind === "computer" ? [meshBox.clone()] : clearanceBoxes;

    const viewportWidth =
      shellRef?.current?.ownerDocument?.defaultView?.innerWidth ??
      size.width;
    const targetMesh = targetMeshHeightPx(kind, viewportWidth);
    const minCanvasH =
      targetMesh + 2 * ARTIFACT_PAD_PX + (kind === "computer" ? 56 : 40);
    const padPx = fitPadPx(kind);
    const shell = shellRef?.current;
    const maxCanvas = maxStageCanvasHeightPx(viewportWidth);
    const widthCapPx = undefined;
    const solved = solveStageCanvasHeight(
      camera,
      meshBox,
      frameBox,
      size.width,
      targetMesh,
      padPx,
      minCanvasH,
      dir.current,
      Math.min(size.height, maxCanvas),
      widthCapPx,
      maxCanvas,
    );
    const fitW = size.width;
    const fitH = solved.canvasHeightPx;

    applyCameraFit(camera, solved.center, solved.distance, dir.current);

    let lo = solved.distance * 0.32;
    let hi = solved.distance * 1.18;
    for (let pass = 0; pass < 40; pass++) {
      const mid = (lo + hi) / 2;
      applyCameraFit(camera, solved.center, mid, dir.current);
      const meshH = screenMeshHeightPx(camera, meshBox, fitW, fitH);
      const clear = minClearancePx(
        camera,
        zoomClearanceBoxes,
        solved.center,
        mid,
        dir.current,
        fitW,
        fitH,
        0,
      );
      const tooClose = clear < padPx - 0.5;
      if (tooClose) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    solved.distance = hi;
    applyCameraFit(camera, solved.center, solved.distance, dir.current);

    if (kind !== "computer") {
      for (let norm = 0; norm < 32; norm++) {
        applyCameraFit(camera, solved.center, solved.distance, dir.current);
        const meshH = screenMeshHeightPx(camera, meshBox, fitW, fitH);
        if (Math.abs(meshH - targetMesh) <= 1.5) break;
        const clear = minClearancePx(
          camera,
          clearanceBoxes,
          solved.center,
          solved.distance,
          dir.current,
          fitW,
          fitH,
          0,
        );
        if (meshH > targetMesh + 1.5) {
          solved.distance *= 1.012;
        } else if (meshH < targetMesh - 1.5) {
          const nextD = solved.distance * 0.992;
          const clearNext = minClearancePx(
            camera,
            clearanceBoxes,
            solved.center,
            nextD,
            dir.current,
            fitW,
            fitH,
            0,
          );
          if (clearNext < padPx - 0.5) break;
          solved.distance = nextD;
        } else {
          break;
        }
      }
      applyCameraFit(camera, solved.center, solved.distance, dir.current);
    }

    const applyComputerScalePass = () => {
      group.updateWorldMatrix(true, true);
      modelRoot.updateWorldMatrix(true, true);
      const scaledMesh = meshWorldBox(group);
      if (scaledMesh.isEmpty()) return;
      meshBox.copy(scaledMesh);
      const scaledShadowY = meshBox.min.y - 0.008;
      frameBox.copy(
        frameFitBox(meshBox, scaledShadowY, shadowDropWorld(kind), kind),
      );
      zoomClearanceBoxes.length = 0;
      zoomClearanceBoxes.push(meshBox.clone());
      clearanceBoxes.length = 0;
      clearanceBoxes.push(
        ...buildClearanceBoxes(meshBox, scaledShadowY, kind),
      );
    };

    if (kind === "computer") {
      const widthCapPxScreen = Math.min(
        viewportWidth * maxMeshWidthFraction(kind),
        fitW - 2 * padPx,
      );
      let loD = solved.distance * 0.18;
      let hiD = solved.distance * 1.08;
      let bestD = solved.distance;
      let bestH = 0;
      for (let tune = 0; tune < 56; tune++) {
        const distance = (loD + hiD) / 2;
        applyCameraFit(camera, solved.center, distance, dir.current);
        const meshH = screenMeshHeightPx(camera, meshBox, fitW, fitH);
        const clearRest = minClearancePx(
          camera,
          zoomClearanceBoxes,
          solved.center,
          distance,
          dir.current,
          fitW,
          fitH,
          0,
        );
        const screen = projectBoxToScreenPx(camera, meshBox, fitW, fitH);
        const meshW = screen ? screen.maxX - screen.minX : 0;
        const ok =
          clearRest >= padPx - 0.5 && meshW <= widthCapPxScreen + 1.5;
        if (ok) {
          if (meshH > bestH) {
            bestH = meshH;
            bestD = distance;
          }
          hiD = distance;
        } else {
          loD = distance;
        }
      }
      solved.distance = bestD;
      applyCameraFit(camera, solved.center, solved.distance, dir.current);
      for (let step = 0; step < 28; step++) {
        applyCameraFit(camera, solved.center, solved.distance, dir.current);
        const meshH = screenMeshHeightPx(camera, meshBox, fitW, fitH);
        if (meshH >= targetMesh - 0.75) break;
        const nextD = solved.distance * 0.988;
        const clearRest = minClearancePx(
          camera,
          zoomClearanceBoxes,
          solved.center,
          nextD,
          dir.current,
          fitW,
          fitH,
          0,
        );
        const screen = projectBoxToScreenPx(camera, meshBox, fitW, fitH);
        const meshW = screen ? screen.maxX - screen.minX : 0;
        if (
          clearRest < padPx - 0.5 ||
          meshW > widthCapPxScreen + 1.5
        ) {
          break;
        }
        solved.distance = nextD;
      }
      applyCameraFit(camera, solved.center, solved.distance, dir.current);
      let meshHNow = screenMeshHeightPx(camera, meshBox, fitW, fitH);
      if (meshHNow > 0 && meshHNow < targetMesh - 2) {
        const scaleCap =
          viewportWidth < 768 ? 1.06 : viewportWidth < 1200 ? 1.09 : 1.12;
        const scaleUp = Math.min(scaleCap, targetMesh / meshHNow);
        groupScale *= scaleUp;
        group.scale.setScalar(groupScale);
        applyComputerScalePass();
        solved.center = frameBox.getCenter(new THREE.Vector3());
        for (let step = 0; step < 32; step++) {
          applyCameraFit(camera, solved.center, solved.distance, dir.current);
          meshHNow = screenMeshHeightPx(camera, meshBox, fitW, fitH);
          if (meshHNow >= targetMesh - 0.75) break;
          const nextD = solved.distance * 0.988;
          const clearRest = minClearancePx(
            camera,
            zoomClearanceBoxes,
            solved.center,
            nextD,
            dir.current,
            fitW,
            fitH,
            0,
          );
          const screen = projectBoxToScreenPx(camera, meshBox, fitW, fitH);
          const meshW = screen ? screen.maxX - screen.minX : 0;
          if (
            clearRest < padPx - 0.5 ||
            meshW > widthCapPxScreen + 1.5
          ) {
            break;
          }
          solved.distance = nextD;
        }
        applyCameraFit(camera, solved.center, solved.distance, dir.current);
      }
    }

    if (shell) {
      shell.style.setProperty(
        "--artifact-canvas-height",
        `${solved.canvasHeightPx}px`,
      );
    }

    invalidate();
    onFitted?.({
      shadowY: shadowGroundY,
      restTarget: solved.center.clone(),
      canvasHeightPx: solved.canvasHeightPx,
      meshBox: meshBox.clone(),
      viewW: fitW,
      viewH: fitH,
    });
  }, [
    camera,
    kind,
    modelRoot,
    invalidate,
    onFitted,
    shellRef,
    size.width,
    size.height,
  ]);

  useEffect(() => {
    if (!fitRef) return;
    fitRef.current = fit;
    return () => {
      fitRef.current = null;
    };
  }, [fit, fitRef]);

  useLayoutEffect(() => {
    fit();
    const raf = requestAnimationFrame(() => {
      fit();
      requestAnimationFrame(fit);
    });
    return () => cancelAnimationFrame(raf);
  }, [fit, size.width, size.height]);

  useEffect(() => {
    const shell = shellRef?.current;
    const wrap = shell?.querySelector(".artifact-stage__canvas");
    if (!wrap) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [fit, shellRef]);

  return <group ref={groupRef}>{children}</group>;
}
