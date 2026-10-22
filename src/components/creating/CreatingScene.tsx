import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import { damp, MOTION_EPS } from "~lib/creating/damp";
import type { CreatingEntry, CreatingView } from "~lib/creating/types";
import { CREATING_CANVAS, VIEW_TINT } from "~lib/creating/types";
import { CreatingTiles } from "./CreatingTiles";
import { LoaderFrameScene } from "./LoaderFrameScene";
import { TimelineYearTiles } from "./TimelineYearTiles";
import { RegisterGalleryCamera } from "./RegisterGalleryCamera";
import { useCreatingStore } from "./creating-store";

type SceneProps = {
  visibleEntries: CreatingEntry[];
  view: CreatingView;
  globeFormation: number;
  openProgress: number;
  openId: number;
  reducedMotion: boolean;
  showLoader: boolean;
  morphLabel: string | null;
};

function CameraRig({
  reducedMotion,
  detailOpen,
  renderActive,
}: {
  reducedMotion: boolean;
  detailOpen: boolean;
  renderActive: boolean;
}) {
  const { camera, invalidate } = useThree();
  const pointer = useRef({ x: 0, y: 0 });
  const tilt = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
      invalidate();
    };
    window.addEventListener("pointermove", onPointer);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [invalidate]);

  useFrame((_, dt) => {
    if (!renderActive) return;
    const cam = camera as THREE.PerspectiveCamera;
    const targetZ = detailOpen ? 3.5 : 0.01;
    const tiltOn = !reducedMotion;
    const targetRy = tiltOn ? pointer.current.x * 0.04 : 0;
    const targetRx = tiltOn ? pointer.current.y * 0.04 : 0;

    cam.position.z = damp(cam.position.z, targetZ, detailOpen ? 2.2 : 4, dt);
    cam.position.x = damp(cam.position.x, 0, 4, dt);
    cam.position.y = damp(cam.position.y, 0, 4, dt);
    tilt.current.y = damp(tilt.current.y, targetRy, tiltOn ? 3.5 : 4, dt);
    tilt.current.x = damp(tilt.current.x, targetRx, tiltOn ? 3.5 : 4, dt);
    cam.lookAt(0, 0, 0);
    if (tiltOn) {
      cam.rotateY(tilt.current.y);
      cam.rotateX(tilt.current.x);
    }

    const animating =
      Math.abs(cam.position.z - targetZ) > MOTION_EPS ||
      Math.abs(cam.position.x) > MOTION_EPS ||
      Math.abs(cam.position.y) > MOTION_EPS ||
      Math.abs(tilt.current.y - targetRy) > MOTION_EPS ||
      Math.abs(tilt.current.x - targetRx) > MOTION_EPS;

    if (animating) invalidate();
  });

  return null;
}

function SceneInner(
  props: SceneProps & { renderActive: boolean },
) {
  const invalidate = useThree((s) => s.invalidate);
  const phase = useCreatingStore((s) => s.phase);
  const ringScrollX = useCreatingStore((s) => s.ringScrollX);

  useEffect(() => {
    if (props.renderActive) invalidate();
  }, [props.renderActive, invalidate]);

  return (
    <>
      <color attach="background" args={[CREATING_CANVAS]} />
      <ambientLight intensity={0.85} />
      <directionalLight position={[-2, 4, 3]} intensity={1.1} />
      <CameraRig
        reducedMotion={props.reducedMotion}
        detailOpen={phase === "detail"}
        renderActive={props.renderActive}
      />
      <RegisterGalleryCamera />
      {props.showLoader ? (
        <LoaderFrameScene renderActive={props.renderActive} />
      ) : (
        <>
          <CreatingTiles {...props} renderActive={props.renderActive} />
          {props.view === "timeline" && (
            <TimelineYearTiles
              entries={props.visibleEntries}
              scrollX={ringScrollX}
            />
          )}
          {props.morphLabel && props.globeFormation > 0.2 && (
            <Text
              position={[0, 0, 0]}
              fontSize={1.2}
              color={VIEW_TINT[props.view]}
              anchorX="center"
              anchorY="middle"
              font="/fonts/newsreader-latin.woff"
            >
              {props.morphLabel}
            </Text>
          )}
        </>
      )}
    </>
  );
}

export function CreatingScene({
  reducedMotion,
  ...rest
}: SceneProps & { reducedMotion: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const topInsetPx = () => {
      const nav = document.querySelector(".home-navbar");
      const h = nav?.getBoundingClientRect().height ?? 0;
      return Math.max(64, Math.round(h));
    };

    let observer: IntersectionObserver;
    const connect = () => {
      observer?.disconnect();
      observer = new IntersectionObserver(
        ([entry]) => {
          setInView(entry.isIntersecting);
        },
        {
          root: null,
          threshold: 0,
          rootMargin: `-${topInsetPx()}px 0px 0px 0px`,
        },
      );
      observer.observe(host);
    };
    connect();

    window.addEventListener("resize", connect);
    return () => {
      window.removeEventListener("resize", connect);
      observer?.disconnect();
    };
  }, []);

  const frameloop = inView ? "demand" : "never";

  return (
    <div
      ref={hostRef}
      className="creating-canvas-host h-full w-full"
      data-frameloop={frameloop}
    >
      <Canvas
        className="creating-canvas"
        dpr={[1, 1.75]}
        gl={{
          antialias: false,
          powerPreference: "high-performance",
          preserveDrawingBuffer: true,
        }}
        frameloop={frameloop}
        camera={{ fov: 45, near: 0.1, far: 100, position: [0, 0, 0.15] }}
        style={{ touchAction: "none" }}
      >
        <SceneInner reducedMotion={reducedMotion} {...rest} renderActive={inView} />
      </Canvas>
    </div>
  );
}
