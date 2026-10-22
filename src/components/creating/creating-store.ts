import { create } from "zustand";
import type * as THREE from "three";
import type {
  CreatingCategoryFilter,
  CreatingEntry,
  CreatingView,
} from "~lib/creating/types";

export type CreatingPhase = "loader" | "gallery" | "detail";

type CreatingState = {
  phase: CreatingPhase;
  view: CreatingView;
  filter: CreatingCategoryFilter;
  activeId: string | null;
  morphProgress: number;
  morphLabel: string | null;
  hoveredId: string | null;
  listicleScrollY: number;
  ringScrollX: number;
  loaderProgress: number;
  loaderReady: boolean;
  atlasReady: boolean;
  entries: CreatingEntry[];
  tileMesh: THREE.InstancedMesh | null;
  galleryCamera: THREE.Camera | null;
  setEntries: (entries: CreatingEntry[]) => void;
  setTileMesh: (mesh: THREE.InstancedMesh | null) => void;
  setGalleryCamera: (camera: THREE.Camera | null) => void;
  setPhase: (phase: CreatingPhase) => void;
  setView: (view: CreatingView) => void;
  setFilter: (filter: CreatingCategoryFilter) => void;
  setActiveId: (id: string | null) => void;
  setMorphProgress: (v: number) => void;
  setMorphLabel: (label: string | null) => void;
  setHoveredId: (id: string | null) => void;
  setListicleScrollY: (y: number) => void;
  setRingScrollX: (x: number) => void;
  setLoaderProgress: (v: number) => void;
  setLoaderReady: (v: boolean) => void;
  setAtlasReady: (v: boolean) => void;
};

export const useCreatingStore = create<CreatingState>((set) => ({
  phase: "loader",
  view: "gallery",
  filter: "all",
  activeId: null,
  morphProgress: 0,
  morphLabel: null,
  hoveredId: null,
  listicleScrollY: 0,
  ringScrollX: 0,
  loaderProgress: 0,
  loaderReady: false,
  atlasReady: false,
  entries: [],
  tileMesh: null,
  galleryCamera: null,
  setEntries: (entries) => set({ entries }),
  setTileMesh: (tileMesh) => set({ tileMesh }),
  setGalleryCamera: (galleryCamera) => set({ galleryCamera }),
  setPhase: (phase) => set({ phase }),
  setView: (view) => set({ view }),
  setFilter: (filter) => set({ filter }),
  setActiveId: (activeId) => set({ activeId }),
  setMorphProgress: (morphProgress) => set({ morphProgress }),
  setMorphLabel: (morphLabel) => set({ morphLabel }),
  setHoveredId: (hoveredId) => set({ hoveredId }),
  setListicleScrollY: (listicleScrollY) => set({ listicleScrollY }),
  setRingScrollX: (ringScrollX) => set({ ringScrollX }),
  setLoaderProgress: (loaderProgress) => set({ loaderProgress }),
  setLoaderReady: (loaderReady) => set({ loaderReady }),
  setAtlasReady: (atlasReady) => set({ atlasReady }),
}));


export function filteredEntries(
  entries: CreatingEntry[],
  filter: CreatingCategoryFilter,
): CreatingEntry[] {
  if (filter === "all") return entries;
  return entries.filter((e) => e.category === filter);
}
