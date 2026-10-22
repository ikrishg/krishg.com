/** Organic paint-splash blob centred in a −100..100 viewBox (min radius ≈ 62–67). */
export const HOME_SPLASH_PATH =
  "M 91.7 0.0 C 94.6 12.8 84.0 32.0 75.3 43.5 C 66.7 55.0 52.4 63.8 39.8 68.9 C 27.2 74.1 13.4 74.1 0.0 74.4 C -13.4 74.7 -26.8 75.0 -40.8 70.7 C -54.8 66.4 -78.8 60.3 -84.0 48.5 C -89.3 36.7 -75.2 14.5 -72.3 0.0 C -69.4 -14.5 -71.7 -26.3 -66.7 -38.5 C -61.7 -50.7 -53.3 -64.6 -42.2 -73.1 C -31.1 -81.6 -13.9 -89.9 -0.0 -89.6 C 13.9 -89.3 31.5 -80.7 41.2 -71.3 C 50.9 -62.0 49.6 -45.4 58.0 -33.5 C 66.4 -21.6 88.8 -12.8 91.7 0.0 Z";

export const HOME_CLOSING_BEIGE = "#e7ddcc";
export const HOME_CLOSING_INK = "#141a2b";

export function splashBlobDiameter(ox: number, oy: number): number {
  const R = Math.hypot(
    Math.max(ox, window.innerWidth - ox),
    Math.max(oy, window.innerHeight - oy),
  );
  return Math.ceil(R / 0.31) + 4;
}
