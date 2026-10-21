---
name: krishg.com
description: Three-band portfolio homepage with saturated role colors and interactive 3D heroes.
colors:
  builder-bg: "#398fd0"
  builder-fg: "#fff9ec"
  creator-bg: "#b94a3f"
  creator-fg: "#fff8ea"
  educator-bg: "#d8a12a"
  educator-fg: "#252d45"
  footer-bg: "#f3f0ea"
  footer-ink: "#252d45"
typography:
  display:
    fontFamily: "Inter Tight, Space Grotesk, system-ui, sans-serif"
    fontSize: "clamp(3.5rem, 7.78vw, 7rem)"
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "-0.045em"
  body:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "clamp(1.25rem, 1.94vw, 1.75rem)"
    fontWeight: 400
    lineHeight: 1.35
  label:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "clamp(1.25rem, 1.67vw, 1.5rem)"
    fontWeight: 500
    lineHeight: 1.2
spacing:
  gutter: "1.5rem"
  band-gap-md: "2rem"
  band-gap-lg: "4rem"
rounded:
  none: "0"
  pill: "999px"
components:
  hero-cta:
    textColor: "{colors.builder-fg}"
    typography: "{typography.label}"
    padding: "0.35rem 0"
---

## Overview

Experience-mode portfolio surface. Each viewport band is a single saturated color field with uppercase display type, a short subline, an underlined CTA, and a centered 3D artifact. The nav tints to the active band while scrolling.

## Colors

Role bands own background and foreground pairs (`--home-*-bg` / `--home-*-fg`). Footer uses warm neutral `--home-footer-bg` and ink `--home-footer-ink`. No sitewide dark theme; contrast is evaluated per band.

## Typography

Display headings use Inter Tight (800, tight line-height, negative tracking, uppercase). Subtext and CTAs use Space Grotesk at fluid clamp sizes. Body default on `body.site-body` is Space Grotesk with `ss01` feature.

## Layout

Content max width `--home-content-max` (78rem) with `--gutter` horizontal padding. Desktop bands are fixed `--home-band-height` (600px). Mobile stacks copy above artifact with relaxed band height. Creator band can mirror layout (`artifactFirst`, `copyAlign: right`).

## Elevation & Depth

Flat color fields; depth comes from 3D WebGL scenes and subtle loader fade. CTAs use underline only, not filled buttons.

## Shapes

Sharp editorial layout; artifacts live in rectangular canvas regions with optional `max-width: 45vw` on desktop mockup stages.

## Components

- **Hero section**: grid copy + artifact, per-accent CSS variables `--hero-bg` / `--hero-fg`
- **Artifact stage**: R3F canvas with orbit controls when engaged
- **Home loader**: fixed fullscreen signature SVG stroke draw (respects reduced motion)
- **Navbar**: theme swaps via `data-home-nav-theme`

## Do's and Don'ts

- Do keep each band one role, one CTA, one artifact.
- Do preserve 24px+ safe clearance around 3D meshes at target viewports.
- Don't add generic card grids or stock hero illustrations on the homepage.
- Don't mix accent colors across bands within one section.
