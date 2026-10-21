# 003 — Play the page loader once per browser session

- **Status**: TODO
- **Commit**: a1bfa74 (audit requested at 8d44675; loader replay is identical at both)
- **Severity**: HIGH
- **Category**: Frequency / purpose
- **Estimated scope**: 5 files, about 40 changed lines
- **Depends on**: 002 (this plan edits the effect 002 changes, and relies on its `data-copy-reveal="armed"` gate)

## Problem

The full-screen signature loader plays on every full page load. That covers the
homepage and every stub page, including the reload after each click on a hero
CTA or "← Back home". The visitor waits through the same 1.4 s stroke draw
and 0.52 s morph each time.

Measured in Chromium on local builds, time from navigation start until
`.home-page-loader` left the DOM (one run each, reduced motion off):

| Page | 8d44675 | a1bfa74 |
| --- | --- | --- |
| `/` cold | 3076 ms | 2792 ms median of 5 (range 2677–2848) |
| `/about/` | 2032 ms | 2038 ms after the load event |
| `/` second visit, same context | 2325 ms | not rerun |
| `/creating/` | 2027 ms | not rerun |

The 8d44675 column is navigation start to removal, one run each. The a1bfa74 `/` value is navigation start to removal over 5 cold runs.

Product intent supports "once". `PRODUCT.md:29` says "Initial page loader with
signature stroke animation". `DESIGN.md:72` says "Home loader: fixed
fullscreen signature SVG stroke draw". A signature intro is a first-impression
moment. On the fifth page of a visit it is a 2-second wait.

`src/layouts/RootLayout.astro:31-47` (current) seeds the intro on every page that renders the template:

```astro
  <script is:inline define:vars={{ seedIntro: Boolean(homeNav && !hideTemplate) }}>
    (() => {
      try {
        const root = document.documentElement;
        if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
          root.dataset.motionEnhance = "1";
        }
        /* Seed before React hydrates so copy reveal cannot win the race. */
        if (seedIntro) {
          root.dataset.logoMorph = "pending";
          root.dataset.introPhase = "draw";
        }
      } catch {
        /* ignore */
      }
    })();
  </script>
```

`src/layouts/RootLayout.astro:55-61` renders `<HomePageLoader client:load />` whenever `!hideTemplate`.
That is a wider condition than `seedIntro`. Five stub pages pass
`homeNav={false}` (`src/pages/about.astro:8`, `articles.astro:11`,
`talks.astro:8`, `work.astro:8`, `writing.astro:8`). On those pages
`seedIntro` is false, but the loader still renders and plays. Any skip
decision has to key on "the loader renders", not on `seedIntro`.

`src/components/home/HomePageLoader.tsx:14-20` (current):

```tsx
  useEffect(() => {
    setIntroPhase("draw");
    return () => setIntroPhase("ready");
  }, []);

  useEffect(() => {
    const reduced = prefersReducedMotion();
```

`src/components/home/homeIntro.ts:26-28` (current):

```ts
export function introAllowsCopyReveal(): boolean {
  return getIntroPhase() === "ready";
}
```

`src/styles/global.css:79-88` (current) is the loader box:

```css
.home-page-loader {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  background: var(--home-builder-bg, #f4f0e8);
  color: var(--home-builder-fg, var(--home-footer-ink));
  pointer-events: none;
}
```

Expected state of `src/components/home/HomeHeroCopyMotion.tsx` after plan 002:

```tsx
function revealCopy(copy: HTMLElement) {
  if (copy.dataset.revealed === "true") return;
  if (!introAllowsCopyReveal()) return;
  copy.dataset.revealed = "true";
}
// ...
    if (prefersReducedMotion()) {
      for (const copy of copies) copy.dataset.revealed = "true";
      return;
    }

    const root = document.documentElement;
    root.dataset.copyReveal = "armed";

    const revealVisible = () => {
      if (!introAllowsCopyReveal()) return;
      for (const section of document.querySelectorAll<HTMLElement>(
        SECTION_SELECTOR,
      )) {
        const copy = section.querySelector<HTMLElement>(COPY_SELECTOR);
        if (!copy || copy.dataset.revealed === "true") continue;
```

Expected state of the hide rule in `src/styles/global.css` after plan 002:

```css
  html[data-motion-enhance]:is(
      [data-intro-phase="draw"],
      [data-intro-phase="morph"],
      [data-logo-morph="pending"],
      [data-copy-reveal="armed"]
    )
    .hero-copy:not([data-revealed="true"])
    > * {
    opacity: 0;
  }
```

## Target

Behavior:

- The first templated page in a tab session plays the intro exactly as today.
- Every later templated page in that tab session paints with no loader, the navbar logo visible, and `data-intro-phase="ready"` already set before first paint.
- On a skipped page, hero copy already in view at mount stays put with no rise (`data-revealed="static"`). Bands scrolled into later still rise with `hero-copy-rise 0.55s var(--ease-out) both`.
- The session key is `krishg:intro-played` with value `"1"` in `sessionStorage`. It is written when the intro is seeded, so leaving during the intro still counts as played.
- If `sessionStorage` throws, the intro plays. It never gets stuck skipped or half-seeded.

```astro
<!-- src/layouts/RootLayout.astro:31-47 — target -->
  <script
    is:inline
    define:vars={{
      hasLoader: !hideTemplate,
      seedIntro: Boolean(homeNav && !hideTemplate),
    }}
  >
    (() => {
      try {
        const root = document.documentElement;
        if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
          root.dataset.motionEnhance = "1";
        }
        /* Seed before React hydrates so copy reveal cannot win the race. */
        if (hasLoader) {
          let played = false;
          try {
            played = sessionStorage.getItem("krishg:intro-played") === "1";
            if (!played) sessionStorage.setItem("krishg:intro-played", "1");
          } catch {
            /* storage blocked: play the intro */
          }
          if (played) {
            root.dataset.introSkip = "1";
            root.dataset.introPhase = "ready";
          } else if (seedIntro) {
            root.dataset.logoMorph = "pending";
            root.dataset.introPhase = "draw";
          }
        }
      } catch {
        /* ignore */
      }
    })();
  </script>
```

```css
/* src/styles/global.css — target, new rule directly after the .home-page-loader block (after line 88) */
html[data-intro-skip] .home-page-loader {
  display: none;
}
```

```ts
// src/components/home/homeIntro.ts — target, new export after introAllowsCopyReveal
export function introSkipped(): boolean {
  return document.documentElement.dataset.introSkip === "1";
}
```

```tsx
// src/components/home/HomePageLoader.tsx — target, first two effects
  useEffect(() => {
    if (introSkipped()) {
      setPhase("done");
      return;
    }
    setIntroPhase("draw");
    return () => setIntroPhase("ready");
  }, []);

  useEffect(() => {
    if (introSkipped()) return;
    const reduced = prefersReducedMotion();
```

```tsx
// src/components/home/HomeHeroCopyMotion.tsx — target
function revealCopy(copy: HTMLElement) {
  if (copy.dataset.revealed) return;
  if (!introAllowsCopyReveal()) return;
  copy.dataset.revealed = "true";
}
// ...
    if (prefersReducedMotion()) {
      for (const copy of copies) copy.dataset.revealed = "true";
      return;
    }

    if (introSkipped()) {
      for (const section of document.querySelectorAll<HTMLElement>(
        SECTION_SELECTOR,
      )) {
        const copy = section.querySelector<HTMLElement>(COPY_SELECTOR);
        if (!copy) continue;
        const rect = section.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          copy.dataset.revealed = "static";
        }
      }
    }

    const root = document.documentElement;
    root.dataset.copyReveal = "armed";

    const revealVisible = () => {
      if (!introAllowsCopyReveal()) return;
      for (const section of document.querySelectorAll<HTMLElement>(
        SECTION_SELECTOR,
      )) {
        const copy = section.querySelector<HTMLElement>(COPY_SELECTOR);
        if (!copy || copy.dataset.revealed) continue;
```

```css
/* src/styles/global.css — target, hide rule after plan 002 with one selector change */
  html[data-motion-enhance]:is(
      [data-intro-phase="draw"],
      [data-intro-phase="morph"],
      [data-logo-morph="pending"],
      [data-copy-reveal="armed"]
    )
    .hero-copy:not([data-revealed])
    > * {
    opacity: 0;
  }
```

Why `static` and not `true`. On a skipped page the in-view copy is visible
at first paint (phase is already `ready`, and the gate from 002 is not armed
until hydration). Setting `true` at hydration would restart `hero-copy-rise`
from opacity 0 and flash it. `static` counts as revealed for the hide rule and
the guards, but does not match the animation selector
`.hero-copy[data-revealed="true"] > *`. The reduce block at `global.css:229-237`
matches `.hero-copy[data-revealed]` and already covers `static`.

Values that do not change: `STROKE_MS = 1400`, `MORPH_MS = 520`,
`ARTIFACT_READY_TIMEOUT_MS = 5000` (`homeIntro.ts:3-6`), the stroke keyframes,
and the morph transition.

## Repo conventions to follow

- Pre-hydration state is seeded by the inline script in `src/layouts/RootLayout.astro:31-47`, and CSS reads it from `<html>` attributes. Exemplar: `html[data-logo-morph="pending"] .home-navbar .home-logo { visibility: hidden; }` at `src/styles/global.css:110-112`.
- Shared intro helpers live in `src/components/home/homeIntro.ts` and read `document.documentElement.dataset`. Exemplar: `getIntroPhase()` at `homeIntro.ts:10-14`.
- The loader leaves the DOM by returning `null` when `phase === "done"` (`HomePageLoader.tsx:133`).

## Steps

1. `src/layouts/RootLayout.astro`: replace the opening `<script is:inline define:vars={{ seedIntro: ... }}>` tag (line 31) with the multi-line opening tag from Target that passes both `hasLoader` and `seedIntro`. Then replace the `if (seedIntro) { ... }` block (lines 39-42) with the `if (hasLoader) { ... }` block from Target. Keep everything else in the script unchanged. The draw seed stays gated on `seedIntro` exactly as today. Only the skip decision uses `hasLoader`.
2. `src/styles/global.css`: insert the `html[data-intro-skip] .home-page-loader` rule from Target after line 88 (the closing `}` of `.home-page-loader`), with one blank line before and after.
3. `src/components/home/homeIntro.ts`: add the `introSkipped()` export from Target directly after `introAllowsCopyReveal()` (after line 28), separated by one blank line.
4. `src/components/home/HomePageLoader.tsx`: add `introSkipped` to the import from `./homeIntro` (keep the current sort order, which gives `MORPH_MS, STROKE_MS, introSkipped, prefersReducedMotion, setIntroPhase`). Replace the first effect (lines 14-17) with the Target version, and add `    if (introSkipped()) return;` as the first line of the second effect (before `const reduced = prefersReducedMotion();`).
5. `src/components/home/HomeHeroCopyMotion.tsx`: add `introSkipped` to the import from `./homeIntro`. In `revealCopy`, change `if (copy.dataset.revealed === "true") return;` to `if (copy.dataset.revealed) return;`. Insert the `if (introSkipped()) { ... }` block from Target between the reduced-motion block and `const root = document.documentElement;`. In `revealVisible`, change `copy.dataset.revealed === "true"` to `copy.dataset.revealed`.
6. `src/styles/global.css`: in the hero hide rule, change `.hero-copy:not([data-revealed="true"])` to `.hero-copy:not([data-revealed])`. Leave `.hero-copy[data-revealed="true"] > *` (the animation selector) unchanged.

## Boundaries

- Do NOT touch `HomeReadySignal.tsx`, `ArtifactStage.tsx`, any artifact component, `src/pages/index.astro`, or the stub rules in `global.css`.
- Do NOT change loader timing, the stroke keyframes, or the morph curve.
- Do NOT use `localStorage` or cookies. The intro should come back in a new tab or a new visit.
- Do NOT render the loader conditionally on the server. The server cannot see `sessionStorage`. The CSS rule hides it before first paint.
- Do NOT add new dependencies.
- If plan 002 has not landed (no `data-copy-reveal` in `src/`), STOP. If any excerpt above does not match the code you find, STOP and report instead of improvising.

## Verification

- **Mechanical**: `pnpm build` exits 0 and prints `9 page(s) built`. `rg -n "krishg:intro-played" src` shows two matches in `RootLayout.astro`. `rg -n "introSkipped" src` shows 1 match in `homeIntro.ts` (the export), 3 in `HomePageLoader.tsx` (import plus 2 calls), and 2 in `HomeHeroCopyMotion.tsx` (import plus 1 call).
- **Session probe** (Playwright against `pnpm build && pnpm preview`, reduced motion off, one browser context):
  1. Load `/`. `.home-page-loader` exists and is removed within about 3 s. `sessionStorage.getItem("krishg:intro-played") === "1"`.
  2. In the same context, load `/about/`. In an init script at `DOMContentLoaded`, `getComputedStyle(document.querySelector(".home-page-loader")).display === "none"` and `document.documentElement.dataset.introPhase === "ready"`. `.home-logo` computes `visibility: visible`.
  3. In the same context, load `/`. Sample `#builder-heading` opacity every frame for 1 s from `DOMContentLoaded`. Every sample is 1, and its `.hero-copy` ends with `data-revealed="static"`.
  4. Still on `/`, run the plan 002 flash probe. It still counts 0 frames, and the creator copy ends at `data-revealed="true"`.
  5. Open a new browser context and load `/`. The loader plays again.
  6. Open a new browser context and load `/about/` first (a `homeNav={false}` page). The loader plays. Then load `/` and `/work/` in the same context. Both report `data-intro-skip="1"` at `DOMContentLoaded`, and `/work/` stub children read `0.85,1,1,1`.
- **Feel check**: run `pnpm preview`, open `/`, watch the intro once, then click "the makerhouse →" and "← Back home". Confirm:
  - The stub page and the return to `/` appear immediately with no signature screen.
  - On the return to `/`, the builder copy is simply there. The builder artifact fades in over 280 ms as its scene becomes ready.
  - Scrolling to the creator band still plays its rise, with no flash first.
  - Toggle `prefers-reduced-motion: reduce`, open a new tab, and load `/`. The reduced intro (a static signature for at least 200 ms, no draw, no morph) shows once, and the next page skips it.
- **Done when**: all six session probe steps pass and the build passes.

This target was prototyped on a `/tmp` copy of a1bfa74 with plans 001 and 002
applied. All six probe steps passed in Chromium with 0 page errors. Skipped
pages removed the loader node 38 to 334 ms after navigation, and it was
already `display: none` at `DOMContentLoaded`.
