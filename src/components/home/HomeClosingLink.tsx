import { FitText } from "@darkroomengineering/fitbox/react";
import type { PointerEvent } from "react";
import { useEffect, useState } from "react";
import { useClampFontSizePx } from "./useClampFontSizePx";
import type { ClosingLink } from "./home-closing";
import {
  closingMobileInkHex,
  closingSplashHex,
} from "./home-closing";
import {
  dispatchSplashActivate,
  dispatchSplashScheduleClear,
} from "./HomeSplashOverlay";
import {
  isSplashScrollBlocked,
  queueSplashAfterScroll,
} from "~motion/homeSplashScrollGate";
import { canUseClosingHoverSplash } from "./closingHoverSplash";

type Props = {
  link: ClosingLink;
  variant: "primary" | "nav" | "mobile-block";
  /** Smallest per-link fit across the three primary words (fitbox). */
  sharedPrimaryPx?: number | null;
};

function trySplashActivate(
  key: ClosingLink["key"],
  element: HTMLElement,
  clientX: number,
  clientY: number,
) {
  if (isSplashScrollBlocked()) {
    queueSplashAfterScroll(key, clientX, clientY);
    return;
  }
  dispatchSplashActivate(key, element);
}

const primaryClass =
  "home-closing-link home-closing-link--primary inline-block min-h-11 w-full max-w-full py-2 text-center font-[family-name:var(--font-inter-tight),system-ui,sans-serif] font-extrabold lowercase tracking-[-0.045em] underline underline-offset-[0.08em] decoration-[0.055em] transition-[color,opacity,text-decoration-thickness] duration-200 ease-[var(--ease-out)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4";

/** SSR fallback sizing; FitText refines after hydration without layout jump. */
/** md–lg stacks primaries vertically; avoid the old 4rem floor that blew the shared viewport. */
const primaryFitClass =
  "block max-w-full text-[clamp(2.25rem,5.4vw,6rem)] md:max-lg:text-[clamp(1.625rem,4.6vw,2.625rem)] lg:text-[clamp(2.25rem,5.4vw,6rem)]";

const mobileFitClass = "block max-w-full text-[clamp(1.5rem,7.2vw,2rem)]";
const MOBILE_FIT_MAX_PX = 32;

const navClass =
  "home-closing-link home-closing-link--nav inline-block min-h-11 py-2 font-[family-name:var(--font-inter-tight),system-ui,sans-serif] text-[clamp(1.25rem,2.15vw,2rem)] font-medium lowercase tracking-[-0.02em] underline underline-offset-[0.18em] decoration-[0.07em] transition-[color,opacity] duration-[350ms] ease-[var(--ease-out)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4";

const mobileBlockClass =
  "home-closing-link home-closing-link--mobile box-border flex min-h-[calc((100svh-var(--home-nav-height))/6)] min-h-[calc((100lvh-var(--home-nav-height))/6)] w-full flex-1 items-center justify-center px-[var(--gutter)] py-4 text-center font-[family-name:var(--font-inter-tight),system-ui,sans-serif] text-[clamp(1.5rem,7.2vw,2rem)] font-medium lowercase tracking-[-0.02em] underline decoration-[0.07em] underline-offset-[0.2em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

export default function HomeClosingLink({
  link,
  variant,
  sharedPrimaryPx = null,
}: Props) {
  const mobileClampMinPx = useClampFontSizePx(mobileFitClass, 24);
  const prefersReducedMotion = usePrefersReducedMotion();

  const className =
    variant === "primary"
      ? primaryClass
      : variant === "nav"
        ? navClass
        : mobileBlockClass;

  const onBandPointerDown = (event: PointerEvent<HTMLAnchorElement>) => {
    if (event.pointerType === "mouse") return;
    document.documentElement.style.removeProperty("--home-closing-ink");
  };

  if (variant === "mobile-block") {
    const blockInk = closingMobileInkHex[link.key];
    const blockBg = closingSplashHex[link.key];
    return (
      <a
        className={className}
        style={{
          backgroundColor: blockBg,
          color: blockInk,
          outlineColor: blockInk,
        }}
        href={link.href}
        data-splash-key={link.key}
      >
        {prefersReducedMotion ? (
          <span className={mobileFitClass}>{link.label}</span>
        ) : (
          <FitText
            as="span"
            className={mobileFitClass}
            maxLines={1}
            minSize={mobileClampMinPx}
            maxSize={Math.max(MOBILE_FIT_MAX_PX, mobileClampMinPx + 1)}
          >
            {link.label}
          </FitText>
        )}
      </a>
    );
  }

  return (
    <a
      className={className}
      style={{
        color: `var(--home-closing-ink, var(--home-closing-fg))`,
        outlineColor: `var(--home-closing-ink, var(--home-closing-fg))`,
      }}
      href={link.href}
      data-splash-key={link.key}
      onPointerDown={onBandPointerDown}
      onPointerEnter={(event) => {
        if (!canUseClosingHoverSplash() || event.pointerType !== "mouse") return;
        trySplashActivate(
          link.key,
          event.currentTarget,
          event.clientX,
          event.clientY,
        );
      }}
      onPointerLeave={(event) => {
        if (!canUseClosingHoverSplash() || event.pointerType !== "mouse") return;
        dispatchSplashScheduleClear();
      }}
      onFocus={(event) => {
        if (!canUseClosingHoverSplash()) return;
        const rect = event.currentTarget.getBoundingClientRect();
        trySplashActivate(
          link.key,
          event.currentTarget,
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
      }}
      onBlur={() => {
        if (!canUseClosingHoverSplash()) return;
        dispatchSplashScheduleClear();
      }}
    >
      {variant === "primary" ? (
        <span
          className={primaryFitClass}
          style={
            sharedPrimaryPx != null
              ? { fontSize: `${sharedPrimaryPx}px` }
              : undefined
          }
        >
          {link.label}
        </span>
      ) : (
        link.label
      )}
    </a>
  );
}
