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

All three composition families are generated unconditionally for every surface and element set — `candidates()` in `composition.ts` does not rank, filter, or reorder them by aspect ratio, content pressure, or any other heuristic. `resolveLayout()` in `resolver.ts` builds and fully validates a complete layout for each candidate composition and picks the winner via its own `score()` (visible element count, priority-weighted content, area efficiency, truncation penalty, validity). A composition-level ranking heuristic existed earlier in development but was removed once it became clear it never affected the final choice: `resolveLayout()` already scored and picked from the full candidate set regardless of the order `candidates()` returned it in. `candidates()` in `composition.ts` takes no parameters — it previously accepted unused `surface`/`elements` parameters reserved for a possible future pruning optimization (e.g. skipping an obviously-impossible composition before a full placement pass), but an unused parameter is worse API surface than adding one back if that optimization is ever implemented. The three composition families themselves are generic:

- **vertical** — stacked content
- **horizontal** — one-row content
- **mixed** — geometry-aware two-column composition

The mixed composition partitions image content from non-image content; it does not inspect any surface identity.

### 3.1 Why Mobile Portrait and Mobile Landscape both resolve to `vertical`

Both mobile surfaces land on the same composition family, but for different, independently-computed reasons — this is a coincidence of the scoring outcome, not a shortcut in the resolver. The clearest case to trace is Mobile Landscape (`480 × 320`), because `mixed` is genuinely competitive there before it fails validation.

At the demo spec's full priority (5 elements, nothing hidden or truncated):

- Safe rect: `x:16, y:14, width:448, height:292` (safe area 16/16 horizontal, 14/14 vertical)
- Gap: `8px` (near viewing distance)
- `placeMixed` splits elements into `left = [product-image]` and `right = [headline, cta, price, logo]`
- `minLeft = 80` (product-image's minWidth), `minRight = 110` (headline's minWidth, the largest of the four "right" minimums)
- `usable = safe.width − gap = 440`
- `leftPreferred = max(minLeft, min(usable − minRight, Σ left.maxWidth)) = max(80, min(330, 640)) = 330`
- `rightWidth = usable − leftPreferred = 110`

The image column gets 330px; all four right-column elements — including a 3-line headline — are squeezed into a single shared 110px-wide column. At that width, `fitTextFontSize` cannot keep the headline at or above its 16px minimum font size and it still overflows its box, producing two real validation failures: `BELOW_MIN_TEXT_SIZE` and `TEXT_CLIPPING`.

Measured against the actual demo spec and surface profile (values from an instrumented run of the real resolver code, not estimated):

| Composition | valid | visible | area efficiency | issues | score |
|---|---|---|---|---|---|
| vertical | true | 5 | 0.406 | 0 | 105,315.64 |
| mixed | **false** | 5 | **0.829** | 2 | −14,642.06 |
| horizontal | false | 0 | 0 | 4 | −40,000 |

`mixed` is actually the more area-efficient candidate (~83% vs ~41% safe-area usage) — it is not a bad layout in terms of packing. It loses purely because `score()` in `resolver.ts` weights validity at 100,000 and penalizes each validation issue at −10,000, deliberately dwarfing the ~100-point efficiency term. This reflects the intended scoring hierarchy — a correct, non-clipping layout must always beat a tighter-packed but broken one — not a defect in `placeMixed`'s column-split math, which computed exactly what its own formula specifies.

Mobile Portrait (`320 × 480`) resolves to vertical for an unrelated, simpler reason: at that aspect ratio there usually isn't enough width for two side-by-side columns to clear both columns' minimum widths in the first place, so `mixed` is rejected earlier in the same scoring process rather than via the specific 110px-column failure described above. Both surfaces still generate and evaluate all three composition candidates on every resolve — neither surface receives special-cased treatment.

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
