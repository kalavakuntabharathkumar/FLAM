# Architecture

## 1. Input model

`AdSpecification` contains only semantic content and generic element constraints: content, kind, priority, minimum/preferred dimensions, text/image constraints, and flexibility. It contains no surface-specific coordinates or layout instructions.

`SurfaceProfile` contains dimensions and hard constraints such as safe area, minimum text size, touch target, viewing distance, and touch capability.

`viewingDistance` ('near' | 'far') independently widens the gap between elements for far-viewing surfaces (e.g. broadcast lower-thirds) — see `VIEWING_DISTANCE_GAP_MULTIPLIER` in `placement.ts`. This is deliberately separate from `minTextSize`: glyph size and inter-element spacing are two different legibility concerns at a distance, and a surface can need more of one without needing more of the other.

## 2. Resolution pipeline

`resolveLayout()` performs:

1. usable-area calculation
2. deterministic vertical/horizontal/mixed candidate generation
3. content-aware sizing using candidate widths
4. placement
5. hard-constraint validation
6. deterministic degradation when necessary
7. complete re-resolution after every degradation
8. final scoring and selection

The resolver never reads a surface id or name.

## 3. Composition

All three composition families are generated unconditionally for every surface and element set — `candidates()` in `composition.ts` does not rank, filter, or reorder them by aspect ratio, content pressure, or any other heuristic. `resolveLayout()` in `resolver.ts` builds and fully validates a complete layout for each candidate composition and picks the winner via its own `score()` (visible element count, priority-weighted content, area efficiency, truncation penalty, validity). A composition-level ranking heuristic existed earlier in development but was removed once it became clear it never affected the final choice: `resolveLayout()` already scored and picked from the full candidate set regardless of the order `candidates()` returned it in. `composition.ts` still accepts `surface` and `elements` as parameters — reserved for a possible future pruning optimization (e.g. skipping an obviously-impossible composition before a full placement pass) — but does not read them today. The three composition families themselves are generic:

- **vertical** — stacked content
- **horizontal** — one-row content
- **mixed** — geometry-aware two-column composition

The mixed composition partitions image content from non-image content; it does not inspect any surface identity.

## 4. Content-aware sizing

Element boxes are bounded by minimum useful size and preferred useful size rather than arbitrary container-sized allocations. Text is measured at the exact candidate width that will be rendered, using a calibrated character-width heuristic — not real browser text measurement. The heuristic bakes in a safety margin so the resolver never under-allocates space relative to what actually renders.

The text flow is:

`candidate width → text measurement (heuristic) → required height → placement → final validation`.

If space is constrained, text can reduce to its declared minimum readable size before lower-priority degradation is considered.

Real canvas-based text measurement does exist in the codebase (`textMeasure.ts`), but it is used only at render time, in the DOM renderer, to sharpen the truncation ellipsis on already-truncated text. It does not feed back into the resolver's sizing or degradation decisions.

## 5. Degradation

Degradation is deterministic and priority-aware. Explicitly truncatable content is considered before droppable content. Repositioning to a free safe-area corner is tried before an element is dropped outright, and is only committed if a real placement + validation trial against it succeeds. After any degradation decision, the resolver does not reuse stale coordinates: it rebuilds candidates, recomputes dimensions, places everything again, and validates the complete result.

If normal priority-based degradation runs out of options and the best candidate is still invalid, the resolver falls back to a minimal, verified layout built from only the highest-priority elements rather than returning broken geometry. If even that cannot produce a valid layout, it throws instead of handing back overlapping or clipped output.

## 6. Validation

The validator checks:

- logical surface bounds
- safe-area bounds
- finite positive dimensions
- pairwise overlap
- minimum readable text size
- minimum CTA target when touch is required
- text overflow/clipping conditions
- image aspect ratio
- excessive allocation against declared maxima
- invalid spacing
- missing required content
- branding contrast against a surface background, when both a surface's `backgroundColor` and an element's `foregroundColor` are explicitly set

That last check is opt-in: it only runs when a surface sets `backgroundColor` and a branding element sets `foregroundColor`. `broadcastLowerThird` and the logo element set exactly the colors the logo pill is already rendered with (`#111111` background, `#ffffff` foreground), so the check genuinely fires against real demo content on that surface (~18.9:1, comfortably above the 4.5:1 WCAG AA minimum) — not just in isolated unit tests. The other shipped surfaces still don't set these fields, so the check simply doesn't run for them; that remains opt-in by design.

A `VALID LAYOUT` result therefore represents the resolver's hard constraints, but browser E2E tests independently inspect the actual DOM geometry and rendered text dimensions.

## 7. Rendering and preview scaling

`AdRenderer` consumes `ResolvedLayout` as the source of truth. It does not reposition, resize, hide, or recompose elements.

The logical surface is rendered at its exact dimensions. The preview computes one uniform scale:

`min(previewWidth / logicalWidth, previewHeight / logicalHeight)`

The entire logical surface is transformed together, allowing letterboxing but not intentional clipping.

`CanvasAdRenderer` consumes the same `ResolvedLayout` through the same contract, proving the resolver's output is renderer-agnostic rather than tied to DOM-specific assumptions.

## 8. Genericity rule

There are no surface-name branches, width-specific coordinates, hidden breakpoints, renderer geometry hacks, or CSS overflow used to conceal resolver failures. Adding a new surface requires only another `SurfaceProfile`. Adding a new renderer requires only consuming `ResolvedLayout` — the compact widget, unknown surface, and Canvas renderer in this repo were all added without changing `resolver.ts`, `placement.ts`, `composition.ts`, or `degradation.ts`.
