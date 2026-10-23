import {
  closingSplashHex,
  closingSplashInkHex,
  type ClosingSplashKey,
} from "./home-closing";

/** Krish-locked easter-egg username pool (exact strings). */
export const EASTER_EGG_USERNAME_POOL: readonly string[] = [
  "howimetkrish",
  "haveyoumetkrish",
  "keithknotsworth",
  "kwishlist",
  "thetechieowl",
  "suitupstan",
  "krishneedsalife",
  "krishstruckmuse",
  "krishtophernolan",
  "kristinedior",
  "krishjenner",
  "krishtianbale",
  "dazai",
  "sylvia",
  "napoleon",
  "fabius",
  "dostoevsky",
  "diablo",
  "hoshino",
  "arima",
  "shinobu",
  "forger",
  "briar",
];

const SPLASH_KEYS: ClosingSplashKey[] = [
  "building",
  "creating",
  "educating",
  "about",
  "now",
  "sitemap",
];

const TAG_FONT =
  '600 13px "Inter Tight", "Inter", system-ui, sans-serif';

const PTR_W = 22;
const TAG_OFFSET_X = 14;
const BOX_EDGE = 4;

let measureCanvas: HTMLCanvasElement | null = null;

export function measureTagTextWidth(label: string): number {
  if (typeof document === "undefined") {
    return Math.ceil(label.length * 7.15 + 17);
  }
  if (!measureCanvas) {
    measureCanvas = document.createElement("canvas");
  }
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return Math.ceil(label.length * 7.15 + 17);
  ctx.font = TAG_FONT;
  const metrics = ctx.measureText(label);
  return Math.ceil(metrics.width + 17);
}

export function cursorBoxWidthForLabel(label: string): number {
  return BOX_EDGE + PTR_W + TAG_OFFSET_X + measureTagTextWidth(label) + BOX_EDGE;
}

export type EasterEggCursorDef = {
  id: string;
  label: string;
  color: string;
  ink: string;
  boxW: number;
  regionIndex: number;
  poseSeed: number;
  staticRing?: boolean;
};

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j]!;
    out[j] = tmp!;
  }
  return out;
}

export function buildEasterEggRoster(): EasterEggCursorDef[] {
  const names = shuffle([...EASTER_EGG_USERNAME_POOL]).slice(0, 6);
  const palette = shuffle(
    SPLASH_KEYS.map((key) => ({
      color: closingSplashHex[key],
      ink: closingSplashInkHex[key],
    })),
  ).slice(0, 6);

  return names.map((label, index) => ({
    id: `egg-${index}-${label}`,
    label,
    color: palette[index]!.color,
    ink: palette[index]!.ink,
    boxW: cursorBoxWidthForLabel(label),
    regionIndex: index,
    poseSeed: Math.random(),
    staticRing: index === 2,
  }));
}
