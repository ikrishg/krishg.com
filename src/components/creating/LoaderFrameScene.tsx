import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Center, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { attachAppearance } from "~lib/krish-3d/appearance.js";

const FRAME_URL = "/home-3d/portrait-frame.glb";

export function LoaderFrameScene({
  renderActive = true,
}: {
  renderActive?: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const { scene } = useGLTF(FRAME_URL);
  const root = useMemo(() => {
    const clone = scene.clone(true);
    const appearance = attachAppearance(clone);
    appearance.setColor("frame", "#e8e3d9");
    appearance.setColor("trim", "#b8a477");
    return clone;
  }, [scene]);

  useFrame((_, dt) => {
    if (!renderActive || !group.current) return;
    group.current.rotation.y += dt * 0.35;
    group.current.rotation.x = Math.sin(performance.now() * 0.0004) * 0.12;
    invalidate();
  });

  return (
    <group ref={group} position={[0, 0, -1.2]} rotation={[0.75 * Math.PI, 0, -0.4 * Math.PI]}>
      <Center>
        <primitive object={root} scale={0.9} />
      </Center>
    </group>
  );
}
