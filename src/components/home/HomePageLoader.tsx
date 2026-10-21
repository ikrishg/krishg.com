import { useEffect, useRef, useState } from "react";

const STROKE_MS = 1400;
const MORPH_MS = 520;

function prefersReducedMotion(): boolean {
  return (
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
  );
}

function setLogoMorph(state: "pending" | "done") {
  const root = document.documentElement;
  if (state === "pending") {
    root.dataset.logoMorph = "pending";
  } else {
    delete root.dataset.logoMorph;
  }
}

export default function HomePageLoader() {
  const [phase, setPhase] = useState<"draw" | "morph" | "done">("draw");
  const panelRef = useRef<HTMLDivElement>(null);
  const morphStarted = useRef(false);

  useEffect(() => {
    setLogoMorph("pending");
    return () => setLogoMorph("done");
  }, []);

  useEffect(() => {
    const reduced = prefersReducedMotion();
    let homeReady = document.documentElement.dataset.homeReady === "true";
    let strokeDone = false;
    let morphTimer: number | undefined;

    const tryMorph = () => {
      if (!homeReady || !strokeDone || morphStarted.current) return;
      morphStarted.current = true;
      if (reduced) {
        setLogoMorph("done");
        setPhase("done");
        return;
      }
      setPhase("morph");
    };

    const onHomeReady = () => {
      homeReady = true;
      tryMorph();
    };

    const observer = new MutationObserver(() => {
      if (document.documentElement.dataset.homeReady === "true") {
        observer.disconnect();
        onHomeReady();
      }
    });
    if (homeReady) {
      onHomeReady();
    } else {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-home-ready"],
      });
    }

    const strokeMs = reduced ? 200 : STROKE_MS;
    const strokeTimer = window.setTimeout(() => {
      strokeDone = true;
      tryMorph();
    }, strokeMs);

    return () => {
      observer.disconnect();
      window.clearTimeout(strokeTimer);
      if (morphTimer !== undefined) window.clearTimeout(morphTimer);
    };
  }, []);

  useEffect(() => {
    if (phase !== "morph") return;

    const panel = panelRef.current;
    const target = document.querySelector<SVGElement>(".home-logo__svg");
    const root = document.querySelector<HTMLElement>(".home-page-loader");

    if (!panel || !target) {
      setLogoMorph("done");
      setPhase("done");
      return;
    }

    const from = panel.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const sx = to.width / from.width;
    const sy = to.height / from.height;
    const tx = to.left - from.left;
    const ty = to.top - from.top;

    panel.style.position = "fixed";
    panel.style.left = `${from.left}px`;
    panel.style.top = `${from.top}px`;
    panel.style.width = `${from.width}px`;
    panel.style.margin = "0";
    panel.style.transform = "translate(0, 0) scale(1)";
    panel.style.transformOrigin = "top left";
    panel.style.transition = "none";

    if (root) {
      root.style.background = "transparent";
    }

    const reduced = prefersReducedMotion();
    const morphMs = reduced ? 180 : MORPH_MS;

    const run = () => {
      panel.style.transition = `transform ${morphMs}ms cubic-bezier(0.23, 1, 0.32, 1)`;
      panel.style.transform = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;
    };

    requestAnimationFrame(() => requestAnimationFrame(run));

    const finish = () => {
      setLogoMorph("done");
      setPhase("done");
    };

    const onEnd = (event: TransitionEvent) => {
      if (event.propertyName !== "transform") return;
      panel.removeEventListener("transitionend", onEnd);
      finish();
    };

    panel.addEventListener("transitionend", onEnd);
    const fallback = window.setTimeout(finish, morphMs + 80);

    return () => {
      panel.removeEventListener("transitionend", onEnd);
      window.clearTimeout(fallback);
    };
  }, [phase]);

  if (phase === "done") return null;

  return (
    <div className="home-page-loader" data-phase={phase} aria-hidden="true">
      <div ref={panelRef} className="home-page-loader__panel">
        <svg
          className="home-page-loader__sig"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 440 160"
          fill="none"
        >
          <g
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          >
            <path
              className="home-page-loader__stroke"
              strokeWidth="3.6"
              pathLength={1}
              d="M112 12 C121 45 124 91 123 143"
            />
            <path
              className="home-page-loader__stroke"
              strokeWidth="3.2"
              pathLength={1}
              d="M197 31 C158 52 112 73 63 90 C48 95 32 100 20 101 C83 91 159 94 222 98 C296 102 365 110 420 119"
            />
            <path
              className="home-page-loader__stroke"
              strokeWidth="3.5"
              pathLength={1}
              d="M165 69 C167 77 169 87 170 94 M168 82 C175 74 180 70 185 70"
            />
            <path
              className="home-page-loader__stroke"
              strokeWidth="3.5"
              pathLength={1}
              d="M200 77 C200 83 201 90 202 96"
            />
            <path
              className="home-page-loader__stroke"
              strokeWidth="3.8"
              pathLength={1}
              d="M199 61 L199.5 62"
            />
            <path
              className="home-page-loader__stroke"
              strokeWidth="3.5"
              pathLength={1}
              d="M228 73 C224 67 218 71 221 78 C223 83 232 87 232 92 C232 98 221 100 217 94 C215 91 216 88 217 86"
            />
            <path
              className="home-page-loader__stroke"
              strokeWidth="3.5"
              pathLength={1}
              d="M243 53 C247 68 249 83 250 97 C253 83 258 76 264 76 C271 76 274 87 276 99"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}
