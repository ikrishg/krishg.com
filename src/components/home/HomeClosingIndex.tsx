import { useEffect, useRef } from "react";
import HomeClosingLink from "./HomeClosingLink";
import {
  closingBandRow,
  closingNavRow,
} from "./home-closing";
import { dispatchSplashScheduleClear } from "./HomeSplashOverlay";

function StarSeparator() {
  return (
    <span
      className="home-closing-star relative z-[40] select-none px-[0.35em] text-[0.95em] leading-none opacity-80"
      style={{ color: "var(--home-closing-ink, var(--home-educator-fg))" }}
      aria-hidden="true"
    >
      ✱
    </span>
  );
}

function ClosingRow({ links }: { links: typeof closingBandRow }) {
  return (
    <p className="relative z-[40] m-0 flex flex-wrap items-center justify-center gap-y-1 text-center">
      {links.map((link, index) => (
        <span key={link.key} className="inline-flex items-center">
          {index > 0 ? <StarSeparator /> : null}
          <HomeClosingLink link={link} />
        </span>
      ))}
    </p>
  );
}

export default function HomeClosingIndex() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const onLeave = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const next = event.relatedTarget as Node | null;
      if (next && section.contains(next)) return;
      dispatchSplashScheduleClear();
      document.documentElement.style.removeProperty("--home-closing-ink");
    };

    section.addEventListener("pointerleave", onLeave);
    return () => section.removeEventListener("pointerleave", onLeave);
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const root = document.documentElement;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          root.dataset.homePastBands = "true";
        } else {
          delete root.dataset.homePastBands;
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(section);
    return () => {
      observer.disconnect();
      delete root.dataset.homePastBands;
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      id="home-closing-index"
      data-home-nav-theme="educator"
      className="home-closing-index relative z-[39] snap-start bg-[var(--home-educator-bg)] px-[var(--gutter)] py-8 text-[var(--home-educator-fg)] md:py-12"
      aria-label="Site index"
    >
      <div className="relative z-[40] mx-auto flex w-full max-w-[var(--home-content-max)] flex-col items-center gap-6 md:gap-8">
        <ClosingRow links={closingBandRow} />
        <ClosingRow links={closingNavRow} />
      </div>
    </section>
  );
}
