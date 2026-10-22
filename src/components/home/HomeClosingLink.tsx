import type { MouseEvent, PointerEvent } from "react";
import type { ClosingLink } from "./home-closing";
import { closingSplashInkHex } from "./home-closing";
import {
  dispatchSplashActivate,
  dispatchSplashImmediateClear,
  dispatchSplashScheduleClear,
} from "./HomeSplashOverlay";
import { scrollToHomeBand } from "./scrollToHomeBand";

type Props = {
  link: ClosingLink;
};

function canUseHoverSplash() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

const baseClass =
  "home-closing-link relative z-[40] inline-block min-h-11 py-2 font-[family-name:var(--font-space-grotesk),system-ui,sans-serif] text-[clamp(1.125rem,2.2vw,1.625rem)] font-medium lowercase tracking-[-0.02em] underline underline-offset-[0.28em] decoration-[1.5px] transition-[color,opacity] duration-[400ms] ease-[var(--ease-out)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4";

export default function HomeClosingLink({ link }: Props) {
  const ink = closingSplashInkHex[link.key];

  const navigateToBand = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!link.bandId) return;
    event.preventDefault();
    dispatchSplashImmediateClear();
    document.documentElement.style.removeProperty("--home-closing-ink");
    scrollToHomeBand(link.bandId);
  };

  const onBandPointerDown = (event: PointerEvent<HTMLAnchorElement>) => {
    if (!link.bandId || event.pointerType === "mouse") return;
    dispatchSplashImmediateClear();
    document.documentElement.style.removeProperty("--home-closing-ink");
  };

  return (
    <a
      className={baseClass}
      style={{
        color: `var(--home-closing-ink, var(--home-educator-fg))`,
        outlineColor: `var(--home-closing-ink, var(--home-educator-fg))`,
      }}
      href={link.href}
      data-splash-key={link.key}
      data-splash-ink={ink}
      onClick={navigateToBand}
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
