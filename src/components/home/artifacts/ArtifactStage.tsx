import { Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { HeroAccent } from "../hero-types";
import { HeroSceneLights } from "./HeroSceneLights";
import { ArtifactShellContext } from "./ArtifactShellContext";

type Props = {
  accent: HeroAccent;
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  cameraFov?: number;
};

function RegisterInvalidate({
  invalidateRef,
  inViewRef,
}: {
  invalidateRef: React.MutableRefObject<(() => void) | null>;
  inViewRef: React.MutableRefObject<boolean>;
}) {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    invalidateRef.current = () => {
      if (inViewRef.current) invalidate();
    };
    if (inViewRef.current) invalidate();
    return () => {
      invalidateRef.current = null;
    };
  }, [invalidate, invalidateRef, inViewRef]);

  return null;
}

export function ArtifactStage({
  accent,
  ariaLabel,
  children,
  className,
  cameraFov = 34,
}: Props) {
  const stageClassName = [
    "artifact-stage relative flex h-full w-full max-w-full flex-1 touch-pan-y overflow-hidden bg-transparent opacity-0 outline-none transition-opacity duration-[280ms] ease-[var(--ease-out)] focus:outline-none focus-visible:outline-none data-[artifact-ready=true]:opacity-100 motion-reduce:duration-0 motion-reduce:transition-none motion-reduce:data-[artifact-ready=true]:opacity-100",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const shellRef = useRef<HTMLDivElement>(null);
  const invalidateRef = useRef<(() => void) | null>(null);
  const inViewRef = useRef(true);

  const devicePixelRatio = useMemo(() => {
    if (typeof window === "undefined") return 1;
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    const cap = mobile ? 1.5 : 1.75;
    return Math.min(window.devicePixelRatio || 1, cap);
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        inViewRef.current = entry.isIntersecting;
        if (entry.isIntersecting) invalidateRef.current?.();
      },
      { root: null, threshold: 0.08, rootMargin: "80px 0px" },
    );
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={shellRef}
      className={stageClassName}
      data-accent={accent}
      data-artifact-ready="false"
      role="group"
      aria-roledescription="interactive 3D object"
      aria-label={ariaLabel}
    >
      <ArtifactShellContext.Provider value={shellRef}>
        <div
          className="artifact-stage__canvas relative z-[1] h-full min-h-48 w-full flex-1 touch-pan-y outline-none md:min-h-[var(--artifact-canvas-height,32rem)] md:h-[var(--artifact-canvas-height,32rem)]"
        >
          <Canvas
            frameloop="demand"
            camera={{
              position: [0, 0.2, 6],
              fov: cameraFov,
              near: 0.05,
              far: 200,
            }}
            dpr={devicePixelRatio}
            gl={{
              antialias: true,
              alpha: true,
              powerPreference: "high-performance",
            }}
            onCreated={({ gl, invalidate: requestRender }) => {
              gl.setClearColor(0x000000, 0);
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 1.3;
              gl.outputColorSpace = THREE.SRGBColorSpace;
              gl.domElement.style.touchAction = "pan-y";
              const canvas = gl.domElement;
              canvas.addEventListener("webglcontextlost", (event) => {
                event.preventDefault();
              });
              canvas.addEventListener("webglcontextrestored", () => {
                requestRender();
              });
            }}
            className="block h-full w-full touch-pan-y outline-none [[data-cursor-hint=pointer]_&]:cursor-pointer"
            style={{
              width: "100%",
              height: "100%",
              display: "block",
              outline: "none",
            }}
          >
            <RegisterInvalidate invalidateRef={invalidateRef} inViewRef={inViewRef} />
            <HeroSceneLights accent={accent} />
            <Suspense fallback={null}>{children}</Suspense>
          </Canvas>
        </div>
      </ArtifactShellContext.Provider>
    </div>
  );
}
