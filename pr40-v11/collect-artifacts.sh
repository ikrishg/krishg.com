#!/usr/bin/env bash
set -euo pipefail
cd /workspace
ART=pr40-v11
MAIN="${MAIN_PREVIEW_URL:-http://127.0.0.1:4322}"
BR="${PREVIEW_URL:-http://127.0.0.1:4321}"
mkdir -p "$ART"

echo "astro check" | tee "$ART/astro-check.log"
npx astro check 2>&1 | tee -a "$ART/astro-check.log"
echo "exit:${PIPESTATUS[0]}" >> "$ART/astro-check.log"

echo "astro build" | tee "$ART/astro-build.log"
npm run build 2>&1 | tee -a "$ART/astro-build.log"
echo "exit:${PIPESTATUS[0]}" >> "$ART/astro-build.log"

tmux -f /exec-daemon/tmux.portal.conf send-keys -t pr-preview-4321:0.0 C-c "cd /workspace && npx astro preview --host 127.0.0.1 --port 4321" C-m
sleep 5

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

MAIN_PREVIEW_URL="$MAIN" PREVIEW_URL="$BR" node -e "
import { chromium } from 'playwright';
import { CURSOR_VIEWPORTS, measureCursorCountAt, measureMainCursorBaselines } from './scripts/dev/pr40-cursor-baseline.mjs';
const b=await chromium.launch();
const main=await measureMainCursorBaselines(b, process.env.MAIN_PREVIEW_URL, { samplesPerViewport: 3 });
const rows=[];
for (const vp of CURSOR_VIEWPORTS) {
  const br=await measureCursorCountAt(b, process.env.PREVIEW_URL, vp, { reducedMotion: 'no-preference' });
  rows.push({ viewport: vp.width + 'x' + vp.height, main: main[vp.width], branch: br, motion: 'no-preference' });
}
await b.close();
console.log(JSON.stringify({ rows }, null, 2));
" | tee "$ART/cursor-motion-on-vs-main.json"

cp -f scripts/dev/out/nav-step-5runs.json "$ART/nav-step-5runs.json" 2>/dev/null || true
