# Architecture

## 1. Input model

`AdSpecification` contains only semantic content and generic element constraints: content, kind, priority, minimum/preferred dimensions, text/image constraints, and flexibility. It contains no surface-specific coordinates or layout instructions.

`SurfaceProfile` contains dimensions and hard constraints such as safe area, minimum text size, touch target, viewing distance, and touch capability.

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

Candidates are ordered from aspect ratio, content pressure, minimum width pressure, and height pressure. The three composition families are generic:

- **vertical** — stacked content
- **horizontal** — one-row content
- **mixed** — geometry-aware two-column composition

The mixed composition partitions image content from non-image content; it does not inspect any surface identity.

## 4. Content-aware sizing

Element boxes are bounded by minimum useful size and preferred useful size rather than arbitrary container-sized allocations. Text is measured at the exact candidate width that will be rendered.

The text flow is:

`candidate width → text measurement → required height → placement → final validation`.

If space is constrained, text can reduce to its declared minimum readable size before lower-priority degradation is considered.

## 5. Degradation

Degradation is deterministic and priority-aware. Explicitly truncatable content is considered before droppable content. After a degradation decision, the resolver does not reuse stale coordinates: it rebuilds candidates, recomputes dimensions, places everything again, and validates the complete result.

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

A `VALID LAYOUT` result therefore represents the resolver's hard constraints, but browser E2E tests independently inspect the actual DOM geometry and rendered text dimensions.

## 7. Rendering and preview scaling

`AdRenderer` consumes `ResolvedLayout` as the source of truth. It does not reposition, resize, hide, or recompose elements.

The logical surface is rendered at its exact dimensions. The preview computes one uniform scale:

`min(previewWidth / logicalWidth, previewHeight / logicalHeight)`

The entire logical surface is transformed together, allowing letterboxing but not intentional clipping.

## 8. Genericity rule

There are no surface-name branches, width-specific coordinates, hidden breakpoints, renderer geometry hacks, or CSS overflow used to conceal resolver failures. Adding a new surface requires only another `SurfaceProfile`.
