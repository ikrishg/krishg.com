import { renderToStaticMarkup } from "react-dom/server";
import {
  SiteIcon,
  type SiteIconName,
  type SiteIconWeight,
} from "./siteIcon";

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
export function renderSiteSocialIcon(
  name: Exclude<SiteIconName, "mail" | "search" | "asterisk">,
): string {
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
