import type { ClosingLink } from "./home-closing";
import {
  dispatchSplashActivate,
  dispatchSplashClear,
} from "./HomeSplashOverlay";

type Props = {
  link: ClosingLink;
};

function canUseHoverSplash() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

const baseClass =
  "home-closing-link inline-block min-h-11 py-2 font-[family-name:var(--font-space-grotesk),system-ui,sans-serif] text-[clamp(1.125rem,2.2vw,1.625rem)] font-medium lowercase tracking-[-0.02em] text-[var(--home-educator-fg)] underline-offset-[0.28em] decoration-[1.5px] transition-opacity duration-150 ease-[var(--ease-out)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--home-educator-fg)]";

export default function HomeClosingLink({ link }: Props) {
  const activate = (target: HTMLElement) => {
    dispatchSplashActivate(link.key, target);
  };

  return (
    <a
      className={`${baseClass} ${link.underlined ? "underline" : "no-underline"}`}
      href={link.href}
      onPointerEnter={(event) => {
        if (!canUseHoverSplash() || event.pointerType !== "mouse") return;
        activate(event.currentTarget);
      }}
      onPointerLeave={(event) => {
        if (!canUseHoverSplash() || event.pointerType !== "mouse") return;
        dispatchSplashClear();
      }}
      onFocus={(event) => activate(event.currentTarget)}
      onBlur={() => dispatchSplashClear()}
    >
      {link.label}
    </a>
  );
}
