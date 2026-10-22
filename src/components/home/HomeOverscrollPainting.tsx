import { useEffect, useRef, useState } from "react";

const ART_URL = "/images/starry-night.webp";
const FOOTER_SELECTOR = ".home-footer";

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
      img.src = ART_URL;
      img.onload = () => {
        if (cancelled) return;
        layerRef.current?.style.setProperty(
          "background-image",
          `url("${ART_URL}")`,
        );
        setLoaded(true);
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
