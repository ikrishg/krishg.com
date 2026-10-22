import type { PointerEvent } from "react";
import type { ClosingLink } from "./home-closing";
import { closingSplashInkHex } from "./home-closing";
import {
  dispatchSplashActivate,
  dispatchSplashScheduleClear,
} from "./HomeSplashOverlay";

type Props = {
  link: ClosingLink;
  variant: "primary" | "nav";
};

function canUseHoverSplash() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

const primaryClass =
  "home-closing-link home-closing-link--primary relative z-[40] inline-block min-h-11 py-2 text-center font-[family-name:var(--font-inter-tight),var(--font-space-grotesk),system-ui,sans-serif] text-[clamp(2.25rem,9vw,5.5rem)] font-extrabold lowercase tracking-[-0.045em] underline underline-offset-[0.22em] decoration-[2px] transition-[color,opacity] duration-[350ms] ease-[var(--ease-out)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4";

const navClass =
  "home-closing-link home-closing-link--nav relative z-[40] inline-block min-h-11 py-2 font-[family-name:var(--font-space-grotesk),system-ui,sans-serif] text-[clamp(1rem,2.4vw,1.375rem)] font-normal lowercase tracking-[-0.02em] underline underline-offset-[0.32em] decoration-[1.5px] transition-[color,opacity] duration-[350ms] ease-[var(--ease-out)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4";

export default function HomeClosingLink({ link, variant }: Props) {
  const ink = closingSplashInkHex[link.key];
  const className = variant === "primary" ? primaryClass : navClass;

  const onBandPointerDown = (event: PointerEvent<HTMLAnchorElement>) => {
    if (event.pointerType === "mouse") return;
    document.documentElement.style.removeProperty("--home-closing-ink");
  };

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
