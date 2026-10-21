import type { HeroAccent } from "../hero-types";

export function HeroSceneLights({ accent }: { accent: HeroAccent }) {
  if (accent === "educator") {
    return (
      <>
        <ambientLight intensity={0.34} color="#fff6e8" />
        <hemisphereLight
          intensity={0.62}
          color="#fff9f0"
          groundColor="#3d4660"
        />
        <directionalLight
          position={[4, 6, 5]}
          intensity={1.45}
          color="#fff8ee"
        />
        <directionalLight
          position={[-3.5, 2.5, 4]}
          intensity={0.42}
          color="#c8d8f0"
        />
        <pointLight position={[1.5, 1.2, 2.5]} intensity={0.35} color="#fff4dc" />
      </>
    );
  }

  return (
    <>
      <ambientLight intensity={0.58} />
      <directionalLight position={[4, 6, 5]} intensity={1.25} />
      <directionalLight position={[-5, 3, 2]} intensity={0.48} color="#fff5e8" />
      <pointLight position={[0, 2, 3]} intensity={0.3} color="#dfeaff" />
    </>
  );
}
