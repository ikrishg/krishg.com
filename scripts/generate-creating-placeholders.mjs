/**
 * Neutral placeholder covers for the creating content collection.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const outDir = path.resolve("public/creating/placeholders");
await mkdir(outDir, { recursive: true });

const categories = [
  "poetry",
  "prose",
  "photography",
  "paintings",
  "design",
];

const ink = "#1c1c1c";
const paper = "#e8e4dc";
const red = "#b94a3f";

let n = 0;
for (const category of categories) {
  for (let i = 1; i <= 2; i++) {
    n += 1;
    const label = `PLACEHOLDER ${category} ${String(i).padStart(2, "0")}`;
    const svg = `
<svg width="512" height="640" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="640" fill="${paper}"/>
  <rect x="24" y="24" width="464" height="592" fill="none" stroke="${red}" stroke-width="3"/>
  <text x="256" y="300" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" fill="${ink}">${label}</text>
  <text x="256" y="340" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" fill="${ink}" opacity="0.6">cover placeholder</text>
</svg>`;
    const file = `${category}-${String(i).padStart(2, "0")}.webp`;
    await sharp(Buffer.from(svg)).webp({ quality: 80 }).toFile(path.join(outDir, file));
    console.log(file);
  }
}

const manifest = { count: n, categories };
await writeFile(
  path.join(outDir, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
console.log("Done.", n, "images");
