import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Center, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { attachAppearance } from "~lib/krish-3d/appearance.js";
import { attachInteractions } from "~lib/krish-3d/interactions.js";
import type { KrishModelKind } from "./artifact-types";
import { getArtifactTune } from "./heroArtifactTune";
import { HeroCameraFit } from "./HeroCameraFit";
import { HeroCursorTilt } from "./HeroCursorTilt";
import { useArtifactShell } from "./ArtifactShellContext";
import {
  bandHeightPx,
  frameFitBox,
  hideArtifactGroundMeshes,
  projectBoxToScreenPx,
  targetMeshHeightPx,
} from "./fitArtifactStage";

export type { KrishModelKind } from "./artifact-types";

type Props = {
  kind: Exclude<KrishModelKind, "book">;
  glbUrl: string;
  portraitUrl?: string;
};

function markShellReady(shell: HTMLElement | null | undefined) {
  if (!shell) return;
  shell.dataset.artifactReady = "true";
}

const FRAME_FINISH = "#e8e3d9";
const FRAME_TRIM = "#b8a477";
const COMPUTER_HOUSING = "#a9acb0";

export function KrishInteractiveScene({
  kind,
  glbUrl,
  portraitUrl,
}: Props) {
  useGLTF.preload(glbUrl);
  const { scene } = useGLTF(glbUrl);
  const shellRef = useArtifactShell();
  const fitAgainRef = useRef<(() => void) | null>(null);
  const interactionRef = useRef<ReturnType<typeof attachInteractions> | null>(
    null,
  );
  const appearanceRef = useRef<ReturnType<typeof attachAppearance> | null>(
    null,
  );
  const inViewRef = useRef(true);
  const animatingRef = useRef(true);
  const { camera, gl, size, invalidate } = useThree();
  const tune = useMemo(() => getArtifactTune(kind), [kind]);

  const root = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((m) => m.clone());
        } else if (mesh.material) {
          mesh.material = mesh.material.clone();
        }
      }
    });
    hideArtifactGroundMeshes(clone);
    return clone;
  }, [scene]);

  useEffect(() => {
    const shell = shellRef?.current;
    if (!shell) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        inViewRef.current = entry.isIntersecting;
        if (entry.isIntersecting) invalidate();
      },
      { threshold: 0.08, rootMargin: "80px 0px" },
    );
    observer.observe(shell);
    return () => observer.disconnect();
  }, [shellRef, invalidate]);

  useEffect(() => {
    const shell = shellRef?.current;
    if (shell) shell.dataset.artifactReady = "false";

    const gltf = { scene: root };
    let appearance: ReturnType<typeof attachAppearance> | null = null;
    let interaction: ReturnType<typeof attachInteractions> | null = null;

    try {
      appearance = attachAppearance(root);
      appearanceRef.current = appearance;

      if (kind === "frame") {
        appearance.setColor("frame", FRAME_FINISH);
        appearance.setColor("trim", FRAME_TRIM);
      } else {
        appearance.setColor("housing", COMPUTER_HOUSING);
      }

      interaction = attachInteractions(gltf, {
        kind,
        element: gl.domElement,
        camera,
        engagementShell: (shell ?? null) as null | undefined,
        onState: () => {
          animatingRef.current = true;
          if (inViewRef.current) invalidate();
        },
      });
      interactionRef.current = interaction;
      const attached = interaction;

      void (async () => {
        if (!portraitUrl) {
          fitAgainRef.current?.();
          markShellReady(shellRef?.current);
          return;
        }
        try {
          if (kind === "frame") {
            await attached?.setFramePortrait?.(portraitUrl);
          } else {
            await attached?.setPortrait?.(portraitUrl);
          }
        } catch {
          /* keep default materials */
        }
        fitAgainRef.current?.();
        requestAnimationFrame(() => markShellReady(shellRef?.current));
      })();
    } catch {
      markShellReady(shellRef?.current);
    }

    return () => {
      interaction?.dispose();
      appearance?.dispose();
      interactionRef.current = null;
      appearanceRef.current = null;
    };
  }, [root, kind, portraitUrl, camera, gl, invalidate, shellRef]);

  useFrame((_, delta) => {
    if (!inViewRef.current) return;
    interactionRef.current?.update(Math.min(delta, 0.05));
    const state = interactionRef.current?.state as
      | {
          dragging?: boolean;
          playing?: boolean;
          closing?: boolean;
        }
      | undefined;

    if (!animatingRef.current) return;
    invalidate();
    if (!state) {
      animatingRef.current = false;
      return;
    }
    const live =
      state.dragging ||
      state.playing ||
      state.closing;
    animatingRef.current = Boolean(live);
  });

  const onFitted = useCallback(
    (info: {
      restTarget: THREE.Vector3;
      canvasHeightPx: number;
      meshBox: THREE.Box3;
      viewW: number;
      viewH: number;
    }) => {
      const shell = shellRef?.current;
      if (shell && camera instanceof THREE.PerspectiveCamera) {
        const frameBox = frameFitBox(info.meshBox, kind);
        const viewW = info.viewW;
        const viewH = info.viewH;
        const frameScreen = projectBoxToScreenPx(
          camera,
          frameBox,
          viewW,
          viewH,
        );
        const meshScreen = projectBoxToScreenPx(
          camera,
          info.meshBox,
          viewW,
          viewH,
        );
        if (meshScreen) {
          const meshH = meshScreen.maxY - meshScreen.minY;
          const viewportWidth = window.innerWidth;
          const band = bandHeightPx(viewportWidth);
          shell.dataset.meshHeightPx = String(Math.round(meshH * 10) / 10);
          shell.dataset.meshBandPct = String(
            Math.round((meshH / band) * 1000) / 10,
          );
        }
        if (frameScreen) {
          shell.dataset.clearTopPx = String(
            Math.round(frameScreen.minY * 10) / 10,
          );
          shell.dataset.clearBottomPx = String(
            Math.round((viewH - frameScreen.maxY) * 10) / 10,
          );
          shell.dataset.clearLeftPx = String(
            Math.round(frameScreen.minX * 10) / 10,
          );
          shell.dataset.clearRightPx = String(
            Math.round((viewW - frameScreen.maxX) * 10) / 10,
          );
        }
        shell.dataset.targetMeshPx = String(
          Math.round(targetMeshHeightPx(kind, window.innerWidth) * 10) / 10,
        );
      }

      requestAnimationFrame(() => invalidate());
    },
    [camera, invalidate, kind, shellRef, size.height, size.width],
  );

  return (
    <>
      <HeroCameraFit
        kind={kind}
        modelRoot={root}
        {...(tune.viewDirection
          ? { viewDirection: tune.viewDirection }
          : {})}
        onFitted={onFitted}
        fitRef={fitAgainRef}
      >
        <Center>
          <HeroCursorTilt>
            <group rotation={tune.groupRotation} position={tune.groupPosition}>
              <primitive object={root} />
            </group>
          </HeroCursorTilt>
        </Center>
      </HeroCameraFit>
    </>
  );
}
