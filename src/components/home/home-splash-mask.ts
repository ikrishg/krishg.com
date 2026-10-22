/** Organic paint-splash silhouette, centered at origin in a 200×200 viewBox. */
export const HOME_SPLASH_PATH =
  "M 8 -4 C 34 -38 72 -22 58 14 C 88 38 62 78 22 72 C 18 98 -28 92 -48 58 C -78 64 -88 24 -62 4 C -72 -32 -28 -48 8 -4 Z";

const SPLASH_MASK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200"><path fill="white" d="${HOME_SPLASH_PATH}"/></svg>`;

export const HOME_SPLASH_MASK_IMAGE = `url("data:image/svg+xml,${encodeURIComponent(
  SPLASH_MASK_SVG,
)}")`;

export const HOME_CLOSING_BEIGE = "#e7ddcc";
export const HOME_CLOSING_INK = "#141a2b";
