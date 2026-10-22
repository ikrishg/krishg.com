import { useEffect, useState } from "react";

/**
 * Reads the computed font-size of a Tailwind clamp class via an offscreen probe.
 */
export function useClampFontSizePx(className: string, fallbackPx = 16) {
  const [px, setPx] = useState(fallbackPx);

  useEffect(() => {
    const probe = document.createElement("span");
    probe.className = className;
    probe.textContent = "m";
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none";
    document.body.appendChild(probe);

    const read = () => {
      const size = parseFloat(getComputedStyle(probe).fontSize);
      if (Number.isFinite(size) && size > 0) setPx(size);
    };

    read();
    window.addEventListener("resize", read);
    return () => {
      window.removeEventListener("resize", read);
      probe.remove();
    };
  }, [className]);

  return px;
}
