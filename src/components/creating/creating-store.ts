import { create } from "zustand";
import type { CreatingCategoryFilter, CreatingView } from "~lib/creating/types";

type CreatingUiState = {
  view: CreatingView;
  filter: CreatingCategoryFilter;
  hoveredId: string | null;
  setView: (view: CreatingView) => void;
  setFilter: (filter: CreatingCategoryFilter) => void;
  setHoveredId: (id: string | null) => void;
};

export const useCreatingStore = create<CreatingUiState>((set) => ({
  view: "gallery",
  filter: "all",
  hoveredId: null,
  setView: (view) => set({ view }),
  setFilter: (filter) => set({ filter }),
  setHoveredId: (hoveredId) => set({ hoveredId }),
}));
