# 002 — Keep unrevealed band copy hidden until its rise starts

- **Status**: TODO
- **Commit**: a1bfa74 (regression introduced in a1bfa74; not present at 8d44675)
- **Severity**: HIGH
- **Category**: Correctness / entrance flash
- **Estimated scope**: 2 files, about 6 changed lines

## Problem

On the homepage, the creator and educator headings, subtext, and CTA flash.
They scroll into view at full opacity, snap to opacity 0, then rise. The rise
is meant to be the first time the copy appears.

`src/styles/global.css:185-197` only hides unrevealed copy while the intro is
running:

```css
/* src/styles/global.css:185-197 — current */
  /*
   * Hide copy only while the intro is in progress. After ready, unrevealed
   * copy fails open so a missing reveal script cannot leave text invisible.
   */
  html[data-motion-enhance]:is(
      [data-intro-phase="draw"],
      [data-intro-phase="morph"],
      [data-logo-morph="pending"]
    )
    .hero-copy:not([data-revealed="true"])
    > * {
    opacity: 0;
  }
```

Once `data-intro-phase="ready"` is set, bands 2 and 3 have not been revealed
yet. They are below the fold, and the rule no longer matches, so they sit at
opacity 1. When the visitor scrolls, `src/components/home/HomeHeroCopyMotion.tsx:45-54`
reveals a band only after 35% of it is inside a root shrunk by
`-8% 0px -18% 0px`. By then the copy is already on screen. Setting
`data-revealed="true"` starts `hero-copy-rise` (`global.css:199-201`), whose
`from` keyframe is `opacity: 0` with fill mode `both`. The copy jumps to 0 and
fades back in.

Measured in Chromium (1440×900, local builds, one run per side, 12 steps of
80 px every 60 ms after the loader left):

- a1bfa74: `#creator-heading` was on screen at opacity 1 for 6 sampled frames (top from 891 px to 730 px, about 540 ms). It then read opacity 0 on the reveal frame and rose to 1.
- 8d44675: the same heading read opacity 0 on every frame until reveal. No flash. Its hide rule was `html[data-motion-enhance] .hero-copy:not([data-revealed="true"]) > *` with no intro-phase condition.

The fail-open intent in a1bfa74 is good. If the reveal script never runs, copy
must not stay invisible. The root cause is that the rule uses "intro finished"
as its stand-in for "nothing will reveal this copy". The script that reveals
copy is `HomeHeroCopyMotion`. Its presence should be what keeps copy hidden.

`src/components/home/HomeHeroCopyMotion.tsx:19-29` (current):

```tsx
  useEffect(() => {
    const copies = Array.from(
      document.querySelectorAll<HTMLElement>(COPY_SELECTOR),
    );
    if (!copies.length) return;

    if (prefersReducedMotion()) {
      for (const copy of copies) copy.dataset.revealed = "true";
      return;
    }

```

`src/components/home/HomeHeroCopyMotion.tsx:73-79` (current):

```tsx
    revealVisible();

    return () => {
      observer.disconnect();
      phaseObserver.disconnect();
    };
  }, []);
```

## Target

```css
/* src/styles/global.css:185-198 — target */
  /*
   * Hide unrevealed copy while the intro runs, and after that only while
   * HomeHeroCopyMotion is mounted to reveal it. Without it, copy fails open.
   */
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

```tsx
// src/components/home/HomeHeroCopyMotion.tsx — target, effect head
  useEffect(() => {
    const copies = Array.from(
      document.querySelectorAll<HTMLElement>(COPY_SELECTOR),
    );
    if (!copies.length) return;

    if (prefersReducedMotion()) {
      for (const copy of copies) copy.dataset.revealed = "true";
      return;
    }

    const root = document.documentElement;
    root.dataset.copyReveal = "armed";

```

```tsx
// src/components/home/HomeHeroCopyMotion.tsx — target, effect tail
    revealVisible();

    return () => {
      observer.disconnect();
      phaseObserver.disconnect();
      delete root.dataset.copyReveal;
    };
  }, []);
```

Values that stay exactly as they are:

- `hero-copy-rise` keyframes: `opacity: 0; translate: 0 0.75rem; scale: 0.985` (`global.css:169-175`).
- `0.55s var(--ease-out) both`, delays `0.06s` and `0.12s` (`global.css:199-209`).
- Observer `threshold: 0.35`, `rootMargin: "-8% 0px -18% 0px"`.

The attribute is set in the same synchronous effect that calls
`revealVisible()`. The band in view is revealed before the browser restyles,
so it never flips. Bands 2 and 3 are off screen when they become hidden.

## Repo conventions to follow

- Intro and motion state lives on `<html>` as `data-*` attributes and CSS reads them. Exemplars: `root.dataset.motionEnhance = "1"` in `src/layouts/RootLayout.astro:36`, `root.dataset.introPhase` in `src/components/home/homeIntro.ts:16-24`.
- Effects clean up what they set. Exemplar: `return () => setIntroPhase("ready")` in `src/components/home/HomePageLoader.tsx:16`.
- The hide rule stays inside `@media (prefers-reduced-motion: no-preference)` (`global.css:168`).

## Steps

1. In `src/styles/global.css`, replace the comment and selector at lines 185-197 with the CSS in Target. The only selector change is the added line `      [data-copy-reveal="armed"]` inside `:is(...)`, with a comma after `[data-logo-morph="pending"]`.
2. In `src/components/home/HomeHeroCopyMotion.tsx`, insert these two lines after the closing `}` of the `prefersReducedMotion()` block (after line 28) and before `const revealVisible`:
   ```tsx
       const root = document.documentElement;
       root.dataset.copyReveal = "armed";
   ```
3. In the same file, add `      delete root.dataset.copyReveal;` as the last line inside the cleanup function returned by the effect, after `phaseObserver.disconnect();`.

## Boundaries

- Do NOT touch `HomePageLoader.tsx`, `homeIntro.ts`, `RootLayout.astro`, or the stub rules at `global.css:211-226`.
- Do NOT change keyframes, durations, delays, easing, or observer options.
- Do NOT go back to the 8d44675 rule with no condition. That drops the fail-open path a1bfa74 added on purpose.
- Do NOT add new dependencies.
- If the hide rule or the effect does not match the excerpts above (drift since a1bfa74), STOP and report instead of improvising.

## Verification

- **Mechanical**: `pnpm build` exits 0 and prints `9 page(s) built`. `rg -n 'data-copy-reveal' src` shows exactly one CSS match and two TSX matches (set and delete).
- **Flash probe** (Playwright, 1440×900, reduced motion off). Load `/`, wait until `.home-page-loader` is gone plus 800 ms, then sample every frame while scrolling:
  ```js
  // in page
  window.__s = [];
  const h = document.querySelector("#creator-heading");
  const tick = () => {
    const r = h.getBoundingClientRect();
    __s.push([+getComputedStyle(h).opacity, Math.round(r.top), h.closest(".hero-copy").dataset.revealed ?? "-"]);
    if (__s.length < 300) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  // then 12 × window.scrollBy(0, 80) with 60 ms waits, then wait 900 ms
  ```
  Count frames before the first `revealed === "true"` where `top < innerHeight` and `opacity > 0.5`. Expected 0. Before the fix this was 6.
- **Fail-open probe**: against `pnpm build && pnpm preview`, in Playwright, `context.route(/HomeHeroCopyMotion\.[^/]*\.js/, (r) => r.abort())`, load `/`, and wait for the loader to leave plus 1 s. Use the regex, not a glob. Astro retries a failed island import as `HomeHeroCopyMotion.<hash>.js?astro-retry=<n>`, and a `**/*.js` glob lets the retry through. Expect two aborted requests, `#builder-heading` at `opacity: 1`, and `document.documentElement.dataset.copyReveal` `undefined`.
- **Feel check**: run `pnpm dev`, open `/`, wait for the intro, and scroll slowly into the creator band. Confirm:
  - The creator copy is not visible until it starts rising. It never appears and then disappears.
  - In DevTools, set Animations playback to 10%. Heading, subtext, and CTA rise about 12px from 98.5% scale, staggered 60 ms apart, from fully transparent.
  - Toggle `prefers-reduced-motion: reduce` and reload. All copy is visible at once with no movement.
- **Done when**: the flash probe counts 0 frames, the fail-open probe reads opacity 1, and the build passes.

This target was prototyped on a `/tmp` copy of a1bfa74. The flash probe
counted 0 frames (6 before). The fail-open probe read opacity 1 with both
chunk requests aborted. Its only console errors were the two blocked requests
and Astro's expected "Error hydrating" message for the blocked island.
