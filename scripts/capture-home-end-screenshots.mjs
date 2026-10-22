import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.PREVIEW_URL ?? "http://127.0.0.1:4321";
const outDir =
  process.env.SCREENSHOT_DIR ?? "/opt/cursor/artifacts/screenshots";

const viewports = [
  { width: 1440, height: 900, label: "desktop" },
  { width: 1024, height: 776, label: "tablet" },
  { width: 390, height: 844, label: "mobile" },
];

async function scrollToPageEnd(page) {
  await page.evaluate(() => {
    const max =
      document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.max(0, max));
  });
  await page.waitForTimeout(250);
}

async function assertEndLayout(page) {
  return page.evaluate(() => {
    const nav = document.querySelector(".home-navbar");
    const navBottom = nav?.getBoundingClientRect().bottom ?? 64;
    const index = document.getElementById("home-closing-index");
    const footer = document.querySelector(".home-footer");
    const book = document.querySelector("#educator .artifact-stage");
    if (!index || !footer) {
      return { ok: false, reason: "missing index or footer" };
    }

    const indexRect = index.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const vh = window.innerHeight;

    const indexInView =
      indexRect.top >= navBottom - 1 && indexRect.bottom <= vh + 1;
    const footerInView =
      footerRect.top >= navBottom - 1 && footerRect.bottom <= vh + 1;
    const bookSliceHidden =
      !book || getComputedStyle(book).visibility === "hidden";

    const gap = footerRect.top - indexRect.bottom;
    const excessiveGap = gap > 48;

    const ok =
      indexInView &&
      footerInView &&
      bookSliceHidden &&
      !excessiveGap &&
      gap >= -4;

    return {
      ok,
      indexInView,
      footerInView,
      bookSliceHidden,
      gap: Math.round(gap),
      excessiveGap,
      indexTop: Math.round(indexRect.top),
      footerBottom: Math.round(footerRect.bottom),
      vh,
      navBottom: Math.round(navBottom),
    };
  });
}

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
let failed = false;

for (const { width, height, label } of viewports) {
  const page = await browser.newPage({
    viewport: { width, height },
    reducedMotion: "reduce",
  });
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "true";
  });

  await scrollToPageEnd(page);
  const layout = await assertEndLayout(page);

  const file = path.join(outDir, `homepage-end-${label}.png`);
  await page.screenshot({ path: file, animations: "disabled" });
  console.log(`Wrote ${file}`);

  if (!layout.ok) {
    failed = true;
    console.error(`FAIL end layout ${label}`, JSON.stringify(layout));
  } else {
    console.log(`OK end layout ${label}`, JSON.stringify(layout));
  }

  await page.close();
}

await browser.close();

if (failed) process.exit(1);
console.log("Done.");
