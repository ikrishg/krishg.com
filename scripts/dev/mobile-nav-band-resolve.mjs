/**
 * Shared mobile band-under-nav resolution (shallow probe only).
 * Used by nav-step and overscroll gates; mirrors HomeNavbarTheme.tsx.
 */

export const CANVAS_HEX = {
  builder: "#398fd0",
  creator: "#b94a3f",
  educator: "#d8a12a",
  closing: "#e7ddcc",
  about: "#7459bd",
  now: "#1f8254",
  sitemap: "#a8488d",
};

export function parseRgb(css) {
  const m = css?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

export function colorDist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function colorsClose(cssA, cssB, threshold = 36) {
  const a = parseRgb(cssA);
  const b = parseRgb(cssB);
  if (!a || !b) return false;
  return colorDist(a, b) <= threshold;
}

/** In-page resolver; pass as string to page.evaluate or duplicate in TS. */
export const RESOLVE_BAND_UNDER_NAV_SOURCE = `
function resolveBandUnderMobileNav() {
  const nav = document.querySelector(".home-navbar");
  if (!nav) return null;
  const navRect = nav.getBoundingClientRect();
  const cx = window.innerWidth / 2;
  const SECTION = "[data-home-nav-theme]";

  const accentFrom = (el) => {
    const v = el?.dataset?.homeNavTheme;
    return v || null;
  };

  const bandBg = (el) => {
    if (!el) return "";
    const paint = el.querySelector?.(".hero-band-paint");
    if (paint) return getComputedStyle(paint).backgroundColor;
    return getComputedStyle(el).backgroundColor;
  };

  for (let dy = 0; dy <= 3; dy += 1) {
    const y = Math.min(navRect.bottom + dy, window.innerHeight - 1);
    const stack = document.elementsFromPoint(cx, y);
    for (const el of stack) {
      if (nav.contains(el)) continue;

      const mobile = el.closest(".home-closing-link--mobile");
      if (mobile) {
        return {
          theme: accentFrom(mobile),
          bandBg: getComputedStyle(mobile).backgroundColor,
          kind: "mobile",
        };
      }

      if (el.closest(".home-footer")) {
        return { theme: "closing", bandBg: "rgb(231, 221, 204)", kind: "footer" };
      }

      const scrollBand = el.closest(SECTION + "[data-home-scroll-band]");
      if (scrollBand) {
        const theme = accentFrom(scrollBand);
        if (theme) {
          return { theme, bandBg: bandBg(scrollBand), kind: "hero" };
        }
      }

      const themed = el.closest(SECTION);
      if (themed && themed.hasAttribute("data-home-scroll-band")) {
        const theme = accentFrom(themed);
        if (theme) {
          return { theme, bandBg: bandBg(themed), kind: "hero" };
        }
      }
    }
  }
  return null;
}
`;
