import { chromium } from "playwright";

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4321";

async function runViewport(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "1";
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await page.waitForTimeout(300);

  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(400);

  const pull = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue(
      "--home-overscroll-pull",
    ),
  );
  const maxPull = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue(
      "--home-overscroll-max-pull",
    ),
  );

  return {
    width,
    pullPx: Number.parseFloat(pull) || 0,
    maxPullPx: Number.parseFloat(maxPull) || 0,
    errors,
  };
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const results = [];
  try {
    results.push(await runViewport(page, 1440, 900));
    results.push(await runViewport(page, 390, 844));
  } finally {
    await browser.close();
  }
  const allErrors = results.flatMap((r) => r.errors);
  console.log(JSON.stringify({ results, allErrors }, null, 2));
  if (allErrors.length) process.exit(1);
}

main();
