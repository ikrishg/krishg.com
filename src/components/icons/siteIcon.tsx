import {
  ArrowUpRight,
  Asterisk,
  LinkedinLogo,
  MagnifyingGlass,
  XLogo,
  type Icon,
  type IconWeight,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { createElement } from "react";

export type SiteIconName =
  | "x"
  | "linkedin"
  | "search"
  | "asterisk"
  | "arrow-up-right";

export type SiteIconWeight = "bold" | "fill";

const ICONS: Record<SiteIconName, Icon> = {
  x: XLogo,
  linkedin: LinkedinLogo,
  search: MagnifyingGlass,
  asterisk: Asterisk,
  "arrow-up-right": ArrowUpRight,
};

export function SiteIcon({
  name,
  weight = "bold",
  className,
  size,
}: {
  name: SiteIconName;
  weight?: SiteIconWeight;
  className?: string;
  size?: number | string;
}): ReactNode {
  const IconComponent = ICONS[name];
  return createElement(IconComponent, {
    weight: weight as IconWeight,
    color: "currentColor",
    "aria-hidden": true,
    ...(className !== undefined ? { className } : {}),
    ...(size !== undefined ? { size } : {}),
  });
}

/** Build-time SVG string for Astro and other static templates. */
export function renderSiteIcon(
  name: SiteIconName,
  options: {
    weight?: SiteIconWeight;
    className?: string;
    size?: number | string;
  } = {},
): string {
  return renderToStaticMarkup(
    <SiteIcon
      name={name}
      weight={options.weight ?? "bold"}
      {...(options.className !== undefined
        ? { className: options.className }
        : {})}
      {...(options.size !== undefined ? { size: options.size } : {})}
    />,
  );
}

/** Footer social icon (single bold glyph; hover via link styles). */
export function renderSiteSocialIcon(
  name: Exclude<SiteIconName, "search" | "asterisk">,
): string {
  const icon = renderSiteIcon(name, {
    weight: "bold",
    className: "site-icon",
  });
  return `<span class="home-footer__social-icon" aria-hidden="true">${icon}</span>`;
}

export function renderSiteSocialExternalIcon(): string {
  const icon = renderSiteIcon("arrow-up-right", {
    weight: "bold",
    className: "site-icon home-footer__social-pill-arrow",
  });
  return `<span class="home-footer__social-pill-external" aria-hidden="true">${icon}</span>`;
}
