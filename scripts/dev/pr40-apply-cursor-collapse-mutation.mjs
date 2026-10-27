/**
 * Temporary mutation for PR40 gate proof: revert footerMeasureRect to pre-fix
 * (display:contents footer box collapses to 0×0). Not for shipping.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const file = path.join(
  process.cwd(),
  "src/components/home/HomeDriftingCursors.tsx",
);
const src = readFileSync(file, "utf8");
const marker = "/** Footer uses `display: contents` on desktop";
const endMarker = "function readFooterSliceLayout(";
const start = src.indexOf(marker);
const end = src.indexOf(endMarker);
if (start < 0 || end < 0 || end <= start) {
  console.error("pr40-apply-cursor-collapse-mutation: pattern not found");
  process.exit(1);
}
const mutated =
  src.slice(0, start) +
  "/** PR40 gate proof mutation: collapsed footer measure (display:contents). */\n" +
  "function footerMeasureRect(footer: HTMLElement): DOMRect {\n" +
  "  return footer.getBoundingClientRect();\n" +
  "}\n\n" +
  src.slice(end);
writeFileSync(file, mutated);
console.log("Applied cursor-collapse mutation to HomeDriftingCursors.tsx");
