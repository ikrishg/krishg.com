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

## Rejected candidate

**Hydrate the visible band first** (swap builder to `client:load`, offscreen
bands to `client:visible`) was measured as a loader win on this VM, but it is
**rejected**: offscreen GLBs must hydrate on page load so they are ready when
scrolled to. `client:visible` only mounts once the section is in frame, which
is the lag this site avoids. Keep creator/educator on `client:load`.
