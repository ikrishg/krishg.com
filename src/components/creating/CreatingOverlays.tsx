import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import gsap from "gsap";
import type {
  CreatingCategory,
  CreatingCategoryFilter,
  CreatingView,
} from "~lib/creating/types";
import {
  CATEGORY_ACCENT,
  CATEGORY_LABELS,
  VIEW_LABELS,
  VIEW_TINT,
} from "~lib/creating/types";
import { useMagnetic } from "./useMagnetic";

type Props = {
  views: CreatingView[];
  activeView: CreatingView;
  onViewChange: (view: CreatingView) => void;
  categories: CreatingCategory[];
  filter: CreatingCategoryFilter;
  onFilterChange: (filter: CreatingCategoryFilter) => void;
  hoveredTitle: string | null;
  reducedMotion: boolean;
  detailOpen: boolean;
};

function MagneticFilterButton({
  children,
  active,
  filterId,
  onClick,
  style,
  reducedMotion,
}: {
  children: ReactNode;
  active?: boolean;
  filterId?: CreatingCategoryFilter;
  onClick: () => void;
  style?: CSSProperties;
  reducedMotion: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useMagnetic(ref, !reducedMotion);
  return (
    <button
      ref={ref}
      type="button"
      className="creating-filter-btn"
      data-filter={filterId}
      data-active={active ? "true" : undefined}
      aria-pressed={active ? true : false}
      style={style}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function CreatingOverlays({
  views,
  activeView,
  onViewChange,
  categories,
  filter,
  onFilterChange,
  hoveredTitle,
  reducedMotion,
  detailOpen,
}: Props) {
  const cursorRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const setHeight = () => {
      document.documentElement.style.setProperty(
        "--creating-header-height",
        `${header.offsetHeight}px`,
      );
    };
    setHeight();
    const ro = new ResizeObserver(setHeight);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion || detailOpen) return;
    const label = cursorRef.current;
    if (!label) return;

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") {
        label.style.opacity = "0";
        return;
      }
      const overCard = (e.target as Element | null)?.closest(".creating-card");
      if (!overCard) {
        gsap.to(label, { opacity: 0, duration: 0.2 });
        return;
      }
      gsap.to(label, {
        x: e.clientX,
        y: e.clientY,
        opacity: 1,
        duration: 0.35,
        ease: "power3.out",
      });
      label.textContent = hoveredTitle ? `Open — ${hoveredTitle}` : "Explore";
    };

    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [hoveredTitle, reducedMotion, detailOpen]);

  useEffect(() => {
    const label = cursorRef.current;
    if (!label) return;
    if (detailOpen) label.style.opacity = "0";
  }, [detailOpen]);

  return (
    <>
      <header
        ref={headerRef}
        className="creating-header"
        aria-label="Gallery controls"
      >
        <div className="creating-header__views">
          {views.map((view) => (
            <button
              key={view}
              type="button"
              className="creating-view-btn"
              data-active={view === activeView ? "true" : undefined}
              aria-pressed={view === activeView}
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
          <MagneticFilterButton
            active={filter === "all"}
            filterId="all"
            reducedMotion={reducedMotion}
            onClick={() => onFilterChange("all")}
          >
            All
          </MagneticFilterButton>
          {categories.map((cat) => (
            <MagneticFilterButton
              key={cat}
              active={filter === cat}
              filterId={cat}
              reducedMotion={reducedMotion}
              style={
                {
                  "--filter-accent": CATEGORY_ACCENT[cat],
                } as CSSProperties
              }
              onClick={() => onFilterChange(cat)}
            >
              {CATEGORY_LABELS[cat]}
            </MagneticFilterButton>
          ))}
        </div>
      </header>

      {!reducedMotion && !detailOpen && (
        <div
          ref={cursorRef}
          className="creating-cursor-label"
          aria-hidden="true"
          style={{ opacity: 0 }}
        />
      )}
    </>
  );
}
