import type { PointerEvent } from "react";
import type { ClosingLink } from "./home-closing";
import {
  closingMobileInkHex,
  closingSplashHex,
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
  "home-closing-link home-closing-link--primary inline-block min-h-11 py-2 text-center font-[family-name:var(--font-inter-tight),var(--font-space-grotesk),system-ui,sans-serif] text-[clamp(2.25rem,5.4vw,6rem)] font-extrabold lowercase tracking-[-0.045em] underline underline-offset-[0.08em] decoration-[0.055em] transition-[color,opacity,text-decoration-thickness] duration-200 ease-[var(--ease-out)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 md:text-[clamp(4rem,8.33vw,4.5rem)] lg:text-[clamp(2.25rem,5.4vw,6rem)]";

const navClass =
  "home-closing-link home-closing-link--nav inline-block min-h-11 py-2 font-[family-name:var(--font-inter),var(--font-space-grotesk),system-ui,sans-serif] text-[clamp(1.25rem,2.15vw,2rem)] font-normal lowercase tracking-[-0.02em] underline underline-offset-[0.18em] decoration-[0.07em] transition-[color,opacity] duration-[350ms] ease-[var(--ease-out)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4";

const mobileBlockClass =
  "home-closing-link home-closing-link--mobile box-border flex min-h-[calc((100svh-var(--home-nav-height))/6)] min-h-[calc((100lvh-var(--home-nav-height))/6)] w-full flex-1 items-center justify-center px-[var(--gutter)] py-4 text-center font-[family-name:var(--font-inter),var(--font-space-grotesk),system-ui,sans-serif] text-[clamp(1.5rem,7.2vw,2rem)] font-normal lowercase tracking-[-0.02em] underline decoration-[0.07em] underline-offset-[0.2em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] active:opacity-92";

export default function HomeClosingLink({ link, variant }: Props) {
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
      onPointerDown={onBandPointerDown}
      onPointerEnter={(event) => {
        if (!canUseHoverSplash() || event.pointerType !== "mouse") return;
        dispatchSplashActivate(link.key, event.currentTarget);
      }}
      onPointerLeave={(event) => {
        if (!canUseHoverSplash() || event.pointerType !== "mouse") return;
        dispatchSplashScheduleClear();
      }}
      onFocus={(event) => {
        if (!canUseHoverSplash()) return;
        dispatchSplashActivate(link.key, event.currentTarget);
      }}
      onBlur={() => {
        if (!canUseHoverSplash()) return;
        dispatchSplashScheduleClear();
      }}
    >
      {link.label}
    </a>
  );
}
