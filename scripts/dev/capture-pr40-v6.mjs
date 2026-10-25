/**
 * PR40 v6 screenshots + layout metrics (1.5s settle).
 * PREVIEW_URL=http://127.0.0.1:4321 node scripts/dev/capture-pr40-v6.mjs
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { measureDesktopVisibleGaps } from "./measure-closing-visible-gaps.mjs";

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4321";
const OUT = "/opt/cursor/artifacts/pr40-v6";
const SETTLE_MS = 1500;
const D1CFE80_CURSOR_BASELINE = {
  768: 5,
  1024: 6,
  1280: 6,
  1440: 6,
};

async function waitSettled(page) {
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "1";
  });
  await page.waitForFunction(
    () => document.documentElement.dataset.logoMorph !== "pending",
    { timeout: 20_000 },
  );
}

async function scrollToClosing(page) {
  await waitSettled(page);
  await page.evaluate(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.max(0, max));
  });
  await page.waitForTimeout(SETTLE_MS);
}

async function measureInkGaps(page, isMobile) {
  return page.evaluate((mobile) => {
    const inkVerticalBounds = (el) => {
      if (!el) return null;
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()];
      if (!rects.length) {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      }
      return {
        top: Math.min(...rects.map((r) => r.top)),
        bottom: Math.max(...rects.map((r) => r.bottom)),
      };
    };
    const unionInk = (elements) => {
      let top = Infinity;
      let bottom = -Infinity;
      for (const el of elements) {
        const b = inkVerticalBounds(el);
        if (!b) continue;
        top = Math.min(top, b.top);
        bottom = Math.max(bottom, b.bottom);
      }
      if (!Number.isFinite(top)) return null;
      return { top, bottom };
    };
    const navBottom =
      document.querySelector(".home-navbar")?.getBoundingClientRect().bottom ??
      64;
    const vh = window.innerHeight;
    if (mobile) {
      const blocks = [
        ...document.querySelectorAll(".home-closing-link--mobile"),
      ];
      const lastBlock = blocks[blocks.length - 1];
      const email = document.querySelector(".home-footer__email");
      const pills = [...document.querySelectorAll(".home-footer__social-pill")];
      if (!lastBlock || !email || pills.length < 2) {
        return { gaps: [], pillGap: null };
      }
      const lastRect = lastBlock.getBoundingClientRect();
      const emailRect = email.getBoundingClientRect();
      const pillRects = pills.map((p) => p.getBoundingClientRect());
      return {
        gaps: [
          emailRect.top - lastRect.bottom,
          pillRects[0].top - emailRect.bottom,
          vh - pillRects[pillRects.length - 1].bottom,
        ],
        pillGap: pillRects[1].top - pillRects[0].bottom,
      };
    }
    const navInk = inkVerticalBounds(
      document.querySelector(".home-closing-nav-row"),
    );
    const primaryInk = unionInk([
      ...document.querySelectorAll("a.home-closing-link--primary"),
    ]);
    const emailInk = inkVerticalBounds(
      document.querySelector(".home-footer__email-text"),
    );
    const socialInk = unionInk([
      ...document.querySelectorAll(".home-footer__social-pill-label"),
    ]);
    const tailBottom =
      document.querySelector(".home-closing-tail")?.getBoundingClientRect()
        .bottom ?? vh;
    return {
      gaps: [
        navInk.top - navBottom,
        primaryInk.top - navInk.bottom,
        emailInk.top - primaryInk.bottom,
        socialInk.top - emailInk.bottom,
        tailBottom - socialInk.bottom,
      ],
    };
  }, isMobile);
}

async function countSettledCursors(page) {
  return page.evaluate(() => {
    const cursors = [...document.querySelectorAll(".home-drifting-cursor")];
    const visible = cursors.filter((el) => {
      const parts = [
        el,
        ...el.querySelectorAll(
          ".home-drifting-cursor__ptr, .home-drifting-cursor__tag",
        ),
      ];
      return parts.some((part) => {
        const r = part.getBoundingClientRect();
        const opacity = getComputedStyle(part).opacity;
        return r.width > 2 && r.height > 2 && opacity !== "0";
      });
    }).length;
    return Math.max(cursors.length, visible);
  });
}

async function findOverlapScrollY(page) {
  const { tailTop, maxScroll } = await page.evaluate(() => ({
    tailTop: Math.round(
      document.querySelector(".home-closing-tail").getBoundingClientRect().top +
        window.scrollY,
    ),
    maxScroll: document.documentElement.scrollHeight - window.innerHeight,
  }));
  for (let y = Math.max(0, tailTop - 400); y <= maxScroll; y += 16) {
    await page.evaluate((scrollY) => {
      window.scrollTo(0, scrollY);
      window.dispatchEvent(new Event("scroll"));
    }, y);
    await page.waitForTimeout(120);
    const bad = await page.evaluate(() => {
      const nav = document.querySelector(".home-navbar");
      const navBg = getComputedStyle(nav).backgroundColor;
      const underY = nav.getBoundingClientRect().bottom + 2;
      const hit = document
        .elementsFromPoint(window.innerWidth / 2, underY)
        .map((el) => el.closest(".home-closing-link--mobile"))
        .find(Boolean);
      if (!hit) return false;
      const bandBg = getComputedStyle(hit).backgroundColor;
      const parse = (css) => {
        const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return m
          ? [Number(m[1]), Number(m[2]), Number(m[3])]
          : null;
      };
      const a = parse(navBg);
      const b = parse(bandBg);
      if (!a || !b) return false;
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      return d > 36;
    });
    if (bad) return y;
  }
  return maxScroll;
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}`, fullPage: false });
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const metrics = {
  textGapsByWidth: {},
  cursorCountsByWidth: {},
  d1cfe80CursorBaseline: D1CFE80_CURSOR_BASELINE,
  emailLinkWidth: {},
  desktopPillGap: {},
};

for (const { w, h, mobile, shots } of [
  {
    w: 1280,
    h: 800,
    mobile: false,
    shots: ["1280x800-rest.png", "1280x800-hover-educating.png"],
  },
  { w: 1440, h: 900, mobile: false, shots: ["1440x900-rest.png"] },
  { w: 1024, h: 776, mobile: false, shots: ["1024x776-rest.png"] },
  { w: 768, h: 1024, mobile: false, shots: ["768x1024-rest.png"] },
  { w: 390, h: 844, mobile: true, shots: ["390x844-rest.png"] },
]) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120_000 });
  await scrollToClosing(page);
  const ink = mobile
    ? await measureInkGaps(page, mobile)
    : await measureDesktopVisibleGaps(page);
  metrics.textGapsByWidth[`${w}x${h}`] = (ink.gaps ?? []).map((g) =>
    Math.round(g),
  );
  if (!mobile) {
    const visible = await countSettledCursors(page);
    metrics.cursorCountsByWidth[`${w}x${h}`] = {
      visible,
      d1cfe80: D1CFE80_CURSOR_BASELINE[w],
    };
    const emailMetrics = await page.evaluate(() => {
      const email = document.querySelector(".home-footer__email");
      const text = document.querySelector(".home-footer__email-text");
      return {
        linkWidth: Math.round(email.getBoundingClientRect().width),
        textWidth: Math.round(text.getBoundingClientRect().width),
      };
    });
    metrics.emailLinkWidth[`${w}x${h}`] = emailMetrics;
    const pills = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll(".home-footer__social-pill")];
      const a = nodes[0].getBoundingClientRect();
      const b = nodes[1].getBoundingClientRect();
      return Math.round(b.left - a.right);
    });
    metrics.desktopPillGap[`${w}x${h}`] = pills;
  } else if (ink.pillGap != null) {
    metrics.desktopPillGap[`${w}x${h}`] = Math.round(ink.pillGap);
  }
  await shot(page, shots[0]);
  if (shots.includes("1280x800-hover-educating.png")) {
    await page
      .locator("a.home-closing-link--primary", { hasText: "educating" })
      .first()
      .hover();
    await page.waitForTimeout(SETTLE_MS);
    await shot(page, "1280x800-hover-educating.png");
  }
  await ctx.close();
}

for (const w of [375, 430]) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120_000 });
  await waitSettled(page);
  const y = await findOverlapScrollY(page);
  await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
  await page.waitForTimeout(SETTLE_MS);
  await shot(page, `${w}x844-nav-band-step.png`);
  await ctx.close();
}

await writeFile(`${OUT}/layout-metrics.json`, JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(metrics, null, 2));
await browser.close();
