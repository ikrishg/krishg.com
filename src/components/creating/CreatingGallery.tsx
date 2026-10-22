import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    setCoarse(mq.matches);
    const fn = () => setCoarse(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return coarse;
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

function focusEntryOpener(entryId: string | null, opener: HTMLElement | null) {
  const target =
    opener && document.contains(opener)
      ? opener
      : entryId
        ? document.querySelector(
            `[data-entry-id="${entryId}"] .creating-card__open`,
          )
        : null;
  if (!(target instanceof HTMLElement)) return;
  target.focus({ preventScroll: true });
  const scrollRoot = getScrollRoot();
  const rootRect = scrollRoot?.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const rootMid =
    rootRect != null
      ? rootRect.top + rootRect.height / 2
      : window.innerHeight / 2;
  const targetMid = targetRect.top + targetRect.height / 2;
  const distance = Math.abs(targetMid - rootMid);
  const behavior = distance > 220 ? "instant" : "smooth";
  target.scrollIntoView({ block: "center", inline: "nearest", behavior });
  if (scrollRoot && behavior === "instant") {
    requestAnimationFrame(() => {
      scrollRoot.scrollTop = scrollRoot.scrollTop;
    });
  }
}

export default function CreatingGallery({ entries }: Props) {
  const reducedMotion = useReducedMotion();
  const coarsePointer = useCoarsePointer();
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
  const lastFocusedEntryRef = useRef<string | null>(null);
  const pendingFlipRef = useRef<ReturnType<typeof captureFlipState>>(null);
  const didIntroRef = useRef(false);
  const historyPushedRef = useRef(false);
  const skipPopFromCloseRef = useRef(false);
  const [retainedLeavingIds, setRetainedLeavingIds] = useState<string[]>([]);

  const categories = useMemo(() => categoriesPresent(entries), [entries]);
  const visibleEntries = useMemo(
    () => filteredEntries(entries, filter),
    [entries, filter],
  );

  const activeVisibleIds = useMemo(
    () => new Set(visibleEntries.map((e) => e.id)),
    [visibleEntries],
  );

  const layoutEntries = useMemo(() => {
    const ids = new Set(activeVisibleIds);
    for (const id of retainedLeavingIds) ids.add(id);
    return entries.filter((e) => ids.has(e.id));
  }, [entries, activeVisibleIds, retainedLeavingIds]);

  const activeEntry = useMemo(
    () => entries.find((e) => e.id === activeId) ?? null,
    [entries, activeId],
  );

  useEffect(() => {
    if (activeId) lastFocusedEntryRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    const piece = readPieceFromUrl();
    if (!piece || typeof window === "undefined") return;
    if (window.history.state?.creatingPiece) return;
    const url = new URL(window.location.href);
    history.replaceState({ creatingPiece: piece }, "", url);
  }, []);

  const hoveredTitle = useMemo(() => {
    if (!hoveredId) return null;
    return entries.find((e) => e.id === hoveredId)?.title ?? null;
  }, [entries, hoveredId]);

  const runFlipAfterUpdate = useCallback(() => {
    const state = pendingFlipRef.current;
    pendingFlipRef.current = null;
    if (!state) return;
    runFlipFrom(state, flipRootRef.current, reducedMotion, {
      onComplete: () => setRetainedLeavingIds([]),
    });
  }, [reducedMotion]);

  const transitionUi = useCallback(
    (next: { view?: CreatingView; filter?: CreatingCategoryFilter }) => {
      const root = flipRootRef.current;
      if (next.filter != null && next.filter !== filter) {
        const nextVisible = filteredEntries(entries, next.filter);
        const nextIds = new Set(nextVisible.map((e) => e.id));
        const leaving = visibleEntries
          .filter((e) => !nextIds.has(e.id))
          .map((e) => e.id);
        if (leaving.length > 0) setRetainedLeavingIds(leaving);
      }
      if (!reducedMotion && root) {
        pendingFlipRef.current = captureFlipState(root);
      }
      if (next.view != null) setView(next.view);
      if (next.filter != null) setFilter(next.filter);
    },
    [entries, filter, reducedMotion, setFilter, setView, visibleEntries],
  );

  useLayoutEffect(() => {
    runFlipAfterUpdate();
  }, [view, filter, layoutEntries, runFlipAfterUpdate]);

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
      lastFocusedEntryRef.current = id;
      setTransitionEntryId(id);
      await withViewTransition(reducedMotion, () => {
        setActiveId(id);
        const url = new URL(window.location.href);
        url.searchParams.set("piece", id);
        if (!historyPushedRef.current) {
          history.pushState(
            { creatingPiece: id, creatingPushed: true },
            "",
            url,
          );
          historyPushedRef.current = true;
        } else {
          history.replaceState({ creatingPiece: id, creatingPushed: true }, "", url);
        }
      });
    },
    [reducedMotion],
  );

  const closeEntry = useCallback(async () => {
    const closingId = activeId;
    const pushedDetail = historyPushedRef.current;
    setTransitionEntryId(activeId);
    await withViewTransition(reducedMotion, () => {
      setActiveId(null);
      const url = new URL(window.location.href);
      url.searchParams.delete("piece");
      if (
        (pushedDetail || window.history.state?.creatingPushed) &&
        window.history.state?.creatingPiece
      ) {
        skipPopFromCloseRef.current = true;
        history.back();
      } else {
        history.replaceState({}, "", url.pathname + url.search);
      }
      historyPushedRef.current = false;
    });
    setTransitionEntryId(null);
    restoreScroll();
    requestAnimationFrame(() => {
      focusEntryOpener(closingId, detailOpenerRef.current);
    });
  }, [activeId, reducedMotion, restoreScroll]);

  useEffect(() => {
    const onPop = () => {
      const fromOurClose = skipPopFromCloseRef.current;
      skipPopFromCloseRef.current = false;
      historyPushedRef.current = Boolean(window.history.state?.creatingPushed);
      const piece = readPieceFromUrl();
      setActiveId(piece);
      if (!piece) {
        historyPushedRef.current = false;
        setTransitionEntryId(null);
        restoreScroll();
        if (!fromOurClose) {
          requestAnimationFrame(() => {
            focusEntryOpener(
              lastFocusedEntryRef.current,
              detailOpenerRef.current,
            );
          });
        }
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
  const tutorialText = coarsePointer
    ? "Tap any piece to open its detail view."
    : "Click any piece to open its detail view.";

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
        hoveredTitle={hoveredTitle}
        reducedMotion={reducedMotion}
        detailOpen={detailOpen}
      />

      <div
        className="creating-surface"
        inert={detailOpen ? true : undefined}
        aria-hidden={detailOpen ? true : undefined}
      >
        <p
          className="creating-tutorial"
          role="status"
          aria-hidden={detailOpen ? true : undefined}
          style={detailOpen ? { visibility: "hidden" } : undefined}
        >
          {tutorialText}
        </p>
        <div ref={flipRootRef} className="creating-flip-root">
          {view === "gallery" && (
            <CreatingGalleryGrid
              entries={layoutEntries}
              activeEntryIds={activeVisibleIds}
              reducedMotion={reducedMotion}
              transitionEntryId={transitionEntryId}
              onOpen={openEntry}
              onHover={setHoveredId}
            />
          )}
          {view === "listicle" && (
            <CreatingListicleView
              entries={layoutEntries}
              activeEntryIds={activeVisibleIds}
              reducedMotion={reducedMotion}
              transitionEntryId={transitionEntryId}
              onOpen={openEntry}
              onHover={setHoveredId}
            />
          )}
          {view === "timeline" && (
            <CreatingTimelineView
              entries={layoutEntries}
              activeEntryIds={activeVisibleIds}
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
          focusEntryId={lastFocusedEntryRef.current}
          reducedMotion={reducedMotion}
        />
      )}
    </div>
  );
}
