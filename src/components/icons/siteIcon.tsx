import {
  Asterisk,
  LinkedinLogo,
  MagnifyingGlass,
  XLogo,
  type Icon,
  type IconWeight,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

export type SiteIconName = "x" | "linkedin" | "search" | "asterisk";

export type SiteIconWeight = "bold" | "fill";

const ICONS: Record<SiteIconName, Icon> = {
  x: XLogo,
  linkedin: LinkedinLogo,
  search: MagnifyingGlass,
  asterisk: Asterisk,
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
    size,
    className,
    color: "currentColor",
    "aria-hidden": true,
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
      className={options.className}
      size={options.size}
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
