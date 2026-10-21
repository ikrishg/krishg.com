# Animation plans

Written by an `improve-animations` Phase 1-3 audit of homepage and stub-page
chrome motion. The audit was requested at 8d44675. Plans are stamped against
a1bfa74, the branch head when they were written. Each plan is self-contained
and has a drift STOP rule.

| # | Plan | Severity | Status |
| --- | --- | --- | --- |
| 001 | [Make stub page content visible after its entrance](001-stub-content-invisible.md) | HIGH | DONE |
| 002 | [Keep unrevealed band copy hidden until its rise starts](002-band-copy-flash-before-rise.md) | HIGH | DONE |
| 003 | [Play the page loader once per browser session](003-loader-once-per-session.md) | HIGH | DONE |

## Execution order

1. **001**. One deleted line. Independent of the others. Restores content on eight stub pages.
2. **002**. Fixes a regression from a1bfa74. Must land before 003.
3. **003**. Largest change. Depends on 002.

## Dependencies

- 003 depends on 002. It edits the same effect in `HomeHeroCopyMotion.tsx` and relies on the `data-copy-reveal="armed"` gate.
- 001 is independent. After 003, stub entrances become visible on every stub page except the session's first, which is still covered by the loader.

All three were applied together to a `/tmp` copy of a1bfa74 and built with
`astro build`, and every verification probe in the plans passed in Chromium.
Nothing in `src/` was changed by the audit.

## Next candidate (HIGH, not yet planned)

**Hydrate the visible band first.** In `src/pages/index.astro`, the first
band's artifact uses `client:visible` (line 44). The two offscreen artifacts use
`client:load` (lines 56 and 67). So WebGL setup for scenes nobody can see
competes with the loader's 1.4 s signature draw.

Exact change: line 44 `<BuilderArtifact slot="artifact" client:load />`,
line 56 `<CreatorArtifact slot="artifact" client:visible />`, line 67
`<EducatorArtifact slot="artifact" client:visible />`.

Measured on this VM with software WebGL, 5 alternating cold pairs at a1bfa74
and 0 errors:

- Loader removal: median 2792 ms to 2100 ms.
- Long-task time inside the draw: 1218 ms to 653 ms.
- Longest task inside the draw: 763 ms to 314 ms.

With step scrolling, the lazily hydrated creator scene was ready 418 to 439 ms
before its copy revealed (3 runs). Confirm on a real device before relying on
the magnitude.
