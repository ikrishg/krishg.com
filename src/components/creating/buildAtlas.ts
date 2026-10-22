import * as THREE from "three";

export type AtlasEntry = {
  uvOffset: [number, number];
  uvScale: [number, number];
};

export type AtlasSource = {
  url: string;
  stampDemo?: boolean;
};

const CELL = 512;
const MAX_ATLAS_DIM = 4096;

function stampDemoLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
) {
  const pad = 12;
  const labelH = 28;
  const labelW = 92;
  ctx.fillStyle = "rgba(20, 26, 43, 0.92)";
  ctx.fillRect(x + pad, y + CELL - labelH - pad, labelW, labelH);
  ctx.fillStyle = "#fff8ea";
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("DEMO", x + pad + 8, y + CELL - pad - labelH / 2);
}

export async function buildTextureAtlas(
  sources: AtlasSource[],
): Promise<{ texture: THREE.Texture; entries: AtlasEntry[] }> {
  const count = sources.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const canvasWidth = Math.min(MAX_ATLAS_DIM, cols * CELL);
  const canvasHeight = Math.min(MAX_ATLAS_DIM, rows * CELL);
  const effectiveCols = Math.max(1, Math.floor(canvasWidth / CELL));
  const effectiveRows = Math.max(1, Math.floor(canvasHeight / CELL));

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2d unavailable");

  const entries: AtlasEntry[] = [];

  const loadImage = (url: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });

  for (let i = 0; i < sources.length; i++) {
    const { url, stampDemo } = sources[i];
    const col = i % effectiveCols;
    const row = Math.floor(i / effectiveCols);
    if (row >= effectiveRows) {
      throw new Error(`Atlas too small for ${sources.length} textures`);
    }
    const x = col * CELL;
    const y = row * CELL;
    try {
      const img = await loadImage(url);
      ctx.fillStyle = "#e8e4dc";
      ctx.fillRect(x, y, CELL, CELL);
      const scale = Math.min(CELL / img.width, CELL / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, x + (CELL - dw) / 2, y + (CELL - dh) / 2, dw, dh);
    } catch {
      ctx.fillStyle = "#e8e4dc";
      ctx.fillRect(x, y, CELL, CELL);
      ctx.fillStyle = "#8a8a8a";
      ctx.font = "22px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("placeholder", x + CELL / 2, y + CELL / 2);
    }
    if (stampDemo) stampDemoLabel(ctx, x, y);
    entries.push({
      uvOffset: [col / effectiveCols, 1 - (row + 1) / effectiveRows],
      uvScale: [1 / effectiveCols, 1 / effectiveRows],
    });
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  return { texture, entries };
}
