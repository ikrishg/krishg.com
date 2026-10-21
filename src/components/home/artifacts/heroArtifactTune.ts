import type { KrishModelKind } from "./artifact-types";

export type ArtifactTune = {
  groupPosition: [number, number, number];
  groupRotation: [number, number, number];
  viewDirection?: [number, number, number];
};

/** Static model orientation — scale comes from mesh-target camera fit. */
export function getArtifactTune(kind: KrishModelKind): ArtifactTune {
  if (kind === "computer") {
    return {
      groupPosition: [0, -0.02, 0],
      groupRotation: [0.06, -0.26, 0],
      viewDirection: [0, 0.14, 1],
    };
  }
  if (kind === "frame") {
    return {
      groupPosition: [0, 0, 0],
      groupRotation: [-0.02, 0.38, 0],
      viewDirection: [0, 0.05, 1],
    };
  }
  if (kind === "book") {
    return {
      groupPosition: [0, -0.02, 0],
      groupRotation: [0.04, -0.3, 0],
      viewDirection: [0, 0.08, 1],
    };
  }
  return {
    groupPosition: [0, 0, 0],
    groupRotation: [0, -0.12, 0],
  };
}

