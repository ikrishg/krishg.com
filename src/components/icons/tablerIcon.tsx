import type { TablerIcon as TablerIconType } from "@tabler/icons-react";
// Tabler outline icons: 2px stroke, round caps, currentColor.
import type { ReactNode } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

export const TABLER_STROKE = 2;

export type TablerIconComponent = TablerIconType;

export function TablerIcon({
  icon: Icon,
  className,
  size = 24,
}: {
  icon: TablerIconComponent;
  className?: string;
  size?: number | string;
}): ReactNode {
  return createElement(Icon, {
    stroke: TABLER_STROKE,
    size,
    className,
    "aria-hidden": true,
  });
}

/** Build-time SVG string for Astro and other static templates. */
export function renderTablerIcon(
  Icon: TablerIconComponent,
  options: { className?: string; size?: number | string } = {},
): string {
  return renderToStaticMarkup(
    <TablerIcon
      icon={Icon}
      className={options.className}
      size={options.size}
    />,
  );
}
