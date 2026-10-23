import { ArtifactStage } from "./ArtifactStage";
import { KrishInteractiveScene } from "./KrishInteractiveScene";
import { homeGlbPaths, homeTexturePaths } from "../hero-types";

export default function BuilderArtifact() {
  return (
    <ArtifactStage
      accent="builder"
      ariaLabel="3D retro computer, its screen showing a photo of Krish at work"
      className="flex h-80 min-h-80 w-full max-w-full flex-1 flex-col items-center justify-center md:h-full md:min-h-[var(--home-band-height)]"
      cameraFov={30}
    >
      <KrishInteractiveScene
        kind="computer"
        glbUrl={homeGlbPaths.builder}
        portraitUrl={homeTexturePaths.builder}
      />
    </ArtifactStage>
  );
}
