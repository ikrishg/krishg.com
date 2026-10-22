import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { Center, useGLTF } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { attachAppearance } from "~lib/krish-3d/appearance.js";
import { HeroCameraFit } from "./HeroCameraFit";
import { HeroCursorTilt } from "./HeroCursorTilt";
import { useArtifactShell } from "./ArtifactShellContext";
import { getArtifactTune } from "./heroArtifactTune";
import {
  bandHeightPx,
  frameFitBox,
  projectBoxToScreenPx,
  targetMeshHeightPx,
} from "./fitArtifactStage";

type Props = {
  glbUrl: string;
  coverUrl: string;
};

const BOOK_FINISH = "#243d3a";

function markShellReady(shell: HTMLElement | null | undefined) {
  if (!shell) return;
  shell.dataset.artifactReady = "true";
}

export function EducatorBookScene({ glbUrl, coverUrl }: Props) {
  useGLTF.preload(glbUrl);
  const { scene } = useGLTF(glbUrl);
  const shellRef = useArtifactShell();
  const fitAgainRef = useRef<(() => void) | null>(null);
  const appearanceReadyRef = useRef(false);
  const { camera, size, invalidate } = useThree();
  const tune = getArtifactTune("book");

  const root = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((material) => material.clone())
        : mesh.material.clone();
    });
    return clone;
  }, [scene]);

  useEffect(() => {
    const shell = shellRef?.current;
    if (!shell) return;
    shell.dataset.artifactReady = "false";
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) invalidate();
      },
      { threshold: 0.08, rootMargin: "80px 0px" },
    );
    observer.observe(shell);
    return () => observer.disconnect();
  }, [shellRef, invalidate]);

  useEffect(() => {
    const appearance = attachAppearance(root);
    let active = true;
    appearance.setColor("cover", BOOK_FINISH);
    appearance.setBookTitle({ title: "Keith Knotsworth", author: "" });

    void appearance
      .setImage("Book_Cover_Image", coverUrl)
      .catch(() => undefined)
      .finally(() => {
        if (!active) return;
        appearanceReadyRef.current = true;
        fitAgainRef.current?.();
        requestAnimationFrame(() => invalidate());
      });

    return () => {
      active = false;
      appearanceReadyRef.current = false;
      appearance.dispose();
    };
  }, [coverUrl, invalidate, root]);

  const onFitted = useCallback(
    (info: {
      meshBox: THREE.Box3;
      viewW: number;
      viewH: number;
    }) => {
      const shell = shellRef?.current;
      if (!shell || !(camera instanceof THREE.PerspectiveCamera)) return;

      const frameBox = frameFitBox(info.meshBox, "book");
      const frameScreen = projectBoxToScreenPx(
        camera,
        frameBox,
        info.viewW,
        info.viewH,
      );
      const meshScreen = projectBoxToScreenPx(
        camera,
        info.meshBox,
        info.viewW,
        info.viewH,
      );

      if (meshScreen) {
        const meshHeight = meshScreen.maxY - meshScreen.minY;
        const bandHeight = bandHeightPx(window.innerWidth);
        shell.dataset.meshHeightPx = String(
          Math.round(meshHeight * 10) / 10,
        );
        shell.dataset.meshBandPct = String(
          Math.round((meshHeight / bandHeight) * 1000) / 10,
        );
      }
      if (frameScreen) {
        shell.dataset.clearTopPx = String(
          Math.round(frameScreen.minY * 10) / 10,
        );
        shell.dataset.clearBottomPx = String(
          Math.round((info.viewH - frameScreen.maxY) * 10) / 10,
        );
        shell.dataset.clearLeftPx = String(
          Math.round(frameScreen.minX * 10) / 10,
        );
        shell.dataset.clearRightPx = String(
          Math.round((info.viewW - frameScreen.maxX) * 10) / 10,
        );
      }
      shell.dataset.targetMeshPx = String(
        Math.round(targetMeshHeightPx("book", window.innerWidth) * 10) / 10,
      );
      if (appearanceReadyRef.current) markShellReady(shell);
      requestAnimationFrame(() => invalidate());
    },
    [camera, invalidate, shellRef, size.height, size.width],
  );

  return (
    <>
      <HeroCameraFit
        kind="book"
        modelRoot={root}
        viewDirection={tune.viewDirection}
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
