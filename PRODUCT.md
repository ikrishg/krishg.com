# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Astro 7 static site, React 19 + React Three Fiber for homepage 3D hero bands. Deployed on Vercel (`hivemind`, team sineveritas). Package manager: pnpm.

## Users

Visitors who want a fast sense of who Krish Gupta is across builder, creator, and educator roles. They skim three full-viewport hero bands, interact with 3D artifacts (computer, portrait frame, book), and follow CTAs to role stubs (makerhouse, atelier, library).

## Product Purpose

Personal portfolio and identity site for Krish Gupta. Success means each role reads clearly in under a few seconds, artifacts feel tactile and on-brand, and navigation into each role is obvious.

## Positioning

Three parallel hero identities with bespoke interactive 3D objects vendored from krish-3d-objects, not a generic template portfolio.

## Capabilities

- Homepage with three themed bands (builder, creator, educator) and orbit-capable 3D scenes
- Global nav with scroll-linked theme per band
- Initial page loader with signature stroke animation (once per session)
- Stub routes for `/building`, `/creating`, `/educating` (content in progress)

## Constraints and assets

- Band height token `--home-band-height` (600px desktop bands)
- Per-accent color tokens in `src/styles/global.css` and `hero-types.ts`
- GLB assets under `public/home-3d/`
- Respect `prefers-reduced-motion` for loader and scene motion

## Voice and brand

Direct, lowercase role labels (`builder`, `creator`, `educator`). Short subtext lines and underlined text CTAs. No hype claims beyond listed roles.

## Accessibility

Semantic headings per band, sr-only page h1, file inputs hidden from tab order. 3D stages use pointer and grab cursors when engaged; touch-action tuned for scroll vs orbit.

## Open decisions

- Role stub pages remain placeholders until content ships.
- *(Inferred without live interview: operator asked autonomous Impeccable init; confirm users, positioning, and voice if any field is wrong.)*
