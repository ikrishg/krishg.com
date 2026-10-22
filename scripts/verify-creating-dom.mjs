#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.PREVIEW_URL ?? "http://localhost:4321";
const outDir = path.resolve("artifacts/creating-verify");

function url(pathname) {
  const u = new URL(base);
  u.pathname = pathname;
  return u.toString();
}

/** @typedef {{ name: string, pass: boolean, note?: string }} Check */

async function mouseOpenTrials(page, viewName, selector) {
  await page.getByRole("button", { name: new RegExp(`^${viewName}$`, "i") }).click();
  await page.waitForTimeout(700);
  let opens = 0;
  for (let i = 0; i < 10; i += 1) {
    const card = page.locator(`${selector} .creating-card__open`).nth(i % 6);
    await card.click({ timeout: 5000 });
    await page.waitForTimeout(400);
    if (await page.locator(".creating-detail").isVisible()) opens += 1;
    await page.getByRole("button", { name: /close/i }).click();
    await page.waitForTimeout(450);
  }
  return opens;
}

async function runSuite(context, tag, { touch }) {
  const page = await context.newPage();
  const checks = /** @type {Check[]} */ ([]);
  const consoleErrors = [];

  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  const networkJs = [];
  page.on("response", async (res) => {
    const u = res.url();
    if (u.includes("/_astro/") && u.endsWith(".js")) networkJs.push(u);
  });

  await page.goto(url("/creating"), { waitUntil: "networkidle" });
  await page.waitForSelector(".creating-surface", { timeout: 30_000 });

  const navBg = await page.locator(".home-navbar").evaluate((el) =>
    getComputedStyle(el).backgroundColor,
  );
  checks.push({
    name: "navbar-red-background",
    pass: navBg === "rgb(185, 74, 63)",
    note: navBg,
  });

  const threeChunk = networkJs.some((u) => /three-vendor/i.test(u));
  checks.push({
    name: "network-no-three-chunk",
    pass: !threeChunk,
    note: threeChunk ? networkJs.filter((u) => /three/i.test(u)).join(", ") : "ok",
  });

  const domStats = await page.evaluate(() => ({
    cards: document.querySelectorAll("[data-flip-id]").length,
    hasCanvas: Boolean(document.querySelector(".creating-canvas-wrap canvas")),
    verify: window.__creatingVerify?.(),
  }));
  checks.push({
    name: "dom-gallery-mounted",
    pass: domStats.cards === 30,
    note: JSON.stringify(domStats),
  });
  checks.push({
    name: "no-webgl-canvas",
    pass: domStats.hasCanvas === false,
  });

  if (!touch && tag === "1440") {
    const galleryOpens = await mouseOpenTrials(
      page,
      "Gallery",
      '[data-view-region="gallery"]',
    );
    checks.push({
      name: "mouse-open-gallery-10",
      pass: galleryOpens === 10,
      note: String(galleryOpens),
    });
    const listicleOpens = await mouseOpenTrials(
      page,
      "Listicle",
      ".creating-listicle-dom",
    );
    checks.push({
      name: "mouse-open-listicle-10",
      pass: listicleOpens === 10,
      note: String(listicleOpens),
    });
    const timelineOpens = await mouseOpenTrials(
      page,
      "Timeline",
      ".creating-timeline__track",
    );
    checks.push({
      name: "mouse-open-timeline-10",
      pass: timelineOpens === 10,
      note: String(timelineOpens),
    });
  }

  if (touch && tag === "390") {
    await page.getByRole("button", { name: /^Timeline$/i }).click();
    await page.waitForTimeout(600);
    const card = page.locator(".creating-timeline__track .creating-card__open").first();
    await card.tap();
    await page.waitForTimeout(700);
    checks.push({
      name: "touch-open-timeline",
      pass: await page.locator(".creating-detail").isVisible(),
    });
    await page.getByRole("button", { name: /close/i }).click();
    await page.waitForTimeout(500);
  }

  await page.getByRole("button", { name: /^Poetry$/i }).click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".creating-flip-root .creating-card").length ===
      6,
    { timeout: 8000 },
  );
  const poetryCount = await page.evaluate(
    () => document.querySelectorAll(".creating-flip-root .creating-card").length,
  );
  checks.push({
    name: "filter-poetry",
    pass: poetryCount === 6,
    note: String(poetryCount),
  });
  await page.getByRole("button", { name: /^All$/i }).click();
  await page.waitForTimeout(600);

  const card = page.locator(".creating-card__open").first();
  await card.click();
  await page.waitForTimeout(900);
  checks.push({
    name: "detail-opens",
    pass: await page.locator(".creating-detail").isVisible(),
  });
  await page.getByRole("button", { name: /close/i }).click();
  await page.waitForTimeout(700);
  checks.push({
    name: "detail-closes",
    pass: !(await page.locator(".creating-detail").isVisible()),
  });

  await card.click();
  await page.waitForTimeout(700);
  await page.goBack();
  await page.waitForTimeout(900);
  checks.push({
    name: "browser-back-closes-detail",
    pass: !(await page.locator(".creating-detail").isVisible()),
  });

  const tabStops = await page.evaluate(() => {
    const hidden = document.querySelector(".creating-works-index");
    return hidden ? hidden.querySelectorAll("button").length : 0;
  });
  checks.push({
    name: "no-hidden-index-tabstops",
    pass: tabStops === 0,
    note: String(tabStops),
  });

  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(40);
  }
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  checks.push({
    name: "keyboard-enter-opens",
    pass: await page.locator(".creating-detail").isVisible(),
  });

  const glErrors = consoleErrors.filter(
    (t) => !/favicon/i.test(t) && !/Outdated Optimize Dep/i.test(t),
  );
  checks.push({
    name: "console-clean",
    pass: glErrors.length === 0,
    note: glErrors.slice(0, 2).join("; "),
  });

  await page.close();
  return checks.map((c) => ({ viewport: tag, ...c }));
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: false });
const table = [];
for (const { tag, width, height, touch } of [
  { tag: "1440", width: 1440, height: 900, touch: false },
  { tag: "390", width: 390, height: 844, touch: true },
]) {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: touch,
  });
  table.push(...(await runSuite(context, tag, { touch })));
  await context.close();
}
await browser.close();

const failed = table.filter((r) => !r.pass);
console.log("| viewport | check | pass | note |");
console.log("|---|---|---|---|");
for (const row of table) {
  console.log(
    `| ${row.viewport} | ${row.name} | ${row.pass ? "PASS" : "FAIL"} | ${row.note ?? ""} |`,
  );
}
await writeFile(
  path.join(outDir, "dom-verify.json"),
  JSON.stringify({ table, failed: failed.length }, null, 2),
);
process.exit(failed.length > 0 ? 1 : 0);
