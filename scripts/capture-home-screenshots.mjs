import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.PREVIEW_URL ?? "http://127.0.0.1:4321";
const outDir =
  process.env.SCREENSHOT_DIR ?? "/opt/cursor/artifacts/screenshots";

const widthLabels = {
  1440: "desktop",
  1024: "tablet",
  390: "mobile",
};

const widths = Object.keys(widthLabels).map(Number);

const shots = [
  { name: "homepage-navbar", selector: ".home-navbar", scroll: 0 },
  {
    name: "homepage-hero-builder",
    selector: "#builder",
    scroll: null,
    artifact: true,
  },
  {
    name: "homepage-hero-creator",
    selector: "#creator",
    scroll: null,
    artifact: true,
  },
  {
    name: "homepage-hero-educator",
    selector: "#educator",
    scroll: null,
    artifact: true,
  },
  {
    name: "homepage-closing-index",
    selector: "#home-closing-index",
    scroll: null,
  },
  { name: "homepage-footer", selector: ".home-footer", scroll: null },
  {
    name: "homepage-navbar-search",
    selector: ".home-navbar-search__panel",
    scroll: 0,
    openSearch: true,
  },
];

async function waitForArtifactReady(page, sectionSelector) {
  const stage = page.locator(`${sectionSelector} .artifact-stage`);
  await stage.waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(`${sel} .artifact-stage`);
      return el?.getAttribute("data-artifact-ready") === "true";
    },
    sectionSelector,
    { timeout: 90_000 },
  );
  await page.waitForTimeout(400);
}

async function verifyCanvasPanY(page, sectionSelector) {
  const stage = page.locator(`${sectionSelector} .artifact-stage`);
  await stage.scrollIntoViewIfNeeded();
  const canvas = page.locator(`${sectionSelector} .artifact-stage canvas`);
  const engaged = await stage.getAttribute("data-krish-engaged");
  const touchAction = await canvas.evaluate((el) => {
    const parent = el.parentElement;
    return {
      canvas: getComputedStyle(el).touchAction,
      parent: parent ? getComputedStyle(parent).touchAction : "",
    };
  });
  if (engaged !== "false") {
    throw new Error(`${sectionSelector} should be unengaged before pan-y check`);
  }
  if (!`${touchAction.canvas} ${touchAction.parent}`.includes("pan-y")) {
    throw new Error(
      `${sectionSelector} touch-action not pan-y: ${JSON.stringify(touchAction)}`,
    );
  }
  console.log(`${sectionSelector} touch-action pan-y when idle (ok)`);
}

async function verifyWheelScroll(page) {
  const before = await page.evaluate(() => window.scrollY);
  const book = page.locator("#educator .artifact-stage canvas");
  await book.scrollIntoViewIfNeeded();
  const box = await book.boundingBox();
  if (!box) throw new Error("book canvas box missing");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => window.scrollY);
  if (after <= before) {
    throw new Error(
      `wheel over unengaged book did not scroll: before=${before} after=${after}`,
    );
  }
  console.log(
    `Wheel scroll over unengaged book: ${before}px -> ${after}px (ok)`,
  );
}

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  deviceScaleFactor: 1,
  reducedMotion: "no-preference",
});

for (const width of widths) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });

  const overflow = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  if (overflow.sw > overflow.cw) {
    console.warn(
      `[${width}px] horizontal overflow: scrollWidth=${overflow.sw} clientWidth=${overflow.cw}`,
    );
  } else {
    console.log(`[${width}px] no horizontal overflow`);
  }

  if (width === 1440) {
    await verifyWheelScroll(page);
  }

  if (width === 390) {
    for (const sel of ["#builder", "#creator", "#educator"]) {
      await page.locator(sel).scrollIntoViewIfNeeded();
      await waitForArtifactReady(page, sel);
    }
    for (const sel of ["#builder", "#creator"]) {
      try {
        await verifyCanvasPanY(page, sel);
      } catch (error) {
        console.warn(`[${width}px] ${error.message} (continuing screenshots)`);
      }
    }
  }

  const suffix = widthLabels[width];

  for (const shot of shots) {
    const el = page.locator(shot.selector);
    if (shot.openSearch) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
      await page.getByRole("button", { name: "Search site" }).click();
      await el.waitFor({ state: "visible", timeout: 10_000 });
    } else {
      await el.waitFor({ state: "visible", timeout: 30_000 });
    }
    if (shot.openSearch) {
      await page.waitForTimeout(200);
    } else if (shot.scroll === null) {
      await el.scrollIntoViewIfNeeded();
      if (shot.artifact) {
        await waitForArtifactReady(page, shot.selector);
      } else {
        await page.waitForTimeout(300);
      }
    } else {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
    }
    const file = path.join(outDir, `${shot.name}-${suffix}.png`);
    await el.screenshot({ path: file, animations: "disabled", timeout: 90_000 });
    console.log(`Wrote ${file}`);
  }

  await page.close();
}

await browser.close();
console.log("Done.");
