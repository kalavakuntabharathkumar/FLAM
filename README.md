# Adaptive Layout Engine for Multi-Surface Ads

A React + TypeScript + Vite demonstration of a framework-independent, constraint-based adaptive layout engine. One shared `AdSpecification` is resolved independently against four required surfaces plus an intentionally unknown fifth surface (`713 × 287`).

## Run

```bash
npm install
npm run dev
```

Open the localhost URL printed by Vite.

## Verification commands

```bash
npm run typecheck
npm run build
npm run test
npm run test:e2e
npm run test:all
```

`test:all` is the complete local verification pipeline.

## Architecture

`AdSpecification + SurfaceProfile → generic resolver → ResolvedLayout → React renderer`.

The resolver is framework-independent TypeScript. It does not import React, DOM APIs, CSS, browser measurements, or surface names. Geometry is owned by the resolver; the renderer only presents the resolved geometry.

## Surfaces

- Mobile Portrait — `320 × 480`
- Mobile Landscape — `480 × 320`
- Broadcast Lower Third — `1920 × 250`
- Retail Kiosk — `1080 × 1080`
- Unknown — `713 × 287`

The fifth surface uses the same resolver without a new surface-specific branch.

## Content and QA

The demo includes headline, product image, price, CTA, and FLAM AI logo content. Text sizing is calculated from the final candidate width, image geometry preserves aspect ratio, CTA sizing respects touch requirements, and degradation triggers a fresh resolution pass.

The automated suite checks deterministic resolution, safe-area bounds, overlap, text fit, image ratio, CTA constraints, extreme price content, all five surfaces, and real browser DOM geometry. Playwright checks the rendered frame and visible element bounding boxes independently of the resolver's validation status.
