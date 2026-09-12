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


**Live demo:** https://flam-adaptive-ads.vercel.app

## Architecture

`AdSpecification + SurfaceProfile → generic resolver → ResolvedLayout → React renderer`.

The resolver is framework-independent TypeScript. It does not import React, DOM APIs, CSS, browser measurements, or surface names. Geometry is owned by the resolver; the renderer only presents the resolved geometry. The full step-by-step breakdown of the resolution pipeline, composition families, and degradation order lives in ARCHITECTURE.md.

## Surfaces

- Mobile Portrait — `320 × 480`
- Mobile Landscape — `480 × 320`
- Broadcast Lower Third — `1920 × 250`
- Retail Kiosk — `1080 × 1080`
- Compact Widget — `400 × 360`, deliberately too tight for all five elements at full priority, used to demonstrate branding getting dropped cleanly
- Unknown — `713 × 287`

The fifth and sixth surfaces use the same resolver without a new surface-specific branch.

`viewingDistance` (`'near' | 'far'`) is a real, load-bearing constraint, not a label: far-viewing surfaces (currently only Broadcast Lower Third) get proportionally wider gaps between elements than a near surface of the same pixel size, independent of `minTextSize`. See ARCHITECTURE.md §1 for why spacing and glyph size are treated as two separate legibility constraints.

## Content and QA

The demo includes headline, product image, price, CTA, and FLAM AI logo content. Text sizing is calculated from the final candidate width, image geometry preserves aspect ratio, CTA sizing respects touch requirements, and degradation triggers a fresh resolution pass.

The automated suite checks deterministic resolution, safe-area bounds, overlap, text fit, image ratio, CTA constraints, extreme price content, all surfaces, and real browser DOM geometry. Playwright checks the rendered frame and visible element bounding boxes independently of the resolver's validation status.

## Known limitations

The element type set is fixed to text, image, and button. Adding a new type means extending the discriminated union in ad.ts and adding sizing logic in placement.ts — the resolver isn't generic over arbitrary element shapes, it's generic over surfaces and priorities for the three types it knows about.

Each surface switch is still a fresh, independent resolution pass — the resolver itself doesn't know or care what the previous layout looked like, and produces no interpolation data. The DOM renderer gets a smooth transition anyway, for free, from plain CSS `transition` rules on `.ad-frame`/`.ad-element` (see styles.css) reacting to the new resolved values. The Canvas renderer has no CSS to lean on, so CanvasAdRenderer.tsx does the equivalent by hand: it keeps the previous ResolvedLayout, tweens position/size/font-size between the two on every animation frame, and cross-fades elements that only exist on one side of the switch (e.g. branding dropping out). Both respect `prefers-reduced-motion`.

Text measurement is real in one place and heuristic everywhere else. I used the calibrated character-width heuristic (AVERAGE_CHARACTER_WIDTH / TEXT_ESTIMATE_SAFETY_FACTOR in constraints.ts) for the resolver's actual sizing and wrapping/truncation decisions — that's within what the FAQ allows ("a well-reasoned priority-ordered algorithm is sufficient... correct, explainable behavior" over mathematical precision), and every degradation/placement decision in the demo is tuned and tested against it. I did try wiring real canvas measureText (textMeasure.ts) into the resolver itself so it would drive those wrap/truncate decisions directly, not just the heuristic. I got real measurement working — it's in the codebase and it's live in the DOM renderer, sharpening exactly how many characters fit before the truncation ellipsis. But wiring it into the resolver's own estimateText/fitTextFontSize meant the resolver's core sizing math would only be exact in a real browser (measureTextWidth returns null in Node/Vitest, so every test would need separate expected values for the browser case vs. the test case), and it would touch every already-tuned placement/degradation decision in the pipeline. I ran out of time to do that safely before the deadline, so full text-measurement-aware resolution is future work, not something I'm claiming as done.

The accessibility contrast check in contrast.ts is opt-in — it only runs when a surface sets backgroundColor and a branding element sets foregroundColor. broadcastLowerThird and the logo element now set exactly the colors the logo pill is already rendered with (.ad-element.logo in styles.css: background #111, color #fff), so the check genuinely fires against real demo content on that surface, not just in isolated unit tests. It passes comfortably (~18.9:1 against the 4.5:1 WCAG AA minimum), so the logo is never forced to hide or reposition because of it. The other shipped surfaces still don't set these fields, so the check simply doesn't run for them — that's still opt-in by design, not a gap.

Degradation only produces four outcomes — resize, reposition, truncate, hide. There's no partial-content strategy beyond that, e.g. no wrapping a headline into fewer words instead of truncating it, and no combining two smaller degradations instead of one larger one.

## Time spent

About 3 days, roughly 13 hours a day, plus another 6 hours on top of that — call it around 45 hours total.

## AI disclosure

I used AI for comments — writing and cleaning up the explanatory comments through the code — and separately to double check the documents (README/ARCHITECTURE) actually match what the code does, rather than trusting my own memory of what I'd written days earlier.
