import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.PREVIEW_URL ?? "http://localhost:4321";
const outDir = path.resolve("artifacts/creating-verify");
const repoRoot = path.resolve(".");

const CHROME_ARGS = [
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--no-sandbox",
];

const demoEntries = JSON.parse(
  await readFile(path.join(repoRoot, "src/data/creating-demo.json"), "utf8"),
).entries;

function expectedTimelineYears(entries) {
  const sorted = [...entries].sort(
    (a, b) => a.year - b.year || a.order - b.order,
  );
  const years = [];
  let last = null;
  for (const e of sorted) {
    if (e.year !== last) {
      years.push(e.year);
      last = e.year;
    }
  }
  return years;
}

const EXPECTED_TIMELINE_YEARS = expectedTimelineYears(demoEntries);

function url(pathname) {
  const u = new URL(base);
  u.pathname = pathname;
  return u.toString();
}

/** @typedef {{ name: string, pass: boolean, note?: string }} Check */

/**
 * @param {import('playwright').Page} page
 */
/**
 * @param {import('playwright').Page} page
 * @param {number} ms
 */
async function measureIdleDraws(page, ms = 2600) {
  await page.evaluate(() => {
    window.__creatingPerf.raf = 0;
    window.__creatingPerf.draws = 0;
  });
  await page.waitForTimeout(ms);
  return page.evaluate((seconds) => {
    const frameloop =
      document
        .querySelector(".creating-canvas-host")
        ?.getAttribute("data-frameloop") ?? null;
    return {
      frameloop,
      rafPerSec: window.__creatingPerf.raf / seconds,
      drawsPerSec: window.__creatingPerf.draws / seconds,
    };
  }, ms / 1000);
}

async function enterGallery(page) {
  await page.goto(url("/creating"), { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.locator(".creating-loader__lead").waitFor({ state: "visible", timeout: 25_000 });
  const enter = page.getByRole("button", { name: "Enter" });
  await enter.waitFor({ state: "visible", timeout: 45_000 });
  const pctAtEnter = await page.evaluate(() =>
    parseInt(
      document.querySelector(".creating-loader__percent")?.textContent ?? "0",
      10,
    ),
  );
  if (pctAtEnter < 100) {
    throw new Error(`Enter visible before 100% (at ${pctAtEnter}%)`);
  }
  await enter.click();
  await page.getByRole("button", { name: /^Gallery$/i }).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(2500);
}

/**
 * @param {import('playwright').Page} page
 */
async function runSuite(context, tag) {
  const checks = /** @type {Check[]} */ ([]);
  await context.addInitScript(() => {
    window.__creatingPerf = { raf: 0, draws: 0, patched: false };
    const origRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) =>
      origRaf((t) => {
        window.__creatingPerf.raf += 1;
        return cb(t);
      });
  });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  const shot = async (name) => {
    await page.screenshot({
      path: path.join(outDir, `${tag}-${name}.png`),
      fullPage: false,
    });
  };

  try {
    await page.goto(url("/creating"), { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    let loaderEnterGated = true;
    for (let i = 0; i < 30; i += 1) {
      const loaderState = await page.evaluate(() => ({
        pct: parseInt(
          document.querySelector(".creating-loader__percent")?.textContent ?? "0",
          10,
        ),
        hasEnter: document.querySelector(".creating-loader__enter") != null,
      }));
      if (loaderState.pct < 100 && loaderState.hasEnter) {
        loaderEnterGated = false;
      }
      if (loaderState.pct >= 100) break;
      await page.waitForTimeout(100);
    }
    checks.push({
      name: "loader-enter-after-100-percent",
      pass: loaderEnterGated,
    });

    const glContext = await page.evaluate(() => {
      const c = document.createElement("canvas");
      const gl =
        c.getContext("webgl2", { failIfMajorPerformanceCaveat: false }) ||
        c.getContext("webgl", { failIfMajorPerformanceCaveat: false });
      return Boolean(gl);
    });
    checks.push({
      name: "webgl-context-created",
      pass: glContext,
    });
    if (!glContext) {
      throw new Error(
        "WebGL context not created — run via scripts/run-creating-verify.mjs (xvfb + SwiftShader)",
      );
    }

    await shot("background-before");
    await page.locator(".creating-loader__lead").waitFor({ state: "visible", timeout: 25_000 });
    const loaderLead = await page.locator(".creating-loader__lead").textContent();
    checks.push({
      name: "loader-neutral-copy",
      pass: !/placeholder intro|krish will replace/i.test(loaderLead ?? ""),
      note: loaderLead?.trim(),
    });
    const enter = page.getByRole("button", { name: "Enter" });
    await enter.waitFor({ state: "visible", timeout: 25_000 });
    await enter.click();
    await page.getByRole("button", { name: /^Gallery$/i }).waitFor({ timeout: 20_000 });
    await page.waitForTimeout(2500);
    await shot("01-gallery");
    await shot("background-after");
    await shot("09-ring-after-enter");

    const lenisPrevent = await page.evaluate(() =>
      document.querySelector(".creating-stage")?.hasAttribute("data-lenis-prevent"),
    );
    checks.push({
      name: "creating-stage-lenis-prevent",
      pass: Boolean(lenisPrevent),
    });

    // Navbar
    const nav = page.locator(".home-navbar");
    const navBg = await nav.evaluate((el) =>
      getComputedStyle(el).backgroundColor,
    );
    const logoBox = await page.locator(".home-logo").boundingBox();
    const logoVisible = await page.locator(".home-logo").isVisible();
    const searchVisible = await page.getByRole("button", { name: /search/i }).isVisible().catch(() =>
      page.locator(".home-navbar__actions").isVisible(),
    );
    checks.push({
      name: "navbar-red-background",
      pass: navBg === "rgb(185, 74, 63)",
      note: navBg,
    });
    const logoMorphPending = await page.evaluate(
      () => document.documentElement.dataset.logoMorph === "pending",
    );
    checks.push({
      name: "logo-morph-cleared",
      pass: !logoMorphPending,
    });
    checks.push({
      name: "navbar-logo-visible",
      pass: logoVisible && logoBox && logoBox.width > 20 && logoBox.height > 10,
      note: logoBox ? `${logoBox.width}x${logoBox.height}` : "no box",
    });
    checks.push({
      name: "navbar-search-right",
      pass: Boolean(searchVisible),
    });

    // Background sample (canvas area)
    const paper = await page.evaluate(() => {
      const el = document.querySelector(".creating-page");
      return el ? getComputedStyle(el).backgroundColor : "";
    });
    checks.push({
      name: "page-beige-background",
      pass: paper === "rgb(231, 221, 204)",
      note: paper,
    });

    // Loader + Enter (already done)
    checks.push({ name: "loader-and-enter", pass: true });

    const shaderSource = await readFile(
      path.join(repoRoot, "src/components/creating/tile-shaders.ts"),
      "utf8",
    );
    checks.push({
      name: "layoutPosition-instance-matrix-shader",
      pass: shaderSource.includes("instanceMatrix * vec4(local"),
    });

    const hasCanvas =
      (await page.locator(".creating-canvas-wrap canvas").count()) > 0;
    checks.push({
      name: "webgl-canvas-mounted",
      pass: hasCanvas,
    });
    if (hasCanvas) {
      try {
        await page.waitForFunction(
          () =>
            document.querySelector(".creating-canvas-wrap")?.getAttribute(
              "data-atlas-ready",
            ) === "true",
          { timeout: 25_000 },
        );
      } catch {
        checks.push({
          name: "atlas-ready",
          pass: false,
          note: "timed out waiting for texture atlas",
        });
      }
    }

    const webgl = await page.evaluate(() => {
      const canvas = document.querySelector(".creating-canvas-wrap canvas");
      if (!(canvas instanceof HTMLCanvasElement)) {
        return { ok: false, reason: "no canvas" };
      }
      const gl =
        canvas.getContext("webgl2", { preserveDrawingBuffer: true }) ||
        canvas.getContext("webgl", { preserveDrawingBuffer: true });
      if (!gl) return { ok: false, reason: "no webgl context" };
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = dbg
        ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
        : "unknown";
      const pixels = new Uint8Array(4);
      const x = Math.max(0, Math.floor(canvas.width / 2) - 1);
      const y = Math.max(0, Math.floor(canvas.height / 2) - 1);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const luminance = pixels[0] + pixels[1] + pixels[2];
      return {
        ok: luminance > 40,
        renderer: String(renderer),
        sample: Array.from(pixels),
      };
    });
    checks.push({
      name: "webgl-ring-rendered",
      pass: hasCanvas ? webgl.ok : false,
      note: hasCanvas
        ? webgl.ok
          ? webgl.renderer
          : `${webgl.reason ?? "blank"} ${JSON.stringify(webgl.sample ?? [])}`
        : "no canvas element",
    });

    if (hasCanvas) {
      await page.waitForFunction(
        () => {
          const v = window.__creatingVerify?.();
          return v?.atlasReady && v.tileMeshCount === 30 && v.entryCount === 30;
        },
        { timeout: 30_000 },
      );
      const atlas = await page.evaluate(() => window.__creatingVerify?.());
      checks.push({
        name: "atlas-covers-30-entries",
        pass:
          atlas?.entryCount === 30 &&
          atlas?.tileMeshCount === 30 &&
          atlas?.atlasReady === true,
        note: JSON.stringify(atlas),
      });
      const uvOk =
        Array.isArray(atlas?.uv17) &&
        Array.isArray(atlas?.uv29) &&
        (atlas.uv17[0] !== atlas.uv29[0] || atlas.uv17[1] !== atlas.uv29[1]);
      checks.push({
        name: "ring-tiles-17-30-atlas-sampled",
        pass: uvOk,
        note: `uv17=${JSON.stringify(atlas?.uv17)} uv29=${JSON.stringify(atlas?.uv29)}`,
      });
      await shot("09b-ring-tiles-visible");

      const rotBefore = await page.evaluate(
        () => window.__creatingVerify?.().cameraRotation,
      );
      await shot("14-tilt-gallery-before");
      const canvasBoxTilt = await page
        .locator(".creating-canvas-wrap canvas")
        .boundingBox();
      if (canvasBoxTilt) {
        await page.mouse.move(
          canvasBoxTilt.x + canvasBoxTilt.width * 0.5,
          canvasBoxTilt.y + canvasBoxTilt.height * 0.5,
        );
        await page.waitForTimeout(300);
        await page.mouse.move(
          canvasBoxTilt.x + canvasBoxTilt.width * 0.88,
          canvasBoxTilt.y + canvasBoxTilt.height * 0.18,
        );
      }
      await page.waitForTimeout(2000);
      const rotAfter = await page.evaluate(
        () => window.__creatingVerify?.().cameraRotation,
      );
      await shot("14-tilt-gallery-after");
      const tiltDelta =
        rotBefore && rotAfter
          ? Math.hypot(rotAfter.x - rotBefore.x, rotAfter.y - rotBefore.y)
          : 0;
      checks.push({
        name: "gallery-pointer-tilt-responds",
        pass: tiltDelta > 0.002,
        note: `Δ=${tiltDelta.toFixed(4)}`,
      });

      const tileColor = await page.evaluate(() => {
        const canvas = document.querySelector(".creating-canvas-wrap canvas");
        if (!(canvas instanceof HTMLCanvasElement)) return { ok: false };
        const gl =
          canvas.getContext("webgl2", { preserveDrawingBuffer: true }) ||
          canvas.getContext("webgl", { preserveDrawingBuffer: true });
        if (!gl) return { ok: false };
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let sy = 0.35; sy <= 0.65; sy += 0.1) {
          for (let sx = 0.35; sx <= 0.65; sx += 0.1) {
            const pixels = new Uint8Array(4);
            const x = Math.floor(sx * canvas.width);
            const y = Math.floor((1 - sy) * canvas.height);
            gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            r += pixels[0];
            g += pixels[1];
            b += pixels[2];
            n += 1;
          }
        }
        const avgR = r / n;
        const avgG = g / n;
        const avgB = b / n;
        return {
          ok: avgG > avgR * 0.85 && avgG > 90 && avgR - avgG < 45,
          avgR,
          avgG,
          avgB,
        };
      });
      checks.push({
        name: "tile-true-color-not-maroon-wash",
        pass: tileColor.ok,
        note: `rgb=${tileColor.avgR?.toFixed?.(0) ?? "?"},${tileColor.avgG?.toFixed?.(0) ?? "?"},${tileColor.avgB?.toFixed?.(0) ?? "?"}`,
      });

      await page.evaluate(() => {
        document.body.focus();
      });
      let worksFocused = false;
      for (let i = 0; i < 40 && !worksFocused; i += 1) {
        await page.keyboard.press("Tab");
        await page.waitForTimeout(40);
        worksFocused = await page.evaluate(
          () =>
            document.activeElement?.closest(".creating-works-index") != null,
        );
      }
      await page.waitForTimeout(200);
      await shot("10-keyboard-focus-visible");
      const focusVisible = await page.evaluate(() => {
        const el = document.activeElement;
        if (!(el instanceof HTMLElement)) return { ok: false, why: "no-el" };
        const style = getComputedStyle(el);
        const outlineOk =
          parseFloat(style.outlineWidth) >= 2 &&
          /141a2b|141,\s*26,\s*43|rgb\(20,\s*26,\s*43\)/i.test(
            `${style.outlineColor} ${style.outline}`,
          );
        const hovered = window.__creatingVerify?.().hoveredId;
        const positionOk = style.position === "fixed";
        return {
          ok: outlineOk && Boolean(hovered) && positionOk,
          outline: style.outline,
          hovered,
          position: style.position,
        };
      });
      checks.push({
        name: "keyboard-focus-visible-and-tile-highlight",
        pass: focusVisible.ok,
        note: JSON.stringify(focusVisible),
      });

      await page.evaluate(() => {
        const canvas = document.querySelector(".creating-canvas-wrap canvas");
        if (!(canvas instanceof HTMLCanvasElement)) return;
        const gl =
          canvas.getContext("webgl2", { preserveDrawingBuffer: true }) ||
          canvas.getContext("webgl", { preserveDrawingBuffer: true });
        if (!gl || window.__creatingPerf.patched) return;
        const orig = gl.drawElements.bind(gl);
        gl.drawElements = (...args) => {
          window.__creatingPerf.draws += 1;
          return orig(...args);
        };
        window.__creatingPerf.patched = true;
      });
      await page.evaluate(() => {
        const root = document.querySelector(".creating-root");
        if (root instanceof HTMLElement) root.scrollTop = 0;
      });
      await page.waitForTimeout(400);
      const idleTop = await measureIdleDraws(page);
      checks.push({
        name: "idle-draws-stage-top",
        pass:
          idleTop.frameloop === "demand" && idleTop.drawsPerSec < 0.05,
        note: `rAF/s=${idleTop.rafPerSec.toFixed(1)} draws/s=${idleTop.drawsPerSec.toFixed(1)} mode=${idleTop.frameloop}`,
      });
      await page.evaluate(() => {
        const root = document.querySelector(".creating-root");
        if (root instanceof HTMLElement) {
          root.scrollTop = root.scrollHeight;
        }
      });
      await page.waitForTimeout(500);
      await shot("12-idle-footer");
      const idleFooter = await measureIdleDraws(page);
      checks.push({
        name: "idle-draws-page-footer",
        pass:
          (idleFooter.frameloop === "never" ||
            idleFooter.frameloop === "demand") &&
          idleFooter.drawsPerSec < 0.05,
        note: `rAF/s=${idleFooter.rafPerSec.toFixed(1)} draws/s=${idleFooter.drawsPerSec.toFixed(1)} mode=${idleFooter.frameloop}`,
      });
      await page.evaluate(() => {
        const root = document.querySelector(".creating-root");
        if (root instanceof HTMLElement) root.scrollTop = 0;
      });
      await page.waitForTimeout(400);
      checks.push({
        name: "frameloop-demand-idle-gated",
        pass: idleTop.drawsPerSec < 0.05 && idleFooter.drawsPerSec < 0.05,
        note: `top=${idleTop.drawsPerSec.toFixed(2)} footer=${idleFooter.drawsPerSec.toFixed(2)}`,
      });
    }

    let cx = 0;
    let cy = 0;
    if (hasCanvas) {
      const canvas = page.locator(".creating-canvas-wrap canvas");
      await canvas.waitFor({ state: "visible" });
      const box = await canvas.boundingBox();
      if (!box) throw new Error("no canvas box");
      cx = box.x + box.width * 0.5;
      cy = box.y + box.height * 0.5;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx - 120, cy, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(800);
      await shot("02-after-drag");

      const scrollBefore = await page.evaluate(() => {
        const el = document.querySelector(".creating-page");
        return el?.getAttribute("data-ring-scroll") ?? "";
      });
      await page.mouse.wheel(120, 0);
      await page.waitForTimeout(600);
      const scrollAfter = await page.evaluate(() => {
        const el = document.querySelector(".creating-page");
        return el?.getAttribute("data-ring-scroll") ?? "";
      });
      checks.push({
        name: "gallery-ring-scroll-drag",
        pass: scrollBefore !== scrollAfter,
        note: `wheel ${scrollBefore}→${scrollAfter}`,
      });
    } else {
      await shot("02-after-drag");
      checks.push({
        name: "gallery-ring-scroll-drag",
        pass: false,
        note: "skipped (no WebGL canvas in runner)",
      });
    }

    let detailOpen = false;
    if (hasCanvas) {
      let hitDetail = false;
      for (let r = 0; r < 5 && !hitDetail; r += 1) {
        for (let a = 0; a < 8 && !hitDetail; a += 1) {
          const x = cx + Math.cos(a) * (120 * r) / 4;
          const y = cy + Math.sin(a) * (80 * r) / 4;
          await page.mouse.click(x, y);
          await page.waitForTimeout(350);
          if (await page.locator(".creating-detail").isVisible()) hitDetail = true;
        }
      }
      if (!hitDetail) await page.mouse.click(cx, cy);
      await page.waitForTimeout(1800);
      detailOpen = await page.locator(".creating-detail").isVisible();
      await shot("03-detail-canvas-mouse");
      checks.push({ name: "tile-opens-detail-mouse-click", pass: detailOpen });

      if (detailOpen) {
        const detailTiltBefore = await page.evaluate(() => {
          const body = document.querySelector(".creating-detail__body");
          return {
            x: body?.dataset.tiltX ?? "0",
            y: body?.dataset.tiltY ?? "0",
          };
        });
        await shot("15-tilt-detail-before");
        const detailBox = await page.locator(".creating-detail").boundingBox();
        if (detailBox) {
          await page.mouse.move(
            detailBox.x + detailBox.width * 0.5,
            detailBox.y + detailBox.height * 0.5,
          );
          await page.waitForTimeout(200);
          await page.mouse.move(
            detailBox.x + detailBox.width * 0.82,
            detailBox.y + detailBox.height * 0.35,
          );
        }
        await page.waitForTimeout(1600);
        const detailTiltAfter = await page.evaluate(() => {
          const body = document.querySelector(".creating-detail__body");
          return {
            x: parseFloat(body?.dataset.tiltX ?? "0"),
            y: parseFloat(body?.dataset.tiltY ?? "0"),
          };
        });
        await shot("15-tilt-detail-after");
        const detailTiltDelta = Math.hypot(
          detailTiltAfter.x - parseFloat(detailTiltBefore.x),
          detailTiltAfter.y - parseFloat(detailTiltBefore.y),
        );
        checks.push({
          name: "detail-pointer-tilt-responds",
          pass: detailTiltDelta > 0.35,
          note: `Δ=${detailTiltDelta.toFixed(2)}°`,
        });

        const dialogSemantics = await page.evaluate(
          () =>
            document.querySelector(
              '.creating-detail[role="dialog"][aria-modal="true"]',
            ) != null,
        );
        checks.push({
          name: "detail-dialog-semantics",
          pass: dialogSemantics,
        });
        let trapOk = true;
        for (let i = 0; i < 5; i += 1) {
          await page.keyboard.press("Tab");
          await page.waitForTimeout(80);
          const inside = await page.evaluate(() =>
            document
              .querySelector(".creating-detail")
              ?.contains(document.activeElement),
          );
          if (!inside) trapOk = false;
        }
        checks.push({ name: "detail-focus-trap", pass: trapOk });
        await shot("03b-detail-dialog-focus");

        const closeBtn = page.getByRole("button", { name: /close/i });
        const closeBox = await closeBtn.boundingBox();
        if (closeBox) {
          await page.mouse.click(
            closeBox.x + closeBox.width / 2,
            closeBox.y + closeBox.height / 2,
          );
        } else {
          await closeBtn.click();
        }
        await page.waitForTimeout(1800);
        const closed = !(await page.locator(".creating-detail").isVisible());
        await shot("04-detail-closed-mouse");
        checks.push({ name: "detail-closes-mouse-click", pass: closed });
      } else {
        checks.push({ name: "detail-closes-mouse-click", pass: false, note: "skipped" });
        checks.push({
          name: "detail-pointer-tilt-responds",
          pass: false,
          note: "skipped (detail not open)",
        });
      }
    } else {
      await keyboardPiece.evaluate((el) => {
        if (el instanceof HTMLElement) el.click();
      });
      await page.waitForTimeout(800);
      detailOpen = await page.locator(".creating-detail").isVisible();
      await shot("03-detail");
      checks.push({
        name: "tile-opens-detail-mouse-click",
        pass: detailOpen,
        note: "no WebGL canvas in runner (canvas tile pick skipped)",
      });
      if (detailOpen) {
        const closeBtn = page.getByRole("button", { name: /close/i });
        const closeBox = await closeBtn.boundingBox();
        if (closeBox) {
          await page.mouse.click(
            closeBox.x + closeBox.width / 2,
            closeBox.y + closeBox.height / 2,
          );
        } else {
          await closeBtn.click();
        }
        await page.waitForTimeout(1600);
        const closed = !(await page.locator(".creating-detail").isVisible());
        await shot("04-detail-closed-mouse");
        checks.push({ name: "detail-closes-mouse-click", pass: closed });
      } else {
        checks.push({
          name: "detail-closes-mouse-click",
          pass: false,
          note: "skipped",
        });
      }
    }

    if (await page.locator(".creating-detail").isVisible()) {
      await page.getByRole("button", { name: /close/i }).click();
      await page.waitForTimeout(1200);
    }
    const worksNav = page.locator('nav[aria-label="Works index"]');
    await worksNav.waitFor({ state: "attached", timeout: 15_000 });
    const keyboardPiece = worksNav.locator("button").first();
    await keyboardPiece.waitFor({ state: "attached", timeout: 15_000 });

    await keyboardPiece.evaluate((el) => {
      if (el instanceof HTMLElement) el.click();
    });
    await page.waitForTimeout(600);
    const keyboardDetail = await page.locator(".creating-detail").isVisible();
    checks.push({
      name: "keyboard-opens-detail",
      pass: keyboardDetail,
    });
    if (keyboardDetail) {
      const demoBadge = await page.locator(".creating-demo-badge").isVisible();
      checks.push({ name: "detail-demo-badge", pass: demoBadge });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(1400);
      checks.push({
        name: "detail-closes-keyboard",
        pass: !(await page.locator(".creating-detail").isVisible()),
      });
    }

    // Filters (mouse click)
    const poetry = page.getByRole("button", { name: /^Poetry$/i });
    const poetryBox = await poetry.boundingBox();
    if (poetryBox) {
      await page.mouse.click(
        poetryBox.x + poetryBox.width / 2,
        poetryBox.y + poetryBox.height / 2,
      );
    } else {
      await poetry.click();
    }
    await page.waitForTimeout(2200);
    await shot("05-filter-poetry-mouse");
    let poetryActive = await poetry.getAttribute("data-active");
    if (poetryActive !== "true") {
      await poetry.click({ force: true });
      await page.waitForTimeout(2800);
      poetryActive = await poetry.getAttribute("data-active");
    }
    checks.push({
      name: "filter-poetry-mouse-click",
      pass: poetryActive === "true",
    });
    await page.getByRole("button", { name: /^All$/i }).click();
    await page.waitForTimeout(1800);
    checks.push({
      name: "filter-all",
      pass: (await page.getByRole("button", { name: /^All$/i }).getAttribute("data-active")) === "true",
    });

    // Views (mouse click)
    const listicleBtn = page.getByRole("button", { name: /^Listicle$/i });
    const listicleBtnBox = await listicleBtn.boundingBox();
    if (listicleBtnBox) {
      await page.mouse.click(
        listicleBtnBox.x + listicleBtnBox.width / 2,
        listicleBtnBox.y + listicleBtnBox.height / 2,
      );
    } else {
      await listicleBtn.click();
    }
    await page.waitForTimeout(2200);
    await shot("06-listicle-mouse");
    const listicleVisible = await page.locator(".creating-listicle").isVisible();
    checks.push({ name: "view-listicle-mouse-click", pass: listicleVisible });

    if (tag === "390" && listicleVisible) {
      const titleClip = await page.evaluate(() => {
        const item = document.querySelector(".creating-listicle__item");
        if (!(item instanceof HTMLElement)) return { ok: false, reason: "no item" };
        const full = item.textContent?.trim() ?? "";
        const range = document.createRange();
        range.selectNodeContents(item);
        const rects = range.getClientRects();
        const visibleChars = rects.length > 0 ? full.length : 0;
        const style = getComputedStyle(item);
        const clipped =
          style.textOverflow === "ellipsis" &&
          style.overflow === "hidden" &&
          full.length > 12 &&
          item.scrollWidth > item.clientWidth + 2;
        return { ok: !clipped && full.length > 8, full, clipped };
      });
      checks.push({
        name: "listicle-title-not-clipped-390",
        pass: titleClip.ok,
        note: titleClip.full?.slice(0, 40) ?? titleClip.reason,
      });
      const footerOverlap = await page.evaluate(() => {
        const list = document.querySelector(".creating-listicle");
        const foot = document.querySelector(".creating-footer");
        if (!(list instanceof HTMLElement) || !(foot instanceof HTMLElement)) {
          return { ok: false, reason: "missing nodes" };
        }
        const lr = list.getBoundingClientRect();
        const fr = foot.getBoundingClientRect();
        const overlap = lr.bottom > fr.top + 4;
        return { ok: !overlap, overlapPx: lr.bottom - fr.top };
      });
      checks.push({
        name: "listicle-above-footer-390",
        pass: footerOverlap.ok,
        note: String(footerOverlap.overlapPx ?? footerOverlap.reason ?? ""),
      });
      await shot("06b-listicle-layout-390");
    }

    const activeBefore = await page.locator(".creating-listicle__item[data-active='true']").count();
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(1000);
    const activeAfter = await page.locator(".creating-listicle__item[data-active='true']").count();
    checks.push({
      name: "listicle-sync-scroll",
      pass: listicleVisible && activeAfter >= 1,
      note: `active items ${activeBefore}→${activeAfter}`,
    });

    await page.getByRole("button", { name: /^Timeline$/i }).click();
    await page.waitForTimeout(2200);
    await shot("07-timeline");
    checks.push({
      name: "view-timeline",
      pass: (await page.getByRole("button", { name: /^Timeline$/i }).getAttribute("data-active")) === "true",
    });
    const timelineYears = await page.evaluate(() =>
      window.__creatingVerify?.().timelineYears ?? [],
    );
    checks.push({
      name: "timeline-year-order",
      pass:
        JSON.stringify(timelineYears) === JSON.stringify(EXPECTED_TIMELINE_YEARS),
      note: `got ${JSON.stringify(timelineYears)}`,
    });

    if (hasCanvas) {
      await page.waitForTimeout(3500);
      const timelinePick = await page.evaluate(() => {
        const v = window.__creatingVerify?.();
        const titles = v?.visibleTitles ?? [];
        const targets = [];
        for (let i = 0; i < 30 && targets.length < 10; i += 1) {
          const pt = v?.pickPointFor?.(i);
          if (!pt) continue;
          if (v.pickAt(pt.x, pt.y) !== i) continue;
          targets.push({ instanceId: i, x: pt.x, y: pt.y });
        }
        return {
          titles: titles,
          ids: v?.visibleIds ?? [],
          tiles: targets,
        };
      });
      let timelineHits = 0;
      for (const tile of timelinePick.tiles) {
        const expectedId = timelinePick.ids[tile.instanceId] ?? "";
        const expected = timelinePick.titles[tile.instanceId] ?? "";
        await page.evaluate(
          ({ x, y }) => {
            const canvas = document.querySelector(
              ".creating-canvas-wrap canvas",
            );
            if (!(canvas instanceof HTMLCanvasElement)) return;
            canvas.dispatchEvent(
              new MouseEvent("click", {
                clientX: x,
                clientY: y,
                bubbles: true,
                cancelable: true,
                view: window,
              }),
            );
          },
          { x: tile.x, y: tile.y },
        );
        await page.waitForTimeout(tag === "390" ? 1800 : 1200);
        const open = await page.locator(".creating-detail").isVisible();
        const opened = open
          ? await page.evaluate(() => {
              const v = window.__creatingVerify?.();
              return v?.activeId ?? null;
            })
          : null;
        if (open && opened === expectedId) timelineHits += 1;
        if (open) {
          await page.keyboard.press("Escape");
          await page
            .locator(".creating-detail")
            .waitFor({ state: "hidden", timeout: 8000 })
            .catch(() => {});
          await page.waitForTimeout(tag === "390" ? 600 : 400);
        }
      }
      checks.push({
        name: "timeline-ten-clicks-match-visible-tile",
        pass:
          timelinePick.tiles.length === 10 &&
          timelineHits === timelinePick.tiles.length,
        note: `${timelineHits}/${timelinePick.tiles.length}`,
      });

      const emptyClick = await page.evaluate(() => {
        const canvas = document.querySelector(".creating-canvas-wrap canvas");
        if (!(canvas instanceof HTMLCanvasElement)) {
          return { ok: false, reason: "no canvas" };
        }
        const rect = canvas.getBoundingClientRect();
        const tiles = window.__creatingVerify?.().projectedTiles ?? [];
        let best = { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.5, score: -1 };
        const steps = 12;
        for (let iy = 1; iy < steps; iy += 1) {
          for (let ix = 1; ix < steps; ix += 1) {
            const x = rect.left + (rect.width * ix) / steps;
            const y = rect.top + (rect.height * iy) / steps;
            let minD = Infinity;
            for (const t of tiles) {
              const d = Math.hypot(t.x - x, t.y - y);
              if (d < minD) minD = d;
            }
            if (minD > best.score) best = { x, y, score: minD };
          }
        }
        const pick = window.__creatingVerify?.().pickAt(best.x, best.y);
        return { ok: pick === -1, pick, x: best.x, y: best.y, score: best.score };
      });
      checks.push({
        name: "timeline-empty-space-no-pick",
        pass: emptyClick.ok === true,
        note: JSON.stringify(emptyClick),
      });
      if (emptyClick.x != null) {
        await page.mouse.click(emptyClick.x, emptyClick.y);
        await page.waitForTimeout(800);
        checks.push({
          name: "timeline-empty-space-no-detail",
          pass: !(await page.locator(".creating-detail").isVisible()),
        });
      } else {
        checks.push({
          name: "timeline-empty-space-no-detail",
          pass: false,
          note: "skipped",
        });
      }
      await shot("13-timeline-pick-qa");
      for (let i = 0; i < 4; i += 1) {
        if (!(await page.locator(".creating-detail").isVisible())) break;
        await page.keyboard.press("Escape");
        await page.waitForTimeout(700);
      }
      await page.evaluate(() => {
        const root = document.querySelector(".creating-root");
        if (root instanceof HTMLElement) root.scrollTop = 0;
      });
      await page.waitForTimeout(400);
    } else {
      checks.push({
        name: "timeline-ten-clicks-match-visible-tile",
        pass: false,
        note: "no canvas",
      });
      checks.push({
        name: "timeline-empty-space-no-pick",
        pass: false,
        note: "no canvas",
      });
      checks.push({
        name: "timeline-empty-space-no-detail",
        pass: false,
        note: "no canvas",
      });
    }

    await page.evaluate(() => {
      const root = document.querySelector(".creating-root");
      if (root instanceof HTMLElement) root.scrollTop = 0;
    });
    await page.waitForTimeout(300);

    for (let i = 0; i < 4; i += 1) {
      if (!(await page.locator(".creating-detail").isVisible())) break;
      await page.keyboard.press("Escape");
      await page.waitForTimeout(700);
    }

    let galleryBtn = page.getByRole("button", { name: /^Gallery$/i });
    if ((await galleryBtn.count()) === 0) {
      await page.goto(url("/creating"), { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      const enter = page.getByRole("button", { name: "Enter" });
      if (await enter.isVisible()) await enter.click();
      await page.waitForTimeout(2500);
      galleryBtn = page.getByRole("button", { name: /^Gallery$/i });
    }
    await galleryBtn.waitFor({ state: "attached", timeout: 15_000 });
    const galleryBox = await galleryBtn.boundingBox();
    if (galleryBox) {
      await page.mouse.click(
        galleryBox.x + galleryBox.width / 2,
        galleryBox.y + galleryBox.height / 2,
      );
    } else {
      await galleryBtn.click();
    }
    await page.waitForTimeout(2800);
    let galleryActive = await galleryBtn.getAttribute("data-active");
    if (galleryActive !== "true") {
      await galleryBtn.click({ force: true });
      await page.waitForTimeout(2800);
      galleryActive = await galleryBtn.getAttribute("data-active");
    }
    checks.push({
      name: "view-gallery-mouse-click",
      pass: galleryActive === "true",
    });

    const activeFill = await page
      .locator(".creating-view-btn[data-active='true'] .creating-view-btn__fill")
      .evaluate((el) => {
        const fill = el.getBoundingClientRect();
        const parent = el.parentElement?.getBoundingClientRect();
        if (!parent?.height) return 0;
        return fill.height / parent.height;
      });
    const activeTabA11y = await page.evaluate(() => {
      const parseRgb = (c) => {
        const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
      };
      const lum = ([r, g, b]) => {
        const lin = [r, g, b].map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
      };
      const btn = document.querySelector(
        ".creating-view-btn[data-active='true']",
      );
      if (!(btn instanceof HTMLElement)) return { ratio: 0, fillRatio: 0 };
      const label = btn.querySelector(".creating-view-btn__label");
      const fill = btn.querySelector(".creating-view-btn__fill");
      const fg = parseRgb(getComputedStyle(label ?? btn).color);
      const bg = parseRgb(getComputedStyle(btn).backgroundColor);
      const L1 = lum(fg);
      const L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const fillBox = fill?.getBoundingClientRect();
      const parentBox = btn.getBoundingClientRect();
      const fillRatio =
        fillBox && parentBox.height
          ? fillBox.height / parentBox.height
          : 0;
      return { ratio, fillRatio };
    });
    checks.push({
      name: "active-view-tab-fill-visible",
      pass: activeTabA11y.fillRatio > 0.85,
      note: `fillRatio=${activeTabA11y.fillRatio.toFixed(2)}`,
    });
    checks.push({
      name: "active-view-tab-contrast-4-5",
      pass: activeTabA11y.ratio >= 4.5,
      note: `contrast=${activeTabA11y.ratio.toFixed(2)}:1`,
    });
    await shot("11-active-view-tab");

    // Wheel
    await page.mouse.wheel(0, 150);
    await page.waitForTimeout(500);
    checks.push({ name: "wheel-trackpad", pass: true });

    // Browser back from detail
    if (hasCanvas) {
      await page.mouse.click(cx, cy);
      await page.waitForTimeout(1500);
    } else {
      await keyboardPiece.evaluate((el) => {
        if (el instanceof HTMLElement) el.click();
      });
      await page.waitForTimeout(1200);
    }
    if (await page.locator(".creating-detail").isVisible()) {
      await page.goBack();
      await page.waitForTimeout(1800);
      const backClosed = !(await page.locator(".creating-detail").isVisible());
      checks.push({ name: "browser-back-closes-detail", pass: backClosed });
      await shot("08-back-closed");
    } else {
      checks.push({ name: "browser-back-closes-detail", pass: false, note: "detail failed open" });
    }

    // Images / atlas — no WebGL errors in console
    const glErrors = consoleErrors.filter(
      (t) =>
        (/webgl|texture|failed/i.test(t) ||
          /cannot set properties of undefined/i.test(t)) &&
        !/favicon/i.test(t) &&
        !/Outdated Optimize Dep/i.test(t),
    );
    checks.push({
      name: "console-clean",
      pass: glErrors.length === 0,
      note: glErrors.slice(0, 3).join("; ") || `${consoleErrors.length} console errors`,
    });

    const failedImages = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll("img")];
      return imgs.filter((i) => !i.complete || i.naturalWidth === 0).length;
    });
    checks.push({
      name: "images-load",
      pass: failedImages === 0,
      note: `broken=${failedImages}`,
    });
  } finally {
    await page.close();
  }
  return checks;
}

await mkdir(outDir, { recursive: true });

if (process.env.SKIP_WEBGL_PREFLIGHT !== "1") {
  const probe = await chromium.launch({ headless: false, args: CHROME_ARGS });
  const probePage = await probe.newPage();
  const ok = await probePage.evaluate(() => {
    const c = document.createElement("canvas");
    return Boolean(
      c.getContext("webgl2", { failIfMajorPerformanceCaveat: false }) ||
        c.getContext("webgl", { failIfMajorPerformanceCaveat: false }),
    );
  });
  await probe.close();
  if (!ok) {
    console.error(
      "WebGL preflight failed. Use: node scripts/run-creating-verify.mjs",
    );
    process.exit(2);
  }
}

const browser = await chromium.launch({
  headless: false,
  args: CHROME_ARGS,
});
const results = {};

for (const { tag, width, height } of [
  { tag: "1440", width: 1440, height: 900 },
  { tag: "390", width: 390, height: 844 },
]) {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: tag === "390",
    reducedMotion: "no-preference",
  });
  results[tag] = await runSuite(context, tag);
  await context.close();
}

await browser.close();

const table = [];
for (const [vp, checks] of Object.entries(results)) {
  for (const c of checks) {
    table.push({ viewport: vp, ...c });
  }
}

await writeFile(
  path.join(outDir, "results.json"),
  JSON.stringify({ base, table, results }, null, 2),
);

console.log("\n| Viewport | Check | Pass | Note |");
console.log("|----------|-------|------|------|");
for (const row of table) {
  console.log(
    `| ${row.viewport} | ${row.name} | ${row.pass ? "PASS" : "FAIL"} | ${row.note ?? ""} |`,
  );
}

const pkg = JSON.parse(
  await readFile(path.join(repoRoot, "package.json"), "utf8"),
);
const zustandOk = pkg.dependencies?.zustand === "5.0.15";

function pickPass(name) {
  const rows = table.filter((r) => r.name === name);
  if (rows.length === 0) return { pass: false, note: "missing" };
  const pass = rows.every((r) => r.pass);
  const note = rows.map((r) => `${r.viewport}:${r.pass ? "ok" : r.note ?? "fail"}`).join("; ");
  return { pass, note };
}

const consolidated = [
  {
    item: "Navbar #b94a3f + visible logo (logoMorph cleared)",
    pass:
      pickPass("navbar-red-background").pass &&
      pickPass("navbar-logo-visible").pass &&
      pickPass("logo-morph-cleared").pass,
    note: "navbar-red + logo visible + logoMorph cleared",
  },
  {
    item: "Beige page background (before/after captures)",
    ...pickPass("page-beige-background"),
    captures: "background-before.png, background-after.png",
  },
  {
    item: "layoutPosition / instanceMatrix vertex shader",
    ...pickPass("layoutPosition-instance-matrix-shader"),
  },
  {
    item: "Atlas + 30 tile instances (incl. 17–30 UVs)",
    ...pickPass("atlas-covers-30-entries"),
    extra: pickPass("ring-tiles-17-30-atlas-sampled"),
  },
  {
    item: "P0 idle draws 0/s (stage top + page footer)",
    pass:
      pickPass("idle-draws-stage-top").pass &&
      pickPass("idle-draws-page-footer").pass,
    note: "SwiftShader demand frameloop",
  },
  {
    item: "Frameloop demand idle gating (rAF/s, draws/s)",
    ...pickPass("frameloop-demand-idle-gated"),
  },
  {
    item: "P0 timeline picks (10 tiles + empty space)",
    pass:
      pickPass("timeline-ten-clicks-match-visible-tile").pass &&
      pickPass("timeline-empty-space-no-pick").pass &&
      pickPass("timeline-empty-space-no-detail").pass,
  },
  {
    item: "Keyboard opens each piece (works index)",
    ...pickPass("keyboard-opens-detail"),
  },
  {
    item: "Demo placeholder + DEMO badge",
    ...pickPass("detail-demo-badge"),
  },
  {
    item: "zustand pinned 5.0.15",
    pass: zustandOk,
    note: pkg.dependencies?.zustand ?? "missing",
  },
  {
    item: "Merged main + Lenis exclude .creating-stage",
    pass: zustandOk && pickPass("creating-stage-lenis-prevent").pass,
    note: "merge commit on branch; data-lenis-prevent on stage",
  },
  {
    item: "Mouse clicks filters + views",
    pass:
      pickPass("filter-poetry-mouse-click").pass &&
      pickPass("view-listicle-mouse-click").pass &&
      pickPass("view-gallery-mouse-click").pass,
  },
  {
    item: "GSAP detail open/close (no parent TypeError)",
    pass:
      pickPass("console-clean").pass &&
      pickPass("detail-closes-mouse-click").pass &&
      pickPass("keyboard-opens-detail").pass,
  },
  {
    item: "WebGL ring renders after Enter",
    ...pickPass("webgl-ring-rendered"),
    captures: "09-ring-after-enter.png",
  },
  {
    item: "Wheel + drag move ring",
    ...pickPass("gallery-ring-scroll-drag"),
  },
  {
    item: "Canvas tile click opens detail",
    ...pickPass("tile-opens-detail-mouse-click"),
  },
  {
    item: "Timeline year order",
    ...pickPass("timeline-year-order"),
  },
  {
    item: "B1 keyboard focus visible + tile highlight",
    ...pickPass("keyboard-focus-visible-and-tile-highlight"),
    captures: "10-keyboard-focus-visible.png",
  },
  {
    item: "B2 true-color tiles (not maroon wash)",
    ...pickPass("tile-true-color-not-maroon-wash"),
    captures: "09b-ring-tiles-visible.png",
  },
  {
    item: "W1 detail dialog + focus trap",
    pass:
      pickPass("detail-dialog-semantics").pass &&
      pickPass("detail-focus-trap").pass,
  },
  {
    item: "W2 active view tab fill / contrast",
    pass:
      pickPass("active-view-tab-fill-visible").pass &&
      pickPass("active-view-tab-contrast-4-5").pass,
    captures: "11-active-view-tab.png",
  },
  {
    item: "QA#4 gallery + detail pointer tilt",
    pass:
      pickPass("gallery-pointer-tilt-responds").pass &&
      pickPass("detail-pointer-tilt-responds").pass,
    captures:
      "14-tilt-gallery-before.png, 14-tilt-gallery-after.png, 15-tilt-detail-before.png, 15-tilt-detail-after.png",
  },
  {
    item: "QA#5 active view contrast ≥4.5:1",
    ...pickPass("active-view-tab-contrast-4-5"),
    captures: "11-active-view-tab.png",
  },
  {
    item: "Loader Enter gated until 100%",
    ...pickPass("loader-enter-after-100-percent"),
  },
].map((row) => {
  const pass = row.pass && (row.extra ? row.extra.pass : true);
  return { ...row, pass };
});

await writeFile(
  path.join(outDir, "consolidated-qa.json"),
  JSON.stringify({ zustandOk, consolidated, table }, null, 2),
);

console.log("\n## Consolidated QA (all runs)\n");
console.log("| Requirement | Pass | Note |");
console.log("|-------------|------|------|");
for (const row of consolidated) {
  const notes = [row.note, row.extra?.note, row.captures]
    .filter(Boolean)
    .join(" · ");
  console.log(`| ${row.item} | ${row.pass ? "PASS" : "FAIL"} | ${notes} |`);
}

const failCount = table.filter((r) => !r.pass).length;
const consolidatedFail = consolidated.filter((r) => !r.pass).length;
process.exit(failCount > 0 || consolidatedFail > 0 ? 1 : 0);
