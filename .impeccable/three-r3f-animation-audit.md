# Three / R3F / animation skill audit (2026-10-21)

Skills applied: `r3f-best-practices`, `three-best-practices`, `review-animations`, `animation-performance`.

## Already aligned

- `frameloop="demand"` + `invalidate()` on interaction (`frame-render-on-demand`, `render-conditional`).
- `useGLTF.preload` per scene; now also centralized `preloadHomeHeroGlbs`.
- No `setState` inside `useFrame` in hero scenes (`perf-never-set-state-in-useframe`).
- IntersectionObserver pauses work off-screen (`vitals-lazy-load` pattern).
- `interaction` / `appearance` dispose on unmount (`memory-dispose-on-unmount`).
- Loader honors `prefers-reduced-motion` (`review-animations` #8).
- Hero CTA uses opacity-only hover under 300ms (`review-animations` #4, #7).

## Code changes from this pass

| Rule | Change |
|------|--------|
| `render-avoid-allocations` | Reuse `Vector3` / `Spherical` in `HeroOrbitControls` easing |
| `render-pixel-ratio` / `mobile-optimization` | Cap canvas DPR at 1.5 mobile / 1.75 desktop |
| `error-handling-recovery` | `webglcontextlost` / `webglcontextrestored` on canvas |
| `loading-preload` | `PreloadHomeHeroGlbs` on homepage |

## Findings (no code change this pass)

| Severity | Finding | Skill |
|----------|---------|-------|
| P2 | Navbar scroll state animates `backdrop-filter` (paint-tier, not composite-only) | `animation-performance` |
| P2 | R3F chunk >500kB; consider route-level split if LCP regresses | `core-web-vitals` |
| P3 | `ContactShadows` blur each frame when invalidating during drag | `lighting-shadows-advanced` |
| Note | Space Grotesk is a common display face; kept as incumbent | `emil-design-eng` |

## Emil skill bundle

Installed for motion and UI craft (`animate`, `review-animations`, `animation-performance`, etc.). Homepage motion reviewed via `review-animations` bar above; no new motion added (`find-animation-opportunities` not triggered).
