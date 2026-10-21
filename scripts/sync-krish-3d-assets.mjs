/**
 * Copies optimized GLBs and WebP textures from ikrishg/krish-3d-objects.
 * Requires a token with read access (e.g. GH_ADMIN_TOKEN) or a local clone path.
 *
 *   KRISH_3D_OBJECTS_DIR=/path/to/krish-3d-objects node scripts/sync-krish-3d-assets.mjs
 */
import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const repoDir =
  process.env.KRISH_3D_OBJECTS_DIR ??
  path.resolve("/tmp/krish-3d-objects");
const outDir = path.resolve("public/home-3d");
const imgOut = path.join(outDir, "img");

if (!existsSync(path.join(repoDir, "dist/assets"))) {
  console.error(
    `Missing ${repoDir}. Clone ikrishg/krish-3d-objects or set KRISH_3D_OBJECTS_DIR.`,
  );
  process.exit(1);
}

await mkdir(imgOut, { recursive: true });

const glbs = [
  ["dist/assets/computer-5i2gCxYm.glb", "computer.glb"],
  ["dist/assets/book-BkxNhw2h.glb", "book.glb"],
  ["dist/assets/portrait-frame-C2DGifZn.glb", "portrait-frame.glb"],
];

for (const [src, dest] of glbs) {
  await cp(path.join(repoDir, src), path.join(outDir, dest));
  console.log(`Wrote public/home-3d/${dest}`);
}

for (const name of ["portrait.png", "book.png", "computer.png"]) {
  const base = name.replace(".png", "");
  await sharp(path.join(repoDir, "img", name))
    .webp({ quality: 82 })
    .toFile(path.join(imgOut, `${base}.webp`));
  console.log(`Wrote public/home-3d/img/${base}.webp`);
}

console.log("Done.");
