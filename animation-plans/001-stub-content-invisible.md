# 001 — Make stub page content visible after its entrance

- **Status**: TODO
- **Commit**: a1bfa74 (audit requested at 8d44675; this bug is identical at 8d44675, 01d147f, and a1bfa74)
- **Severity**: HIGH
- **Category**: Correctness / entrance animation end state
- **Estimated scope**: 1 file, delete 1 line

## Problem

Every stub page (`/about/`, `/work/`, `/building/`, `/creating/`, `/educating/`,
`/talks/`, `/writing/`, `/articles/`) is blank for visitors whose OS does not
ask for reduced motion. The eyebrow, title, lead, and "Back home" link all end
their entrance at opacity 0 and stay there. Only the accent color fill and the
navbar remain.

`src/styles/global.css:177-183` defines the keyframes with a `from` keyframe only:

```css
/* src/styles/global.css:177-183 — current */
  @keyframes stub-rise {
    from {
      opacity: 0;
      translate: 0 0.75rem;
      scale: 0.985;
    }
  }
```

`src/styles/global.css:211-214` applies it:

```css
/* src/styles/global.css:211-214 — current */
  html[data-motion-enhance] .stub-page__inner > * {
    opacity: 0;
    animation: stub-rise 0.45s var(--ease-out) both;
  }
```

A keyframe list with no `to` keyframe animates toward the element's own
computed value. That value is the `opacity: 0` declared in the same rule. The
animation runs from 0 to 0. `animation-fill-mode: both` then holds the end
state forever.

Measured in Chromium against a local build of a1bfa74 with
`prefers-reduced-motion: no-preference`. Once the loader is removed and
1200 ms more pass, every `.stub-page__inner > *` reports `opacity: 0`,
`animation-name: stub-rise`, play state `finished`. With
`prefers-reduced-motion: reduce` the same nodes report 0.85 / 1 / 1 / 1
because the reduce block at `src/styles/global.css:229-237` forces opacity 1.

The hero copy uses the same `from`-only keyframe pattern safely because its
hide rule (`global.css:185-197`) is a separate selector that stops matching
once `data-revealed="true"` is set. The stub rule has no such switch.

## Target

```css
/* src/styles/global.css:211-214 — target */
  html[data-motion-enhance] .stub-page__inner > * {
    animation: stub-rise 0.45s var(--ease-out) both;
  }
```

Nothing else changes. `animation-fill-mode: both` already applies the `from`
keyframe (opacity 0, `translate: 0 0.75rem`, `scale: 0.985`) during each
child's delay, so removing the extra `opacity: 0` does not cause a flash
before the rise starts. The `to` state becomes the element's real resting
opacity (0.85 for `.stub-page__eyebrow` from `src/components/StubPage.astro:56`,
1 for the rest).

Keep these values exactly as they are:

- Duration `0.45s`, easing `var(--ease-out)` (`cubic-bezier(0.23, 1, 0.32, 1)`).
- Delays `0.06s`, `0.12s`, `0.18s` on `nth-child(2)`, `(3)`, `(4)` at `global.css:216-226`.
- The reduce block at `global.css:229-237`.

## Repo conventions to follow

- Entrance keyframes in this file declare only `from` and let the element's resting style be the `to`. Exemplar: `@keyframes hero-copy-rise` at `src/styles/global.css:169-175`, paired with a hide rule that lives on a separate selector (`global.css:185-197`).
- Motion lives inside `@media (prefers-reduced-motion: no-preference)` (`global.css:168`), with a matching `@media (prefers-reduced-motion: reduce)` block at `global.css:229-237`.
- Easing uses the `--ease-out` token. Do not hand-type the curve.

## Steps

1. In `src/styles/global.css`, inside the rule `html[data-motion-enhance] .stub-page__inner > *` (line 211), delete the line `    opacity: 0;` (line 212). The rule must end up exactly as shown in Target.

## Boundaries

- Do NOT touch `src/components/StubPage.astro`, any page in `src/pages/`, or the hero copy rules at `global.css:185-209`.
- Do NOT change the keyframes, durations, delays, or easing.
- Do NOT add a `to` keyframe. The fix is removing the stray declaration, not adding a second source of truth.
- Do NOT add new dependencies.
- If line 212 is not `    opacity: 0;` inside that rule (drift since a1bfa74), STOP and report instead of improvising.

## Verification

- **Mechanical**: `pnpm build` exits 0 and prints `9 page(s) built`. `rg -n "stub-page__inner > \* \{" -A3 src/styles/global.css` shows the `animation:` line directly under the selector and no `opacity: 0;`.
- **Probe** (Playwright or DevTools console on `/about/` with reduced motion off, run after the loader is gone and the entrance has finished, about 2.5 s after load):
  ```js
  [...document.querySelectorAll(".stub-page__inner > *")].map(
    (el) => `${el.className}:${getComputedStyle(el).opacity}`,
  );
  ```
  Expected: `stub-page__eyebrow:0.85`, `stub-page__title:1`, `stub-page__lead:1`, `stub-page__back:1`. Before the fix all four read `0`.
- **Feel check**: run `pnpm dev`, open `/about/`, and confirm:
  - The eyebrow, title, lead, and back link are visible and stay visible.
  - In DevTools, set Animations playback to 10%. Each child rises about 12px and settles from 98.5% scale, staggered 60 ms apart. No child appears at full opacity before its own rise starts.
  - Toggle `prefers-reduced-motion: reduce` in the Rendering panel and reload. Content is visible immediately with no movement.
  - On every load the page loader covers the stub for about 2 s, so the rise plays underneath it. That is expected until plan 003 lands. To watch the rise now, wait for the loader to leave, then use the replay button in the DevTools Animations panel.
- **Done when**: the probe returns the expected values on `/about/` and `/work/` with reduced motion off, and the build passes.

This target was prototyped on a `/tmp` copy of a1bfa74. `/about/` and `/work/`
read `0.85,1,1,1` after the change, against `0,0,0,0` before.
