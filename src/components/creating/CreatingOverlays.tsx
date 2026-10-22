import type { CSSProperties } from "react";
import type { CreatingCategory, CreatingCategoryFilter, CreatingView } from "~lib/creating/types";
import {
  CATEGORY_ACCENT,
  CATEGORY_LABELS,
  VIEW_LABELS,
  VIEW_TINT,
} from "~lib/creating/types";

type Props = {
  views: CreatingView[];
  activeView: CreatingView;
  onViewChange: (view: CreatingView) => void;
  categories: CreatingCategory[];
  filter: CreatingCategoryFilter;
  onFilterChange: (filter: CreatingCategoryFilter) => void;
  showTutorial: boolean;
  hoveredTitle: string | null;
  pointerFine: boolean;
};

export function CreatingOverlays({
  views,
  activeView,
  onViewChange,
  categories,
  filter,
  onFilterChange,
  showTutorial,
  hoveredTitle,
  pointerFine,
}: Props) {
  return (
    <>
      <header className="creating-header" aria-label="Gallery controls">
        <div className="creating-header__views">
          {views.map((view) => (
            <button
              key={view}
              type="button"
              className="creating-view-btn"
              data-no-drag=""
              data-active={view === activeView ? "true" : undefined}
              style={
                {
                  "--btn-accent": VIEW_TINT[view],
                } as CSSProperties
              }
              onClick={() => onViewChange(view)}
            >
              <span className="creating-view-btn__fill" aria-hidden="true" />
              <span className="creating-view-btn__label">{VIEW_LABELS[view]}</span>
            </button>
          ))}
        </div>
        <p className="creating-header__hint">Scroll to explore</p>
        <div className="creating-header__filters">
          <button
            type="button"
            className="creating-filter-btn"
            data-no-drag=""
            data-active={filter === "all" ? "true" : undefined}
            data-filter="all"
            onClick={() => onFilterChange("all")}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className="creating-filter-btn"
              data-no-drag=""
              data-active={filter === cat ? "true" : undefined}
              style={
                {
                  "--filter-accent": CATEGORY_ACCENT[cat],
                } as CSSProperties
              }
              onClick={() => onFilterChange(cat)}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </header>

      <footer className="creating-footer">
        {showTutorial && (
          <p className="creating-footer__tutorial">
            Click any piece to open its detail view.
          </p>
        )}
      </footer>

      {pointerFine && hoveredTitle && (
        <div className="creating-cursor-label">Explore</div>
      )}
    </>
  );
}
