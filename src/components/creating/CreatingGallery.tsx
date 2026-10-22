import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import gsap from "gsap";
import type {
  CreatingCategoryFilter,
  CreatingEntry,
  CreatingView,
} from "~lib/creating/types";
import {
  categoriesPresent,
  filteredEntries,
} from "~lib/creating/entries";
import {
  captureFlipState,
  runFlipFrom,
  staggerCardsIn,
  withViewTransition,
} from "~lib/creating/creating-motion";
import { registerCreatingEasings } from "~lib/creating/easings";
import { useCreatingStore } from "./creating-store";
import { CreatingDetailPanel } from "./CreatingDetailPanel";
import { CreatingOverlays } from "./CreatingOverlays";
import { CreatingGalleryGrid } from "./CreatingGalleryGrid";
import { CreatingListicleView } from "./CreatingListicleView";
import { CreatingTimelineView } from "./CreatingTimelineView";

registerCreatingEasings();

type Props = {
  entries: CreatingEntry[];
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const fn = () => setReduced(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return reduced;
}

function readPieceFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const piece = params.get("piece");
  return piece && piece.length > 0 ? piece : null;
}

function getScrollRoot(): HTMLElement | null {
  const el = document.querySelector(".creating-flip-root");
  return el instanceof HTMLElement ? el : null;
}

export default function CreatingGallery({ entries }: Props) {
  const reducedMotion = useReducedMotion();
  const view = useCreatingStore((s) => s.view);
  const filter = useCreatingStore((s) => s.filter);
  const hoveredId = useCreatingStore((s) => s.hoveredId);
  const setView = useCreatingStore((s) => s.setView);
  const setFilter = useCreatingStore((s) => s.setFilter);
  const setHoveredId = useCreatingStore((s) => s.setHoveredId);

  const [activeId, setActiveId] = useState<string | null>(() =>
    readPieceFromUrl(),
  );
  const [transitionEntryId, setTransitionEntryId] = useState<string | null>(
    null,
  );
  const flipRootRef = useRef<HTMLDivElement>(null);
  const scrollSaveRef = useRef(0);
  const detailOpenerRef = useRef<HTMLElement | null>(null);
  const pendingFlipRef = useRef<ReturnType<typeof captureFlipState>>(null);
  const didIntroRef = useRef(false);
  const historyPushedRef = useRef(false);
  const closingViaBackRef = useRef(false);

  const categories = useMemo(() => categoriesPresent(entries), [entries]);
  const visibleEntries = useMemo(
    () => filteredEntries(entries, filter),
    [entries, filter],
  );

  const activeEntry = useMemo(
    () => entries.find((e) => e.id === activeId) ?? null,
    [entries, activeId],
  );

  const hoveredTitle = useMemo(() => {
    if (!hoveredId) return null;
    return entries.find((e) => e.id === hoveredId)?.title ?? null;
  }, [entries, hoveredId]);

  const runFlipAfterUpdate = useCallback(() => {
    const state = pendingFlipRef.current;
    pendingFlipRef.current = null;
    if (!state) return;
    runFlipFrom(state, reducedMotion);
  }, [reducedMotion]);

  const transitionUi = useCallback(
    (next: { view?: CreatingView; filter?: CreatingCategoryFilter }) => {
      const root = flipRootRef.current;
      if (!reducedMotion && root) {
        pendingFlipRef.current = captureFlipState(root);
      }
      if (next.view != null) setView(next.view);
      if (next.filter != null) setFilter(next.filter);
    },
    [reducedMotion, setFilter, setView],
  );

  useLayoutEffect(() => {
    runFlipAfterUpdate();
  }, [view, filter, visibleEntries, runFlipAfterUpdate]);

  useEffect(() => {
    if (didIntroRef.current || reducedMotion) return;
    didIntroRef.current = true;
    const t = window.setTimeout(() => {
      staggerCardsIn(flipRootRef.current, false);
    }, 80);
    return () => window.clearTimeout(t);
  }, [reducedMotion]);

  const restoreScroll = useCallback(() => {
    const root = getScrollRoot();
    const y = scrollSaveRef.current;
    if (!root) return;
    root.scrollTop = y;
    requestAnimationFrame(() => {
      root.scrollTop = y;
    });
  }, []);

  const openEntry = useCallback(
    async (id: string, el: HTMLElement) => {
      const scrollRoot = getScrollRoot();
      if (scrollRoot) scrollSaveRef.current = scrollRoot.scrollTop;
      detailOpenerRef.current = el;
      setTransitionEntryId(id);
      await withViewTransition(reducedMotion, () => {
        setActiveId(id);
        const url = new URL(window.location.href);
        url.searchParams.set("piece", id);
        if (!historyPushedRef.current) {
          history.pushState({ creatingPiece: id }, "", url);
          historyPushedRef.current = true;
        } else {
          history.replaceState({ creatingPiece: id }, "", url);
        }
      });
    },
    [reducedMotion],
  );

  const closeEntry = useCallback(async () => {
    const useBack = historyPushedRef.current && !closingViaBackRef.current;
    closingViaBackRef.current = false;
    setTransitionEntryId(activeId);
    await withViewTransition(reducedMotion, () => {
      setActiveId(null);
      if (useBack) {
        history.back();
        historyPushedRef.current = false;
      } else {
        const url = new URL(window.location.href);
        url.searchParams.delete("piece");
        history.replaceState({}, "", url.pathname + url.search);
        historyPushedRef.current = false;
      }
    });
    setTransitionEntryId(null);
    restoreScroll();
    requestAnimationFrame(() => {
      detailOpenerRef.current?.focus();
    });
  }, [activeId, reducedMotion, restoreScroll]);

  useEffect(() => {
    const onPop = () => {
      const piece = readPieceFromUrl();
      closingViaBackRef.current = true;
      setActiveId(piece);
      if (!piece) {
        historyPushedRef.current = false;
        setTransitionEntryId(null);
        restoreScroll();
        requestAnimationFrame(() => {
          detailOpenerRef.current?.focus();
        });
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [restoreScroll]);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return;
    type VerifyWindow = Window & {
      __creatingVerify?: () => Record<string, unknown>;
    };
    const win = window as VerifyWindow;
    win.__creatingVerify = () => ({
      entryCount: entries.length,
      filteredCount: visibleEntries.length,
      view,
      filter,
      hoveredId,
      activeId,
      visibleIds: visibleEntries.map((e) => e.id),
      domOnly: true,
      hasCanvas: Boolean(document.querySelector(".creating-canvas-wrap canvas")),
    });
    return () => {
      delete win.__creatingVerify;
    };
  }, [entries.length, visibleEntries, view, filter, hoveredId, activeId]);

  const detailOpen = Boolean(activeEntry);

  return (
    <div
      className="creating-page"
      data-phase={detailOpen ? "detail" : "gallery"}
      data-reduced-motion={reducedMotion ? "true" : undefined}
    >
      <CreatingOverlays
        views={["gallery", "listicle", "timeline"]}
        activeView={view}
        onViewChange={(v) => transitionUi({ view: v })}
        categories={categories}
        filter={filter}
        onFilterChange={(f) => transitionUi({ filter: f })}
        showTutorial={!detailOpen}
        hoveredTitle={hoveredTitle}
        reducedMotion={reducedMotion}
        detailOpen={detailOpen}
      />

      <div
        className="creating-surface"
        inert={detailOpen ? true : undefined}
        aria-hidden={detailOpen ? true : undefined}
      >
        <div ref={flipRootRef} className="creating-flip-root">
          {view === "gallery" && (
            <CreatingGalleryGrid
              entries={visibleEntries}
              reducedMotion={reducedMotion}
              transitionEntryId={transitionEntryId}
              onOpen={openEntry}
              onHover={setHoveredId}
            />
          )}
          {view === "listicle" && (
            <CreatingListicleView
              entries={visibleEntries}
              reducedMotion={reducedMotion}
              transitionEntryId={transitionEntryId}
              onOpen={openEntry}
              onHover={setHoveredId}
            />
          )}
          {view === "timeline" && (
            <CreatingTimelineView
              entries={visibleEntries}
              reducedMotion={reducedMotion}
              transitionEntryId={transitionEntryId}
              onOpen={openEntry}
              onHover={setHoveredId}
            />
          )}
        </div>
      </div>

      {activeEntry && (
        <CreatingDetailPanel
          entry={activeEntry}
          onClose={closeEntry}
          returnFocusRef={detailOpenerRef}
          reducedMotion={reducedMotion}
        />
      )}
    </div>
  );
}
