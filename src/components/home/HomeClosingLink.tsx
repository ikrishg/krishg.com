import type { PointerEvent } from "react";
import type { ClosingLink } from "./home-closing";
import {
  closingMobileInkHex,
  closingSplashHex,
  closingSplashInkHex,
} from "./home-closing";
import {
  dispatchSplashActivate,
  dispatchSplashScheduleClear,
} from "./HomeSplashOverlay";

type Props = {
  link: ClosingLink;
  variant: "primary" | "nav" | "mobile-block";
};

function canUseHoverSplash() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

const primaryClass =
  "home-closing-link home-closing-link--primary relative z-[40] inline-block min-h-11 py-2 text-center font-[family-name:var(--font-inter-tight),var(--font-space-grotesk),system-ui,sans-serif] text-[clamp(2.25rem,9vw,5.5rem)] font-extrabold lowercase tracking-[-0.045em] underline underline-offset-[0.22em] decoration-[2px] transition-[color,opacity] duration-[350ms] ease-[var(--ease-out)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4";

const navClass =
  "home-closing-link home-closing-link--nav relative z-[40] inline-block min-h-11 py-2 font-[family-name:var(--font-space-grotesk),system-ui,sans-serif] text-[clamp(1rem,2.4vw,1.375rem)] font-normal lowercase tracking-[-0.02em] underline underline-offset-[0.32em] decoration-[1.5px] transition-[color,opacity] duration-[350ms] ease-[var(--ease-out)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4";

const mobileBlockClass =
  "home-closing-link home-closing-link--mobile relative z-[40] box-border flex min-h-[calc((100svh-var(--home-nav-height))/6)] min-h-[calc((100lvh-var(--home-nav-height))/6)] w-full flex-1 items-center justify-center px-[var(--gutter)] py-4 text-center font-[family-name:var(--font-inter),var(--font-space-grotesk),system-ui,sans-serif] text-[clamp(1.375rem,5.5vw,1.75rem)] font-normal lowercase tracking-[-0.02em] underline underline-offset-[0.28em] decoration-[1.5px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] active:opacity-92";

export default function HomeClosingLink({ link, variant }: Props) {
  const ink = closingSplashInkHex[link.key];
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
        {link.label}
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
      data-splash-ink={ink}
      onPointerDown={onBandPointerDown}
      onPointerEnter={(event) => {
        if (!canUseHoverSplash() || event.pointerType !== "mouse") return;
        document.documentElement.style.setProperty("--home-closing-ink", ink);
        dispatchSplashActivate(link.key, event.currentTarget);
      }}
      onPointerLeave={(event) => {
        if (!canUseHoverSplash() || event.pointerType !== "mouse") return;
        document.documentElement.style.removeProperty("--home-closing-ink");
        dispatchSplashScheduleClear();
      }}
      onFocus={(event) => {
        if (!canUseHoverSplash()) return;
        document.documentElement.style.setProperty("--home-closing-ink", ink);
        dispatchSplashActivate(link.key, event.currentTarget);
      }}
      onBlur={() => {
        if (!canUseHoverSplash()) return;
        document.documentElement.style.removeProperty("--home-closing-ink");
        dispatchSplashScheduleClear();
      }}
    >
      {link.label}
    </a>
  );
}
