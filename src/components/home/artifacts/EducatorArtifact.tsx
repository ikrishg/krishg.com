import { ArtifactStage } from "./ArtifactStage";
import { EducatorBookScene } from "./EducatorBookScene";
import { homeGlbPaths, homeTexturePaths } from "../hero-types";

export default function EducatorArtifact() {
  return (
    <ArtifactStage
      accent="educator"
      ariaLabel="3D hardcover book"
      className="flex h-80 min-h-80 w-full max-w-full flex-1 flex-col items-center justify-center md:h-full md:min-h-[var(--home-band-height)]"
      cameraFov={30}
    >
      <EducatorBookScene
        glbUrl={homeGlbPaths.educator}
        coverUrl={homeTexturePaths.educator}
      />
    </ArtifactStage>
  );
}
