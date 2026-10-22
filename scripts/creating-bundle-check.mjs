#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const dist = path.resolve("dist");
const creatingHtml = await readFile(
  path.join(dist, "creating/index.html"),
  "utf8",
);
const scriptSrcs = [
  ...creatingHtml.matchAll(/component-url="([^"]+)"/g),
  ...creatingHtml.matchAll(/renderer-url="([^"]+)"/g),
  ...creatingHtml.matchAll(/src="(\/_astro\/[^"]+\.js)"/g),
].map((m) => m[1]);

const unique = [...new Set(scriptSrcs)];
const astroDir = path.join(dist, "_astro");
const files = await readdir(astroDir);
const chunks = new Set(unique.map((u) => u.replace("/_astro/", "")));

/** @type {string[]} */
const toScan = [...chunks];
for (const file of files) {
  if (!file.endsWith(".js")) continue;
  const text = await readFile(path.join(astroDir, file), "utf8");
  for (const c of [...chunks]) {
    if (text.includes(`./${c}`) || text.includes(`"${c}"`)) {
      toScan.push(file);
    }
  }
}

const patterns = [
  /node_modules\/three/,
  /@react-three/,
  /THREE\.WebGLRenderer/,
  /from\s*["']three["']/,
];

let bad = [];
for (const file of new Set(toScan)) {
  const text = await readFile(path.join(astroDir, file), "utf8");
  for (const p of patterns) {
    if (p.test(text)) {
      bad.push({ file, pattern: String(p) });
    }
  }
}

console.log("Creating page entry scripts:", unique);
console.log("Scanned chunks:", [...new Set(toScan)].length);
if (bad.length === 0) {
  console.log("OK: no three.js / R3F in /creating JS graph");
  process.exit(0);
}
console.error("FAIL: three.js references in /creating bundle:");
console.error(bad);
process.exit(1);
