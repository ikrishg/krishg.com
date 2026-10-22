import { useEffect, useRef, useState } from "react";
import HomeClosingLink from "./HomeClosingLink";
import {
  closingBandRow,
  closingMobileLinks,
  closingNavRow,
} from "./home-closing";
import { dispatchSplashScheduleClear } from "./HomeSplashOverlay";

const MOBILE_CLOSING_MQ = "(max-width: 767px)";

function useClosingLayout() {
  const [mobileStack, setMobileStack] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_CLOSING_MQ);
    const sync = () => setMobileStack(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return mobileStack;
}

function StarSeparator() {
  return (
    <span
      className="home-closing-star relative z-[40] select-none px-[0.45em] text-[1.35em] font-bold leading-none"
      style={{ color: "var(--home-closing-ink, var(--home-closing-fg))" }}
      aria-hidden="true"
    >
      ✱
    </span>
  );
}

function NavRow() {
  return (
    <p className="home-closing-nav-row relative z-[40] m-0 flex flex-wrap items-center justify-center gap-y-1 text-center">
      {closingNavRow.map((link, index) => (
        <span key={link.key} className="inline-flex items-center">
          {index > 0 ? <StarSeparator /> : null}
          <HomeClosingLink link={link} variant="nav" />
        </span>
      ))}
    </p>
  );
}

function PrimaryRow() {
  return (
    <div className="home-closing-primary-row relative z-[40] flex w-full max-w-[var(--home-content-max)] flex-col items-center justify-center gap-4 md:flex-row md:gap-[clamp(1.5rem,6vw,5rem)]">
      {closingBandRow.map((link) => (
        <HomeClosingLink key={link.key} link={link} variant="primary" />
      ))}
    </div>
  );
}

function MobileStack() {
  return (
    <div className="home-closing-mobile relative z-[40] flex w-full flex-col">
      {closingMobileLinks.map((link) => (
        <HomeClosingLink key={link.key} link={link} variant="mobile-block" />
      ))}
    </div>
  );
}

function DesktopIndex() {
  return (
    <div className="home-closing-desktop relative z-[40] mx-auto flex w-full max-w-[var(--home-content-max)] flex-col">
      <div className="home-closing-index__primary flex flex-1 flex-col items-center justify-center py-8 md:py-12">
        <PrimaryRow />
      </div>
      <div className="home-closing-index__nav pb-6 pt-2 md:pb-8">
        <NavRow />
      </div>
    </div>
  );
}

export default function HomeClosingIndex() {
  const sectionRef = useRef<HTMLElement>(null);
  const mobileStack = useClosingLayout();

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || mobileStack) return;

    const onLeave = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const next = event.relatedTarget as Node | null;
      if (next && section.contains(next)) return;
      dispatchSplashScheduleClear();
      document.documentElement.style.removeProperty("--home-closing-ink");
    };

    section.addEventListener("pointerleave", onLeave);
    return () => section.removeEventListener("pointerleave", onLeave);
  }, [mobileStack]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const root = document.documentElement;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          root.dataset.homePastBands = "true";
          if (mobileStack) {
            root.dataset.homeClosingMobile = "true";
          } else {
            delete root.dataset.homeClosingMobile;
          }
        } else {
          delete root.dataset.homePastBands;
          delete root.dataset.homeClosingMobile;
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(section);
    return () => {
      observer.disconnect();
      delete root.dataset.homePastBands;
      delete root.dataset.homeClosingMobile;
    };
  }, [mobileStack]);

  useEffect(() => {
    const root = document.documentElement;
    if (mobileStack) {
      root.dataset.homeClosingLayout = "mobile-stack";
    } else {
      delete root.dataset.homeClosingLayout;
      delete root.dataset.homeClosingMobile;
    }
  }, [mobileStack]);

  return (
    <section
      ref={sectionRef}
      id="home-closing-index"
      data-home-nav-theme={mobileStack ? "building" : "closing"}
      className="home-closing-index relative z-[40] snap-start text-[var(--home-closing-fg)] max-md:px-0 md:px-[var(--gutter)]"
      aria-label="Site index"
    >
      {mobileStack ? <MobileStack /> : <DesktopIndex />}
    </section>
  );
}
