/**
 * Restore footerMeasureRect after pr40-apply-cursor-collapse-mutation.mjs.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const file = path.join(
  process.cwd(),
  "src/components/home/HomeDriftingCursors.tsx",
);
const src = readFileSync(file, "utf8");
const marker = "/** PR40 gate proof mutation:";
const endMarker = "function readFooterSliceLayout(";
const start = src.indexOf(marker);
const end = src.indexOf(endMarker);
if (start < 0 || end < 0 || end <= start) {
  console.error("pr40-revert-cursor-collapse-mutation: mutation block not found");
  process.exit(1);
}
const restored =
  src.slice(0, start) +
  `/** Footer uses \`display: contents\` on desktop; union email + social when the box is 0×0. */
function footerMeasureRect(footer: HTMLElement): DOMRect {
  const fr = footer.getBoundingClientRect();
  if (fr.width > 2 && fr.height > 2) return fr;
  const parts = [
    footer.querySelector<HTMLElement>(".home-footer__email"),
    footer.querySelector<HTMLElement>(".home-footer__social"),
  ].filter((el): el is HTMLElement => Boolean(el));
  if (!parts.length) return fr;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const el of parts) {
    const r = el.getBoundingClientRect();
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }
  if (!Number.isFinite(left)) return fr;
  return new DOMRect(left, top, right - left, bottom - top);
}

` +
  src.slice(end);
writeFileSync(file, restored);
console.log("Reverted cursor-collapse mutation");
