#!/usr/bin/env bash
set -euo pipefail
cd /workspace
MAIN="${MAIN_PREVIEW_URL:-http://127.0.0.1:4322}"
BR="${PREVIEW_URL:-http://127.0.0.1:4321}"
ART=pr40-v11
for _ in $(seq 1 30); do
  if curl -sf "$BR/" >/dev/null && curl -sf "$MAIN/" >/dev/null; then
    break
  fi
  sleep 2
done
for i in 1 2 3 4 5; do
  MAIN_PREVIEW_URL="$MAIN" PREVIEW_URL="$BR" \
    stdbuf -oL -eL node scripts/dev/verify-pr40-regression.mjs \
    > "$ART/verify-outer-${i}.log" 2>&1
  echo "exit:$?" >> "$ART/verify-outer-${i}.log"
done
for i in 1 2 3 4 5; do
  env -u PR40_ARTIFACTS_DIR \
    PR40_METRICS_FILE=/workspace/scripts/dev/out/layout-metrics.json \
    SCREENSHOT_DIR=/tmp/prove-noopt \
    MAIN_PREVIEW_URL="$MAIN" PREVIEW_URL="$BR" \
    PR40_PROVE_STABILITY_RUNS=1 \
    PR40_NAV_STEP_STABILITY_RUNS=1 \
    stdbuf -oL -eL node scripts/dev/prove-closing-tail-splash-fill.mjs \
    > "$ART/prove-outer-${i}.log" 2>&1
  echo "exit:$?" >> "$ART/prove-outer-${i}.log"
done
env -u PR40_ARTIFACTS_DIR \
  PR40_METRICS_FILE=/workspace/scripts/dev/out/layout-metrics.json \
  SCREENSHOT_DIR=/tmp/prove-noopt \
  MAIN_PREVIEW_URL="$MAIN" PREVIEW_URL="$BR" \
  stdbuf -oL -eL node scripts/dev/prove-closing-tail-splash-fill.mjs \
  > "$ART/prove-no-optcursor.log" 2>&1
echo "exit:$?" >> "$ART/prove-no-optcursor.log"
MAIN_PREVIEW_URL="$MAIN" PREVIEW_URL="$BR" node <<'NODE' > "$ART/cursor-motion-on-vs-main.json"
import { chromium } from "playwright";
import {
  CURSOR_VIEWPORTS,
  measureCursorCountAt,
  measureMainCursorBaselines,
} from "./scripts/dev/pr40-cursor-baseline.mjs";
const b = await chromium.launch();
const main = await measureMainCursorBaselines(b, process.env.MAIN_PREVIEW_URL, {
  samplesPerViewport: 3,
});
const rows = [];
for (const vp of CURSOR_VIEWPORTS) {
  const br = await measureCursorCountAt(b, process.env.PREVIEW_URL, vp, {
    reducedMotion: "no-preference",
  });
  rows.push({
    viewport: `${vp.width}x${vp.height}`,
    main: main[vp.width],
    branch: br,
    motion: "no-preference",
  });
}
await b.close();
console.log(JSON.stringify({ rows }, null, 2));
NODE
cp -f scripts/dev/out/nav-step-5runs.json "$ART/nav-step-5runs.json" 2>/dev/null || true
echo GATES_DONE >> "$ART/collect.log"
