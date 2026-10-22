import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { registerCreatingEasings } from "~lib/creating/easings";
import type {
  CreatingCategory,
  CreatingCategoryFilter,
  CreatingEntry,
  CreatingView,
} from "~lib/creating/types";
import { VIEW_LABELS } from "~lib/creating/types";
import {
  filteredEntries,
  useCreatingStore,
} from "./creating-store";
import { CreatingDetailPanel } from "./CreatingDetailPanel";
import { CreatingOverlays } from "./CreatingOverlays";
import { CreatingScene } from "./CreatingScene";
import { CreatingListicleList } from "./CreatingListicleList";
import { WorksIndexNav } from "./WorksIndexNav";
import { CreatingStaticFallback } from "./CreatingStaticFallback";
import { useMorphTransition } from "./useMorphTransition";
import {
  useVirtualScroll,
  type VirtualScrollDragState,
} from "./useVirtualScroll";
import { timelineYearMarkers } from "~lib/creating/layout";
import {
  entryAtInstance,
  pickTileInstanceId,
  pickPointForInstance,
  projectTileCenters,
} from "~lib/creating/pickTile";

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

export default function CreatingGallery({ entries }: Props) {
  const reducedMotion = useReducedMotion();
  const shellRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const detailHistoryRef = useRef(false);
  const closingDetailRef = useRef(false);
  const detailOpenerRef = useRef<HTMLElement | null>(null);
  const displayRef = useRef(0);
  const [displayPercent, setDisplayPercent] = useState(0);
  const { runMorph } = useMorphTransition();

  const phase = useCreatingStore((s) => s.phase);

  const view = useCreatingStore((s) => s.view);
  const filter = useCreatingStore((s) => s.filter);
  const morphProgress = useCreatingStore((s) => s.morphProgress);
  const morphLabel = useCreatingStore((s) => s.morphLabel);
  const hoveredId = useCreatingStore((s) => s.hoveredId);
  const loaderProgress = useCreatingStore((s) => s.loaderProgress);
  const loaderReady = useCreatingStore((s) => s.loaderReady);
  const activeId = useCreatingStore((s) => s.activeId);
  const setEntries = useCreatingStore((s) => s.setEntries);
  const setPhase = useCreatingStore((s) => s.setPhase);
  const setView = useCreatingStore((s) => s.setView);
  const setFilter = useCreatingStore((s) => s.setFilter);
  const setLoaderProgress = useCreatingStore((s) => s.setLoaderProgress);
  const setLoaderReady = useCreatingStore((s) => s.setLoaderReady);
  const storeEntries = useCreatingStore((s) => s.entries);
  const atlasReady = useCreatingStore((s) => s.atlasReady);

  const [openProgress, setOpenProgress] = useState(0);
  const openTweenRef = useRef({ v: 0 });
  const scrollDragRef = useRef<VirtualScrollDragState>({ didDrag: false });
  const [pointerFine, setPointerFine] = useState(true);
  const [webglAvailable, setWebglAvailable] = useState(true);

  useEffect(() => {
    setEntries(entries);
    setLoaderReady(false);
    setLoaderProgress(0);
    setPhase("loader");
  }, [entries, setEntries, setLoaderProgress, setLoaderReady, setPhase]);

  useEffect(() => {
    if (reducedMotion) setPhase("gallery");
  }, [reducedMotion, setPhase]);

  useEffect(() => {
    setPointerFine(window.matchMedia("(pointer: fine)").matches);
    const canvas = document.createElement("canvas");
    const attrs = { failIfMajorPerformanceCaveat: false, antialias: false };
    const gl =
      canvas.getContext("webgl2", attrs) ||
      canvas.getContext("webgl", attrs) ||
      canvas.getContext("experimental-webgl", attrs);
    setWebglAvailable(Boolean(gl));
  }, []);

  useEffect(() => {
    return useCreatingStore.subscribe((state) => {
      const el = shellRef.current;
      if (!el) return;
      el.dataset.ringScroll = state.ringScrollX.toFixed(4);
      el.dataset.listicleScroll = state.listicleScrollY.toFixed(4);
    });
  }, []);

  useEffect(() => {
    if (reducedMotion) return;

    const suppressClickRef = { current: false };

    const openTileAt = (clientX: number, clientY: number, target: EventTarget | null) => {
      const wrap = canvasWrapRef.current;
      if (!wrap) return false;
      const canvas = wrap.querySelector("canvas");
      if (!(canvas instanceof HTMLCanvasElement)) return false;
      if (
        target !== canvas &&
        !(target instanceof Node && canvas.contains(target))
      ) {
        return false;
      }
      if (useCreatingStore.getState().phase !== "gallery") return false;
      const mesh = useCreatingStore.getState().tileMesh;
      const camera = useCreatingStore.getState().galleryCamera;
      if (!mesh || !camera) return false;
      const { view, entries, filter } = useCreatingStore.getState();
      const id = pickTileInstanceId(
        mesh,
        camera,
        clientX,
        clientY,
        canvas,
        view,
      );
      if (id < 0) return false;
      const entry = entryAtInstance(entries, filter, id);
      if (!entry) return false;
      const state = useCreatingStore.getState();
      state.setActiveId(entry.id);
      state.setPhase("detail");
      return true;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType === "mouse") return;
      if (scrollDragRef.current.didDrag) {
        scrollDragRef.current.didDrag = false;
        return;
      }
      if (openTileAt(event.clientX, event.clientY, event.target)) {
        suppressClickRef.current = true;
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const onClick = (event: MouseEvent) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      if (scrollDragRef.current.didDrag) {
        scrollDragRef.current.didDrag = false;
        return;
      }
      if (openTileAt(event.clientX, event.clientY, event.target)) {
        event.stopPropagation();
        event.preventDefault();
      }
    };

    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [reducedMotion]);

  const setHoveredId = useCreatingStore((s) => s.setHoveredId);

  useEffect(() => {
    if (reducedMotion) return;

    const onPointerMove = (event: PointerEvent) => {
      if (useCreatingStore.getState().phase !== "gallery") return;
      if (!pointerFine) return;
      const wrap = canvasWrapRef.current;
      if (!wrap) return;
      const canvas = wrap.querySelector("canvas");
      if (!(canvas instanceof HTMLCanvasElement)) return;
      const target = event.target;
      if (
        target !== canvas &&
        !(target instanceof Node && canvas.contains(target))
      ) {
        useCreatingStore.getState().setHoveredId(null);
        return;
      }
      const mesh = useCreatingStore.getState().tileMesh;
      const camera = useCreatingStore.getState().galleryCamera;
      if (!mesh || !camera) return;
      const { view, entries, filter } = useCreatingStore.getState();
      const id = pickTileInstanceId(
        mesh,
        camera,
        event.clientX,
        event.clientY,
        canvas,
        view,
      );
      if (id < 0) {
        setHoveredId(null);
        return;
      }
      const entry = entryAtInstance(entries, filter, id);
      setHoveredId(entry?.id ?? null);
    };

    document.addEventListener("pointermove", onPointerMove);
    return () => document.removeEventListener("pointermove", onPointerMove);
  }, [reducedMotion, pointerFine, setHoveredId]);

  useEffect(() => {
    let loaded = 0;
    const total = Math.max(entries.length, 1);
    const bump = () => {
      loaded += 1;
      setLoaderProgress(Math.min(1, loaded / total));
      if (loaded >= total) setLoaderReady(true);
    };
    entries.forEach((e) => {
      const img = new Image();
      img.onload = bump;
      img.onerror = bump;
      img.src = e.cover;
    });
  }, [entries, setLoaderProgress, setLoaderReady]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (useCreatingStore.getState().phase !== "loader") {
        return;
      }
      const target = useCreatingStore.getState().loaderProgress;
      displayRef.current += (target - displayRef.current) * 0.04;
      setDisplayPercent(Math.round(displayRef.current * 100));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const visibleEntries = useMemo(
    () => filteredEntries(entries, filter),
    [entries, filter],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    type VerifyWindow = Window & {
      __creatingVerify?: () => Record<string, unknown>;
    };
    const win = window as VerifyWindow;
    win.__creatingVerify = () => {
      const state = useCreatingStore.getState();
      const mesh = state.tileMesh;
      const camera = state.galleryCamera;
      const canvas = document.querySelector(
        ".creating-canvas-wrap canvas",
      ) as HTMLCanvasElement | null;
      const off = mesh?.geometry?.getAttribute("aUvOffset");
      const sampleUv = (i: number) =>
        off ? [off.getX(i), off.getY(i)] : null;
      const projected =
        mesh && camera && canvas
          ? projectTileCenters(mesh, camera, canvas)
          : [];
      return {
        entryCount: state.entries.length,
        filteredCount: visibleEntries.length,
        tileMeshCount: mesh?.count ?? 0,
        atlasReady: state.atlasReady,
        view: state.view,
        ringScrollX: state.ringScrollX,
        timelineYears: timelineYearMarkers(visibleEntries).map((m) => m.year),
        hoveredId: state.hoveredId,
        uv17: sampleUv(17),
        uv29: sampleUv(29),
        frameloop:
          document
            .querySelector(".creating-canvas-host")
            ?.getAttribute("data-frameloop") ?? null,
        visibleTitles: visibleEntries.map((e) => e.title),
        visibleIds: visibleEntries.map((e) => e.id),
        activeId: state.activeId,
        cameraRotation: state.galleryCamera
          ? {
              x: state.galleryCamera.rotation.x,
              y: state.galleryCamera.rotation.y,
            }
          : null,
        projectedTiles: projected,
        pickAt: (clientX: number, clientY: number) => {
          if (!mesh || !camera || !canvas) return -1;
          return pickTileInstanceId(
            mesh,
            camera,
            clientX,
            clientY,
            canvas,
            state.view,
          );
        },
        pickPointFor: (instanceId: number) => {
          if (!mesh || !camera || !canvas) return null;
          return pickPointForInstance(
            mesh,
            camera,
            canvas,
            state.view,
            instanceId,
          );
        },
      };
    };
    return () => {
      delete win.__creatingVerify;
    };
  }, [visibleEntries]);

  const categories = useMemo(() => {
    const set = new Set<CreatingCategory>();
    entries.forEach((e) => set.add(e.category));
    return [...set];
  }, [entries]);

  const activeEntry = useMemo(
    () => storeEntries.find((e) => e.id === activeId) ?? null,
    [storeEntries, activeId],
  );

  const openIndex = useMemo(() => {
    if (!activeId) return -1;
    return visibleEntries.findIndex((e) => e.id === activeId);
  }, [activeId, visibleEntries]);

  const hoveredTitle = useMemo(() => {
    if (!hoveredId) return null;
    return entries.find((e) => e.id === hoveredId)?.title ?? null;
  }, [entries, hoveredId]);

  const dispatchScroll = useCallback((dx: number, dy: number) => {
    window.dispatchEvent(
      new CustomEvent("creating-scroll", { detail: { dx, dy } }),
    );
  }, []);

  useEffect(() => {
    if (phase === "loader" || !webglAvailable) {
      setScrollEl(null);
      return;
    }
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    const bindCanvas = () => {
      const canvas = wrap.querySelector("canvas");
      if (canvas instanceof HTMLCanvasElement) setScrollEl(canvas);
    };
    bindCanvas();
    const id = window.requestAnimationFrame(bindCanvas);
    return () => window.cancelAnimationFrame(id);
  }, [phase, webglAvailable, view]);

  useVirtualScroll({
    enabled: phase === "gallery" && !reducedMotion,
    element: scrollEl,
    dragStateRef: scrollDragRef,
    onDelta: (dx, dy) => {
      dispatchScroll(dx, dy);
    },
  });

  const changeView = useCallback(
    (next: CreatingView) => {
      if (next === view || reducedMotion) {
        setView(next);
        return;
      }
      runMorph(VIEW_LABELS[next], () => setView(next));
    },
    [view, reducedMotion, runMorph, setView],
  );

  const changeFilter = useCallback(
    (next: CreatingCategoryFilter) => {
      if (next === filter || reducedMotion) {
        setFilter(next);
        return;
      }
      const label = next === "all" ? "All" : next;
      runMorph(label, () => setFilter(next));
    },
    [filter, reducedMotion, runMorph, setFilter],
  );

  const enterGallery = useCallback(() => {
    const loader = document.querySelector(".creating-loader");
    if (loader instanceof HTMLElement) {
      loader.style.pointerEvents = "none";
    }
    setPhase("gallery");
    if (loader) {
      gsap.to(loader, { opacity: 0, duration: 0.6 });
    }
  }, [setPhase]);

  const animateDetailClose = useCallback(() => {
    openTweenRef.current.v = openProgress;
    setPhase("gallery");
    gsap.to(openTweenRef.current, {
      v: 0,
      duration: 0.55,
      ease: "creating.cubicInOut",
      onUpdate() {
        setOpenProgress(openTweenRef.current.v);
      },
      onComplete: () => {
        useCreatingStore.getState().setActiveId(null);
        closingDetailRef.current = false;
      },
    });
  }, [openProgress, setPhase]);

  const openEntryDetail = useCallback((id: string) => {
    const state = useCreatingStore.getState();
    if (state.phase === "loader") return;
    const active = document.activeElement;
    detailOpenerRef.current =
      active instanceof HTMLElement ? active : detailOpenerRef.current;
    state.setActiveId(id);
    state.setPhase("detail");
  }, []);

  const closeDetail = useCallback(() => {
    if (closingDetailRef.current) return;
    closingDetailRef.current = true;
    if (detailHistoryRef.current) {
      detailHistoryRef.current = false;
      history.back();
      return;
    }
    animateDetailClose();
  }, [animateDetailClose]);

  useEffect(() => {
    const onPop = () => {
      if (useCreatingStore.getState().phase !== "detail") return;
      detailHistoryRef.current = false;
      animateDetailClose();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [animateDetailClose]);

  useEffect(() => {
    if (phase !== "detail" || !activeId || !activeEntry) return;
    if (!detailHistoryRef.current) {
      history.pushState({ creatingDetail: activeId }, "");
      detailHistoryRef.current = true;
    }
    gsap.killTweensOf(openTweenRef.current);
    openTweenRef.current.v = 0;
    setOpenProgress(0);
    gsap.fromTo(
      openTweenRef.current,
      { v: 0 },
      {
        v: 1,
        duration: 1.2,
        ease: "creating.zoomProject",
        onUpdate() {
          setOpenProgress(openTweenRef.current.v);
        },
      },
    );
  }, [phase, activeId, activeEntry]);

  const percent = Math.min(100, Math.max(0, displayPercent));

  if (reducedMotion) {
    return (
      <div className="creating-page creating-page--static">
        <div
          className="creating-page__shell"
          inert={phase === "detail" ? true : undefined}
        >
          <CreatingOverlays
            views={["gallery", "listicle", "timeline"]}
            activeView={view}
            onViewChange={setView}
            categories={categories}
            filter={filter}
            onFilterChange={setFilter}
            showTutorial={false}
            hoveredTitle={null}
            pointerFine={pointerFine}
          />
          <CreatingStaticFallback
            entries={entries}
            filter={filter}
            onOpenEntry={openEntryDetail}
          />
          {phase !== "detail" && (
            <WorksIndexNav
              entries={visibleEntries}
              pointerFine={pointerFine}
              onOpen={openEntryDetail}
            />
          )}
        </div>
        {phase === "detail" && (
          <CreatingDetailPanel
            entry={activeEntry}
            onClose={closeDetail}
            returnFocusRef={detailOpenerRef}
            reducedMotion={reducedMotion}
          />
        )}
      </div>
    );
  }

  const mainInert = phase === "detail";

  return (
    <div className="creating-page" ref={shellRef} data-phase={phase}>
      <div className="creating-page__shell" inert={mainInert ? true : undefined}>
      {phase === "loader" && (
        <div className="creating-loader">
          <div className="creating-loader__inner">
            <h1 className="creating-loader__title">Creating</h1>
            <p className="creating-loader__lead">A gallery of creative work.</p>
            <p className="creating-loader__percent">
              {String(percent).padStart(3, "0")}
            </p>
            {loaderReady && percent >= 100 && (
              <button
                type="button"
                className="creating-loader__enter"
                data-no-drag=""
                onClick={enterGallery}
              >
                Enter
              </button>
            )}
          </div>
        </div>
      )}

      <div
        className="creating-canvas-wrap"
        ref={canvasWrapRef}
        aria-hidden={phase === "detail"}
        data-phase={phase}
        data-atlas-ready={webglAvailable && atlasReady ? "true" : "false"}
      >
        {phase !== "loader" && webglAvailable ? (
          <CreatingScene
            visibleEntries={visibleEntries}
            view={view}
            globeFormation={morphProgress}
            openProgress={openProgress}
            openId={openIndex}
            reducedMotion={reducedMotion}
            showLoader={false}
            morphLabel={morphLabel}
          />
        ) : null}
      </div>


      {phase === "gallery" && view === "listicle" && (
        <CreatingListicleList entries={visibleEntries} hoveredId={hoveredId} />
      )}

      {phase !== "loader" && (
        <CreatingOverlays
          views={["gallery", "listicle", "timeline"]}
          activeView={view}
          onViewChange={changeView}
          categories={categories}
          filter={filter}
          onFilterChange={changeFilter}
          showTutorial={phase === "gallery"}
          hoveredTitle={hoveredTitle}
          pointerFine={pointerFine}
        />
      )}

      {phase !== "detail" && (
        <WorksIndexNav
          entries={visibleEntries}
          pointerFine={pointerFine}
          onOpen={openEntryDetail}
        />
      )}
      </div>

      {activeEntry && openProgress > 0.001 && (
        <CreatingDetailPanel
          entry={activeEntry}
          onClose={closeDetail}
          returnFocusRef={detailOpenerRef}
          reducedMotion={reducedMotion}
        />
      )}
    </div>
  );
}
