import { useEffect, useRef, useState } from "react";

const ART_1X = "/images/starry-night.webp";
const ART_2X = "/images/starry-night-1800.webp";
const FOOTER_SELECTOR = ".home-footer";

function paintingBackground(dpr: number): string {
  if (dpr >= 2) {
    return `image-set(url("${ART_1X}") 1x, url("${ART_2X}") 2x)`;
  }
  return `url("${ART_1X}")`;
}

export default function HomeOverscrollPainting() {
  const layerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const footer = document.querySelector(FOOTER_SELECTOR);
    if (!footer) return;

    let cancelled = false;
    const loadArt = () => {
      if (cancelled || loaded) return;
      const img = new Image();
      img.decoding = "async";
      img.src = ART_1X;
      img.onload = () => {
        if (cancelled) return;
        const dpr = window.devicePixelRatio || 1;
        const apply = () => {
          layerRef.current?.style.setProperty(
            "background-image",
            paintingBackground(dpr),
          );
          setLoaded(true);
        };
        if (dpr >= 2) {
          const hi = new Image();
          hi.decoding = "async";
          hi.onload = () => {
            if (!cancelled) apply();
          };
          hi.onerror = () => {
            if (!cancelled) apply();
          };
          hi.src = ART_2X;
        } else {
          apply();
        }
      };
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
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

    const sync = () => {
      const pull = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--home-overscroll-pull",
        ),
      );
      const reveal =
        document.documentElement.dataset.overscrollReveal === "true";
      layer.dataset.visible = reveal || pull > 0.5 ? "true" : "false";
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
    />
  );
}
