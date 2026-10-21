import { createContext, useContext, type RefObject } from "react";

export const ArtifactShellContext =
  createContext<RefObject<HTMLDivElement | null> | null>(null);

export function useArtifactShell() {
  return useContext(ArtifactShellContext);
}
