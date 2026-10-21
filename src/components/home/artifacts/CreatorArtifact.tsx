import { ArtifactStage } from "./ArtifactStage";
import { KrishInteractiveScene } from "./KrishInteractiveScene";
import { homeGlbPaths, homeTexturePaths } from "../hero-types";

export default function CreatorArtifact() {
  return (
    <ArtifactStage
      accent="creator"
      ariaLabel="Interactive 3D portrait frame with crackable glass"
      className="flex h-80 min-h-80 w-full max-w-full flex-1 flex-col items-center justify-center md:h-full md:min-h-[var(--home-band-height)]"
      cameraFov={32}
    >
      <KrishInteractiveScene
        kind="frame"
        glbUrl={homeGlbPaths.creator}
        portraitUrl={homeTexturePaths.creator}
      />
    </ArtifactStage>
  );
}
