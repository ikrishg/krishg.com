import {
  Asterisk,
  EnvelopeSimple,
  InstagramLogo,
  LinkedinLogo,
  MagnifyingGlass,
  XLogo,
  type Icon,
  type IconWeight,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

export type SiteIconName =
  | "mail"
  | "x"
  | "linkedin"
  | "instagram"
  | "search"
  | "asterisk";

export type SiteIconWeight = "bold" | "fill";

const ICONS: Record<SiteIconName, Icon> = {
  mail: EnvelopeSimple,
  x: XLogo,
  linkedin: LinkedinLogo,
  instagram: InstagramLogo,
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

/** Footer social: Bold default, Fill on hover/focus without layout shift. */
export function renderSiteSocialIcon(name: Exclude<SiteIconName, "mail" | "search" | "asterisk">): string {
  const bold = renderSiteIcon(name, {
    weight: "bold",
    className: "site-icon site-icon--bold",
  });
  const fill = renderSiteIcon(name, {
    weight: "fill",
    className: "site-icon site-icon--fill",
  });
  return `<span class="home-footer__social-icon" aria-hidden="true">${bold}${fill}</span>`;
}
