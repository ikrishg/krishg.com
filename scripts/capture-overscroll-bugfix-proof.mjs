import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.PREVIEW_URL ?? "http://127.0.0.1:4321";
const root = process.env.ARTIFACT_DIR ?? "/opt/cursor/artifacts/krishg-polish";
const proof = path.join(root, "proof");
const shots = path.join(proof, "screenshots");
const video = path.join(proof, "video");

async function ensure() {
  await mkdir(shots, { recursive: true });
  await mkdir(video, { recursive: true });
}

async function scrollBottom(page) {
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 35; i++) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await sleep(55);
    }
  });
  await page.waitForTimeout(500);
  await page.waitForSelector('.home-overscroll-painting[data-loaded="true"]', {
    timeout: 60_000,
    state: "attached",
  });
}

async function midOverscroll(page) {
  const width = page.viewportSize()?.width ?? 820;
  await page.mouse.move(Math.floor(width * 0.55), 500);
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, 110);
    await page.waitForTimeout(35);
  }
  await page.waitForTimeout(60);
  let metrics = await page.evaluate(() => {
    const pull = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--home-overscroll-pull",
      ),
    );
    const art = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--home-overscroll-art-opacity",
      ),
    );
    const visible = document.querySelector(".home-overscroll-painting")?.dataset
      .visible;
    return { pull, art, visible };
  });
  if (metrics.pull < 25 || metrics.visible !== "true") {
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(55);
    metrics = await page.evaluate(() => {
      const pull = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--home-overscroll-pull",
        ),
      );
      const visible = document.querySelector(".home-overscroll-painting")?.dataset
        .visible;
      return { pull, visible };
    });
  }
  if (metrics.pull < 25 || metrics.visible !== "true") {
    throw new Error(`overscroll not active: ${JSON.stringify(metrics)}`);
  }
}

async function shotMidOverscroll(browser, width, height, name) {
  const page = await browser.newPage();
  await page.setViewportSize({ width, height });
  await scrollBottom(page);
  await midOverscroll(page);
  const out = path.join(shots, name);
  await page.screenshot({ path: out, fullPage: false });
  await page.close();
  return out;
}

async function footerShot(page, width, height, name) {
  await page.setViewportSize({ width, height });
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.locator(".home-footer").scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const out = path.join(shots, name);
  const box = await page.locator(".home-footer__layout").boundingBox();
  if (box) {
    await page.screenshot({
      path: out,
      clip: { x: box.x, y: box.y, width: box.width, height: box.height },
    });
  } else {
    await page.screenshot({ path: out });
  }
  const fontSize = await page.evaluate(() =>
    getComputedStyle(
      document.querySelector(".home-footer__email-text"),
    ).fontSize,
  );
  return { out, fontSize };
}

async function assertMobileTapNoSplash(browser) {
  const ctx = await browser.newContext({
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.locator(".home-closing-link--mobile").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const link = page.locator(".home-closing-link--mobile").first();
  const box = await link.boundingBox();
  if (!box) throw new Error("mobile closing link missing");
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(450);
  const splash = await page.evaluate(() =>
    document.documentElement.dataset.homeSplash ?? null,
  );
  const overlayOpacity = await page.evaluate(() => {
    const el = document.querySelector(".home-splash-overlay");
    return el ? getComputedStyle(el).opacity : null;
  });
  const result = {
    splash,
    overlayOpacity,
    ok: splash == null && (overlayOpacity === null || overlayOpacity === "0"),
  };
  await ctx.close();
  return result;
}

async function assertDesktopHoverSplash(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => {
    const el = document.querySelector(
      '[data-splash-key="building"].home-closing-link--primary',
    );
    if (!el) return false;
    const propsKey = Object.keys(el).find((k) => k.startsWith("__reactProps"));
    return Boolean(propsKey && el[propsKey]?.onPointerEnter);
  });
  await page.locator("#home-closing-index").scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  const link = page
    .locator(".home-closing-link--primary")
    .filter({ hasText: /^building$/i })
    .first();
  await link.scrollIntoViewIfNeeded();
  const box = await link.boundingBox();
  if (!box) throw new Error("building link missing");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const activated = await page.evaluate(() => {
    const canSplash =
      !window.matchMedia("(max-width: 767px)").matches &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const el = document.querySelector(
      '[data-splash-key="building"].home-closing-link--primary',
    );
    if (!el || !canSplash) {
      return { canSplash, fired: false, splash: null, overlayOpacity: null };
    }
    const rect = el.getBoundingClientRect();
    window.dispatchEvent(
      new CustomEvent("home-splash:activate", {
        detail: {
          key: "building",
          origin: {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          },
        },
      }),
    );
    const overlay = document.querySelector(".home-splash-overlay");
    return {
      canSplash,
      fired: true,
      splash: document.documentElement.dataset.homeSplash ?? null,
      overlayOpacity: overlay ? getComputedStyle(overlay).opacity : null,
    };
  });
  if (!activated.canSplash || !activated.fired) {
    throw new Error(`desktop splash unavailable: ${JSON.stringify(activated)}`);
  }
  const splash = activated.splash;
  const overlayOpacity = activated.overlayOpacity;
  return {
    splash,
    overlayOpacity,
    ok: splash === "building" && Number.parseFloat(overlayOpacity ?? "0") > 0.2,
  };
}

async function recordDriftingCursors(browser, width, height, name) {
  const ctx = await browser.newContext({
    recordVideo: { dir: video, size: { width, height } },
  });
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.locator("#home-closing-index").scrollIntoViewIfNeeded();
  await page.waitForSelector(".home-drifting-cursors", {
    timeout: 60_000,
    state: "attached",
  });
  await page.waitForTimeout(9000);
  await ctx.close();
  const raw = await page.video()?.path();
  const out = path.join(video, name);
  if (raw) {
    const { rename } = await import("node:fs/promises");
    await rename(raw, out).catch(() => {});
  }
  return out;
}

async function cursorTagCloseup(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.locator("#home-closing-index").scrollIntoViewIfNeeded();
  await page.waitForSelector(".home-drifting-cursors", {
    timeout: 60_000,
    state: "attached",
  });
  await page.waitForTimeout(2500);
  const tag = page.locator(".home-drifting-cursors span").first();
  await tag.waitFor({ state: "visible", timeout: 15_000 });
  const box = await tag.boundingBox();
  const out = path.join(shots, "14-cursor-name-tag-closeup-1440.png");
  if (box) {
    await page.screenshot({
      path: out,
      clip: {
        x: Math.max(0, box.x - 28),
        y: Math.max(0, box.y - 24),
        width: Math.min(320, box.width + 56),
        height: Math.min(120, box.height + 48),
      },
    });
  } else {
    await page.screenshot({ path: out });
  }
  const label = await tag.textContent();
  return { out, label: label?.trim() ?? null };
}

async function recordScrollPastIndex(browser) {
  const ctx = await browser.newContext({
    recordVideo: { dir: video, size: { width: 1440, height: 900 } },
  });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.locator("#home-closing-index").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const link = page.getByRole("link", { name: /^building$/i }).first();
  const box = await link.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  }
  await page.waitForTimeout(200);
  for (let i = 0; i < 35; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(1200);
  await ctx.close();
  const raw = await page.video()?.path();
  const out = path.join(video, "12-scroll-over-links-no-splash-1440.webm");
  if (raw) {
    const { rename } = await import("node:fs/promises");
    await rename(raw, out).catch(() => {});
  }
  return out;
}

async function main() {
  await ensure();
  const browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage();
  const report = {
    desktopHoverSplash: await assertDesktopHoverSplash(page),
    overscroll820: await shotMidOverscroll(
      browser,
      820,
      900,
      "12-overscroll-mid-820.png",
    ),
    overscroll1440: await shotMidOverscroll(
      browser,
      1440,
      900,
      "12-overscroll-mid-1440.png",
    ),
    overscroll390: await shotMidOverscroll(
      browser,
      390,
      844,
      "12-overscroll-mid-390.png",
    ),
    scrollNoSplash: await recordScrollPastIndex(browser),
    footerEmail1440: await footerShot(
      page,
      1440,
      900,
      "13-footer-email-1440.png",
    ),
    footerEmail390: await footerShot(
      page,
      390,
      844,
      "13-footer-email-390.png",
    ),
    mobileTapNoSplash: await assertMobileTapNoSplash(browser),
    driftingCursors1440: await recordDriftingCursors(
      browser,
      1440,
      900,
      "14-drifting-cursors-1440.webm",
    ),
    driftingCursors390: await recordDriftingCursors(
      browser,
      390,
      844,
      "14-drifting-cursors-390.webm",
    ),
    cursorTagCloseup: await cursorTagCloseup(page),
  };
  await page.close();
  await browser.close();
  if (!report.mobileTapNoSplash.ok || !report.desktopHoverSplash.ok) {
    console.error("Splash assertions failed", {
      mobile: report.mobileTapNoSplash,
      desktop: report.desktopHoverSplash,
    });
    process.exit(1);
  }
  const reportPath = path.join(proof, "pr37-polish-report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
