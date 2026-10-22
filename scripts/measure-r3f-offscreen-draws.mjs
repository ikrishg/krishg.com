/**
 * WebGL draw call count while hero canvases are offscreen (scrollY=0).
 * Usage: PREVIEW_URL=https://... node scripts/measure-r3f-offscreen-draws.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:4321";
const SAMPLE_MS = 2000;

async function measureDrawCalls(page) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    document.documentElement.dataset.introSkip = "true";
    delete document.documentElement.dataset.logoMorph;
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(500);

  return page.evaluate(
    async ({ sampleMs }) => {
      let draws = 0;
      const wrap = (proto, name) => {
        const orig = proto[name];
        if (!orig) return;
        proto[name] = function (...args) {
          draws += 1;
          return orig.apply(this, args);
        };
      };
      wrap(WebGLRenderingContext.prototype, "drawElements");
      wrap(WebGLRenderingContext.prototype, "drawArrays");
      wrap(WebGL2RenderingContext.prototype, "drawElements");
      wrap(WebGL2RenderingContext.prototype, "drawArrays");
      wrap(WebGL2RenderingContext.prototype, "drawElementsInstanced");
      wrap(WebGL2RenderingContext.prototype, "drawArraysInstanced");

      await new Promise((resolve) => setTimeout(resolve, sampleMs));
      return {
        drawCalls: draws,
        scrollY: window.scrollY,
        canvasCount: document.querySelectorAll("canvas").length,
      };
    },
    { sampleMs: SAMPLE_MS },
  );
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    const result = await measureDrawCalls(page);
    console.log(
      JSON.stringify(
        {
          preview: BASE,
          sampleMs: SAMPLE_MS,
          ...result,
          drawsPerSecond: Math.round((result.drawCalls / SAMPLE_MS) * 1000),
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
