#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const dist = path.resolve("dist");
const creatingHtml = await readFile(
  path.join(dist, "creating/index.html"),
  "utf8",
);

/** Collect script URLs referenced by /creating HTML (modulepreload + scripts). */
function urlsFromHtml(html) {
  const urls = new Set();
  for (const re of [
    /component-url="([^"]+)"/g,
    /renderer-url="([^"]+)"/g,
    /href="(\/_astro\/[^"]+\.js)"/g,
    /src="(\/_astro\/[^"]+\.js)"/g,
  ]) {
    for (const m of html.matchAll(re)) urls.add(m[1]);
  }
  return [...urls];
}

const astroDir = path.join(dist, "_astro");
const files = await readdir(astroDir);
const fileSet = new Set(files);

/** @param {string} url */
function urlToChunkFile(url) {
  const name = url.replace(/^\/_astro\//, "");
  return fileSet.has(name) ? name : null;
}

/** @param {string} file */
async function readChunk(file) {
  return readFile(path.join(astroDir, file), "utf8");
}

/** @param {string} text */
function importRefs(text) {
  const refs = new Set();
  for (const m of text.matchAll(/\.\/([A-Za-z0-9_.-]+\.js)/g)) {
    refs.add(m[1]);
  }
  return refs;
}

const entryUrls = urlsFromHtml(creatingHtml);
const queue = [];
const visited = new Set();

for (const url of entryUrls) {
  const file = urlToChunkFile(url);
  if (file) {
    queue.push(file);
    visited.add(file);
  }
}

while (queue.length > 0) {
  const file = queue.pop();
  const text = await readChunk(file);
  for (const ref of importRefs(text)) {
    if (!fileSet.has(ref) || visited.has(ref)) continue;
    visited.add(ref);
    queue.push(ref);
  }
}

const threePatterns = [
  /\/node_modules\/three\//,
  /\/node_modules\/@react-three\//,
  /from\s*["']three["']/,
  /THREE\.WebGLRenderer/,
];

/** @type {{ file: string, pattern: string }[]} */
let bad = [];
let totalGzip = 0;

for (const file of visited) {
  const buf = await readFile(path.join(astroDir, file));
  totalGzip += gzipSync(buf).length;
  const text = buf.toString("utf8");
  for (const p of threePatterns) {
    if (p.test(text)) bad.push({ file, pattern: String(p) });
  }
}

const threeChunks = [...visited].filter((f) => /three-vendor/i.test(f));

console.log("Creating HTML entry scripts:", entryUrls);
console.log("Import graph chunks:", visited.size);
console.log("Approx. gzip sum of graph chunks (KiB):", (totalGzip / 1024).toFixed(1));
console.log("three-vendor files in graph:", threeChunks);

if (threeChunks.length > 0 || bad.length > 0) {
  console.error("FAIL: three.js / R3F reachable from /creating:");
  if (threeChunks.length) console.error("  chunks:", threeChunks);
  if (bad.length) console.error("  matches:", bad);
  process.exit(1);
}

console.log("OK: no three.js / R3F in /creating module graph");
process.exit(0);
