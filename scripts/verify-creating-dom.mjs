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

async function runSuite(context, tag) {
  const page = await context.newPage();
  const checks = /** @type {Check[]} */ ([]);
  const consoleErrors = [];

  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

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

  const paper = await page.evaluate(() =>
    getComputedStyle(document.querySelector(".creating-page") ?? document.body)
      .backgroundColor,
  );
  checks.push({
    name: "page-beige-background",
    pass: paper === "rgb(231, 221, 204)",
    note: paper,
  });

  const surface = await page.locator(".creating-surface").evaluate((el) =>
    getComputedStyle(el).backgroundColor,
  );
  checks.push({
    name: "gallery-red-surface",
    pass: surface === "rgb(185, 74, 63)",
    note: surface,
  });

  const verify = await page.evaluate(() => window.__creatingVerify?.());
  checks.push({
    name: "dom-gallery-mounted",
    pass: verify?.domOnly === true && verify?.entryCount === 30,
    note: JSON.stringify(verify),
  });
  checks.push({
    name: "no-webgl-canvas",
    pass: verify?.hasCanvas === false,
  });

  await page.getByRole("button", { name: /^Poetry$/i }).click();
  await page.waitForTimeout(800);
  checks.push({
    name: "filter-poetry",
    pass:
      (await page.evaluate(() => window.__creatingVerify?.().filteredCount)) ===
      6,
  });
  await page.getByRole("button", { name: /^All$/i }).click();
  await page.waitForTimeout(600);

  await page.getByRole("button", { name: /^Listicle$/i }).click();
  await page.waitForTimeout(900);
  checks.push({
    name: "view-listicle",
    pass: await page.locator(".creating-listicle-dom").isVisible(),
  });

  await page.getByRole("button", { name: /^Timeline$/i }).click();
  await page.waitForTimeout(900);
  checks.push({
    name: "view-timeline",
    pass: await page.locator(".creating-timeline__track").isVisible(),
  });

  await page.getByRole("button", { name: /^Gallery$/i }).click();
  await page.waitForTimeout(700);

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

  for (let i = 0; i < 20; i += 1) {
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
  table.push(...(await runSuite(context, tag)));
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
