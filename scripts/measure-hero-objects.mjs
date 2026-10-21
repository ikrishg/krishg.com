import { chromium } from "playwright";

const baseUrl = process.env.PREVIEW_URL ?? "http://127.0.0.1:4321";
const widths = [1440, 1024, 390];

const sections = [
  { id: "builder", object: "computer" },
  { id: "creator", object: "frame" },
  { id: "educator", object: "book" },
];

async function measureSection(page, sectionId, viewportWidth) {
  return page.evaluate(
    ({ sectionId, viewportWidth }) => {
      const section = document.querySelector(`#${sectionId}`);
      const shell = section?.querySelector(".artifact-stage");
      if (!section || !shell) return { error: "missing-dom" };
      if (shell.getAttribute("data-artifact-ready") !== "true") {
        return { error: "not-ready" };
      }

      const meshHeightPx = Number(shell.dataset.meshHeightPx);
      const meshBandPct = Number(shell.dataset.meshBandPct);
      const clearTop = Number(shell.dataset.clearTopPx);
      const clearBottom = Number(shell.dataset.clearBottomPx);
      const clearLeft = Number(shell.dataset.clearLeftPx);
      const clearRight = Number(shell.dataset.clearRightPx);
      const targetMeshPx = Number(shell.dataset.targetMeshPx);

      if (
        !Number.isFinite(meshHeightPx) ||
        !Number.isFinite(clearTop) ||
        !Number.isFinite(clearBottom)
      ) {
        return { error: "missing-metrics" };
      }

      const band =
        viewportWidth < 768
          ? section.getBoundingClientRect().height
          : 600;

      const minClear = Math.min(clearTop, clearBottom, clearLeft, clearRight);

      return {
        meshHeightPx,
        meshBandPct,
        targetMeshPx,
        clearTopPx: clearTop,
        clearBottomPx: clearBottom,
        clearLeftPx: clearLeft,
        clearRightPx: clearRight,
        minClearPx: Math.round(minClear * 10) / 10,
        bandHeightPx: Math.round(band * 10) / 10,
        meets24px: minClear >= 24,
      };
    },
    { sectionId, viewportWidth },
  );
}

async function main() {
  const browser = await chromium.launch();
  const rows = [];

  for (const width of widths) {
    const page = await browser.newPage({
      viewport: { width, height: width < 768 ? 844 : 900 },
    });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    for (const { id, object } of sections) {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded();
      await page.waitForFunction(
        (sel) =>
          document.querySelector(`${sel} .artifact-stage`)?.getAttribute(
            "data-artifact-ready",
          ) === "true",
        `#${id}`,
        { timeout: 90_000 },
      );
      await page.waitForTimeout(2800);
      const result = await measureSection(page, id, width);
      rows.push({ viewport: width, object, section: id, ...result });
    }
    await page.close();
  }

  await browser.close();
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
