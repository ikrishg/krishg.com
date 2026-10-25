/**
 * After bottom overscroll (wheel or touch), nav accent must match band under nav within ~300ms.
 */
import { RESOLVE_BAND_UNDER_NAV_SOURCE } from "./mobile-nav-band-resolve.mjs";

export async function sampleNavVsBand(page) {
  return page.evaluate((resolveSrc) => {
    // eslint-disable-next-line no-eval
    eval(resolveSrc);
    const nav = document.querySelector(".home-navbar");
    const navBg = nav ? getComputedStyle(nav).backgroundColor : "";
    const band = resolveBandUnderMobileNav();
    let expectedAccent = "";
    let bandBg = "";
    const tail = document.querySelector(".home-closing-tail");
    const tailAtRest =
      tail &&
      tail.getBoundingClientRect().top <= 66 &&
      tail.getBoundingClientRect().bottom >= window.innerHeight - 2;
    if (band?.theme) {
      expectedAccent = band.theme;
      bandBg = band.bandBg;
    } else if (tailAtRest) {
      expectedAccent = "closing";
      bandBg = "rgb(231, 221, 204)";
    }
    const pageAccent = document.documentElement.dataset.pageAccent ?? "";
    const parse = (css) => {
      const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
    };
    const a = parse(navBg);
    const b = parse(bandBg);
    const colorClose =
      a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 40 : false;
    return {
      pageAccent,
      expectedAccent,
      accentMatch: Boolean(expectedAccent) && pageAccent === expectedAccent,
      navBg,
      bandBg,
      colorClose,
      ok:
        Boolean(expectedAccent) &&
        pageAccent === expectedAccent &&
        colorClose,
      key: null,
    };
  }, RESOLVE_BAND_UNDER_NAV_SOURCE);
}

async function waitForNavMatch(page, timeoutMs = 500) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await sampleNavVsBand(page);
    if (last.ok) {
      return { ok: true, settledMs: Date.now() - start, sample: last };
    }
    await page.waitForTimeout(40);
  }
  return { ok: false, settledMs: Date.now() - start, sample: last };
}

async function scrollToBottom(page) {
  await page.evaluate(async () => {
    document.documentElement.dataset.introSkip = "1";
    const target = () =>
      Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    for (let i = 0; i < 24; i += 1) {
      const max = target();
      window.scrollTo(0, max);
      window.dispatchEvent(new Event("scroll"));
      if (Math.abs(window.scrollY - max) < 2) break;
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  await page
    .waitForFunction(
      () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        return Math.abs(window.scrollY - max) < 3;
      },
      { timeout: 8000 },
    )
    .catch(() => {});
  await page.waitForTimeout(350);
}

async function waitOverscrollSettled(page, timeoutMs = 2500) {
  await page
    .waitForFunction(
      () => {
        const root = document.documentElement;
        const surface = document.querySelector(".home-scroll-surface");
        const pulling =
          root.dataset.overscrollPulling === "true" ||
          root.dataset.overscrollReveal === "true" ||
          surface?.dataset.overscrollPulling === "true";
        return !pulling;
      },
      { timeout: timeoutMs },
    )
    .catch(() => {});
  await page.waitForTimeout(120);
}

export async function assertOverscrollNavWheel(page) {
  await scrollToBottom(page);
  await page.mouse.wheel(0, -500);
  await page.waitForTimeout(80);
  await page.mouse.wheel(0, -500);
  await page.waitForTimeout(80);
  for (let i = 0; i < 4; i += 1) {
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(60);
  }
  await waitOverscrollSettled(page);
  await scrollToBottom(page);
  const during = await sampleNavVsBand(page);
  const after = await waitForNavMatch(page, 600);
  return { mode: "wheel", during, after };
}

export async function assertOverscrollNavTouch(page, viewport) {
  await scrollToBottom(page);
  const cx = Math.round(viewport.width / 2);
  const cy = Math.round(viewport.height * 0.72);
  await page.evaluate(
    ({ x, startY, endY }) => {
      const surface = document.querySelector(".home-scroll-surface");
      if (!surface) return;
      const mkTouch = (clientY) =>
        new Touch({
          identifier: 1,
          target: surface,
          clientX: x,
          clientY,
          pageX: x,
          pageY: clientY,
        });
      const start = mkTouch(startY);
      surface.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          cancelable: true,
          touches: [start],
          targetTouches: [start],
          changedTouches: [start],
        }),
      );
      const move = mkTouch(endY);
      surface.dispatchEvent(
        new TouchEvent("touchmove", {
          bubbles: true,
          cancelable: true,
          touches: [move],
          targetTouches: [move],
          changedTouches: [move],
        }),
      );
      surface.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          cancelable: true,
          touches: [],
          targetTouches: [],
          changedTouches: [move],
        }),
      );
    },
    { x: cx, startY: cy, endY: cy - 140 },
  );
  await page.waitForTimeout(350);
  await waitOverscrollSettled(page);
  const during = await sampleNavVsBand(page);
  const after = await waitForNavMatch(page, 600);
  return { mode: "touch", during, after };
}

export async function runMobileOverscrollNavGate(browser, baseUrl) {
  const probes = [];
  let ok = true;
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 767, height: 1024 },
  ]) {
    for (const mode of ["wheel", "touch"]) {
      const ctx = await browser.newContext({
        viewport,
        deviceScaleFactor: 1,
        hasTouch: mode === "touch",
      });
      const page = await ctx.newPage();
      await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120_000 });
      await page.evaluate(() => {
        document.documentElement.dataset.introSkip = "1";
      });
      const result =
        mode === "wheel"
          ? await assertOverscrollNavWheel(page)
          : await assertOverscrollNavTouch(page, viewport);
      const row = {
        viewport: `${viewport.width}x${viewport.height}`,
        ...result,
        ok: result.after.ok,
      };
      if (!row.ok) ok = false;
      probes.push(row);
      await ctx.close();
    }
  }
  return { ok, probes };
}
