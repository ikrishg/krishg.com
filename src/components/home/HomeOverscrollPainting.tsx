import { useEffect, useRef, useState } from "react";
import {
  getOverscrollPull,
  getOverscrollRevealProgress,
} from "~motion/homeOverscrollEngine";

const ART_1X = "/images/starry-night.webp";
const ART_2X = "/images/starry-night-1800.webp";
const FOOTER_SELECTOR = ".home-footer";

export default function HomeOverscrollPainting() {
  const artRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const footer = document.querySelector(FOOTER_SELECTOR);
    if (!footer) return;

    let cancelled = false;
    const loadArt = () => {
      if (cancelled || loaded) return;
      const dpr = window.devicePixelRatio || 1;

      const apply = (url: string) => {
        artRef.current?.style.setProperty("background-image", `url("${url}")`);
        setLoaded(true);
      };

      if (dpr >= 2) {
        const hi = new Image();
        hi.decoding = "async";
        hi.onload = () => {
          if (!cancelled) apply(ART_2X);
        };
        hi.onerror = () => {
          if (!cancelled) apply(ART_1X);
        };
        hi.src = ART_2X;
        return;
      }

      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        if (!cancelled) apply(ART_1X);
      };
      img.src = ART_1X;
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          loadArt();
          observer.disconnect();
        }
      },
      { rootMargin: "240px 0px" },
    );

    observer.observe(footer);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [loaded]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const root = document.documentElement;

    const sync = () => {
      const pull = getOverscrollPull();
      const revealVar = getOverscrollRevealProgress();
      const reveal =
        root.dataset.overscrollReveal === "true" ||
        revealVar > 0.08 ||
        pull > 24;
      const artOpacity = reveal
        ? Math.min(1, revealVar > 0 ? revealVar : pull > 24 ? 1 : pull / 24)
        : 0;
      root.style.setProperty(
        "--home-overscroll-art-opacity",
        artOpacity.toFixed(3),
      );
      layer.dataset.visible = reveal ? "true" : "false";
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-overscroll-reveal", "style"],
    });
    window.addEventListener("scroll", sync, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", sync);
    };
  }, []);

  return (
    <div
      ref={layerRef}
      className="home-overscroll-painting"
      aria-hidden="true"
      data-loaded={loaded ? "true" : "false"}
    >
      <div className="home-overscroll-painting__inset">
        <div className="home-overscroll-painting__frame">
          <div ref={artRef} className="home-overscroll-painting__art" />
        </div>
      </div>
    </div>
  );
}
