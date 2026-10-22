import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

function pageUrl(base, pathname) {
  const u = new URL(base);
  u.pathname = pathname;
  return u.toString();
}

const base = process.env.PREVIEW_URL ?? "http://localhost:4321";
const outDir = path.resolve("artifacts/creating-screenshots");

const shots = [
  { name: "desktop-1440-gallery", width: 1440, height: 900, click: null },
  { name: "desktop-1440-listicle", width: 1440, height: 900, click: "Listicle" },
  { name: "desktop-1440-timeline", width: 1440, height: 900, click: "Timeline" },
  { name: "desktop-1440-filter", width: 1440, height: 900, click: "Poetry" },
  { name: "desktop-1440-detail", width: 1440, height: 900, detail: true },
  { name: "mobile-390-gallery", width: 390, height: 844, click: null },
  { name: "mobile-390-listicle", width: 390, height: 844, click: "Listicle" },
  { name: "mobile-390-timeline", width: 390, height: 844, click: "Timeline" },
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();

async function enterGallery(page) {
  await page.goto(pageUrl(base, "/creating"), { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const enter = page.getByRole("button", { name: "Enter" });
  if (await enter.isVisible().catch(() => false)) {
    await enter.click();
    await page.getByRole("button", { name: /^Gallery$/i }).waitFor({
      timeout: 20_000,
    });
    await page.waitForTimeout(800);
  }
}

for (const shot of shots) {
  if (shot.detail) continue;
  const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height } });
  await enterGallery(page);
  if (shot.click) {
    await page.getByRole("button", { name: new RegExp(`^${shot.click}$`, "i") }).click();
    await page.waitForTimeout(2500);
  }
  await page.screenshot({
    path: path.join(outDir, `${shot.name}.png`),
    fullPage: false,
  });
  console.log("Wrote", shot.name);
  await page.close();
}

const detailPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await enterGallery(detailPage);
await detailPage.locator("canvas").click({ position: { x: 700, y: 450 } });
await detailPage.waitForTimeout(2000);
await detailPage.screenshot({
  path: path.join(outDir, "desktop-1440-detail.png"),
});
console.log("Wrote desktop-1440-detail");
await detailPage.close();

await browser.close();
