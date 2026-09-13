import type { AdSpecification, AdElementSpec } from '../types/ad';
import type { SurfaceProfile } from '../types/surface';
import type { ResolvedLayout, Composition } from '../types/layout';
import { usable } from './geometry';
import { candidates } from './composition';
import { place } from './placement';
import { validate } from './validator';
import { nextDegradation, nextReposition } from './degradation';
import { validateSpecConstraints } from './constraints';

function areaEfficiency(layout: ResolvedLayout): number {
  const visible = layout.elements.filter((e) => e.visible);
  const used = visible.reduce((sum, e) => sum + e.width * e.height, 0);
  const safeArea = Math.max(
    1,
    (layout.safeArea.right - layout.safeArea.left) * (layout.safeArea.bottom - layout.safeArea.top),
  );
  return used / safeArea;
}

function score(layout: ResolvedLayout): number {
  const visible = layout.elements.filter((e) => e.visible);
  const priorityValue = visible.reduce((sum, e) => sum + (4 - e.priority), 0);
  const issues = layout.validation.issues.length;
  const efficiency = areaEfficiency(layout);
  const truncations = visible.filter((e) => e.truncated).length;
  return (
    (layout.validation.valid ? 100000 : 0) +
    visible.length * 1000 +
    priorityValue * 25 +
    efficiency * 100 -
    truncations * 120 -
    issues * 10000
  );
}

function withTruncationState(ad: AdSpecification, trunc: Set<string>): AdElementSpec[] {
  return ad.elements.map((e) => {
    if (!trunc.has(e.id) || !e.text) return e;
    return { ...e, text: { ...e.text, maxLines: e.text.maxLines ?? 1, allowTruncation: true } };
  });
}

/**
 * Font-size shrinking happens silently inside `fitTextFontSize` — it is not
 * part of the hide/truncate priority loop, so it never produced a tracked
 * `DegradationDecision` even though `DegradationOperation` declares 'resize'
 * as a valid operation.
 *
 * This scans the final resolved layout and records a 'resize' decision for
 * every visible text (or branding-image) element whose font ended up below
 * its declared preferred size, so "why did this element end up at this
 * size" has an actual answer in the degradation log instead of only being
 * inferable from the raw fontSize number.
 */
function resizeDecisions(
  ad: AdSpecification,
  layout: ResolvedLayout,
): ResolvedLayout['degradation'] {
  const out: ResolvedLayout['degradation'] = [];

  for (const e of layout.elements) {
    if (!e.visible || e.fontSize === undefined) continue;

    const spec = ad.elements.find((s) => s.id === e.id);
    const preferred = spec?.text?.preferredFontSize;
    if (preferred === undefined) continue;

    if (e.fontSize < preferred - 0.01) {
      out.push({
        operation: 'resize',
        elementId: e.id,
        reason: `Reduced font size from ${preferred}px to ${Math.round(e.fontSize)}px to fit the available space before further degradation.`,
      });
    }
  }

  return out;
}

function resolveCandidate(
  ad: AdSpecification,
  surface: SurfaceProfile,
  composition: Composition,
  hidden: Set<string>,
  trunc: Set<string>,
  repositioned: Set<string>,
) {
  const specs = withTruncationState(ad, trunc);
  const elements = place(specs, surface, composition, hidden, trunc, repositioned);
  const validation = validate(elements, specs, surface);
  return { elements, validation };
}

function buildLayout(
  ad: AdSpecification,
  surface: SurfaceProfile,
  composition: Composition,
  hidden: Set<string>,
  trunc: Set<string>,
  repositioned: Set<string>,
  decisions: ResolvedLayout['degradation'],
): ResolvedLayout {
  const r = resolveCandidate(ad, surface, composition, hidden, trunc, repositioned);
  const layout: ResolvedLayout = {
    surfaceId: surface.id,
    width: surface.width,
    height: surface.height,
    safeArea: {
      left: surface.safeArea.left,
      top: surface.safeArea.top,
      right: surface.width - surface.safeArea.right,
      bottom: surface.height - surface.safeArea.bottom,
    },
    composition,
    elements: r.elements,
    validation: r.validation,
    degradation: [...decisions],
    score: 0,
  };
  layout.score = score(layout);
  return layout;
}

/**
 * Last-resort safety net.
 *
 * Normal degradation (hide/truncate lowest priority first) can run out of
 * options — every remaining element may be non-droppable and
 * non-truncatable — while the best candidate layout is still invalid
 * (overlapping or clipped). Previously the resolver accepted that invalid
 * winner anyway, silently breaking the assignment's core "never
 * overlaps/clips" guarantee.
 *
 * This keeps only the elements at the single highest priority tier (lowest
 * numeric `priority`), forces truncation on any of them that support it,
 * and tries to resolve a valid layout from that minimal set. Returns null
 * if even that cannot produce a valid layout — the caller is expected to
 * throw rather than hand back broken geometry.
 */
function resolveMinimalFallback(
  ad: AdSpecification,
  surface: SurfaceProfile,
): { layout: ResolvedLayout; hiddenIds: string[] } | null {
  const minPriority = Math.min(...ad.elements.map((e) => e.priority));

  const hidden = new Set<string>();
  const trunc = new Set<string>();

  for (const e of ad.elements) {
    if (e.priority !== minPriority) {
      hidden.add(e.id);
    } else if (e.text) {
      trunc.add(e.id);
    }
  }

  const layoutCandidates = candidates()
    .map((composition) => buildLayout(ad, surface, composition, hidden, trunc, new Set(), []))
    .sort((a, b) => b.score - a.score);

  const winner = layoutCandidates[0];

  if (!winner?.validation.valid) {
    return null;
  }

  return { layout: winner, hiddenIds: [...hidden] };
}

export function resolveLayout(
  ad: AdSpecification,
  surface: SurfaceProfile,
  { maxIterations = ad.elements.length * 3 + 3 }: { maxIterations?: number } = {},
): ResolvedLayout {
  const seenIds = new Set<string>();
  for (const el of ad.elements) {
    if (seenIds.has(el.id)) {
      throw new Error(
        `Invalid ad specification: duplicate element id "${el.id}". Element ids must be unique so the resolver, validator, and renderer can key off them unambiguously.`,
      );
    }
    seenIds.add(el.id);
  }

  // Catches contradictory numeric constraints (e.g. minWidth > maxWidth,
  // text.minFontSize > text.maxFontSize) that TypeScript's discriminated
  // union cannot express as a compile-time error. Throws a clear, named
  // error identifying the offending element and fields instead of letting
  // the resolver silently mis-diagnose an authoring bug as ordinary space
  // pressure and "fix" it via unrelated degradation.
  validateSpecConstraints(ad.elements);

  const u = usable(surface.width, surface.height, surface.safeArea);
  if (u.width <= 0 || u.height <= 0) throw new Error('Surface safe area leaves no usable space.');

  const state = {
    hidden: new Set<string>(),
    trunc: new Set<string>(),
    repositioned: new Set<string>(),
    repositionAttempted: new Set<string>(),
  };
  const decisions: ResolvedLayout['degradation'] = [];
  let final: ResolvedLayout | undefined;
  let lastAttempt: ResolvedLayout | undefined;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const layoutCandidates = candidates()
      .map((composition) =>
        buildLayout(
          ad,
          surface,
          composition,
          state.hidden,
          state.trunc,
          state.repositioned,
          decisions,
        ),
      )
      .sort((a, b) => b.score - a.score);

    const winner = layoutCandidates[0];
    if (winner) lastAttempt = winner;
    if (winner?.validation.valid) {
      final = winner;
      break;
    }

    // Before dropping the next eligible element, try repositioning it to a
    // free safe-area corner instead. This is a real placement + validation
    // trial, not a guess: only commit it if it actually produces a valid,
    // non-overlapping layout. If it doesn't, mark it as attempted (so it is
    // never retried) and fall straight through to the existing hide/truncate
    // path below — behavior for elements where no corner is free is
    // unchanged from before this trial existed.
    const repositionTarget = nextReposition(ad.elements, state);
    if (repositionTarget) {
      const trialRepositioned = new Set([...state.repositioned, repositionTarget.elementId]);
      const trialCandidates = candidates()
        .map((composition) =>
          buildLayout(
            ad,
            surface,
            composition,
            state.hidden,
            state.trunc,
            trialRepositioned,
            decisions,
          ),
        )
        .sort((a, b) => b.score - a.score);
      const trialWinner = trialCandidates[0];

      if (trialWinner?.validation.valid) {
        state.repositioned = trialRepositioned;
        decisions.push({
          operation: 'reposition',
          elementId: repositionTarget.elementId,
          reason: repositionTarget.reason,
        });
        final = trialWinner;
        break;
      }

      state.repositionAttempted.add(repositionTarget.elementId);
    }

    const degradation = nextDegradation(ad.elements, state);
    if (!degradation) {
      // Normal degradation is exhausted and the best candidate is still
      // invalid. Do NOT accept it — fall back to a minimal, verified-valid
      // layout instead, or leave `final` unset so the function throws below.
      const fallback = resolveMinimalFallback(ad, surface);

      if (fallback) {
        for (const id of fallback.hiddenIds) {
          decisions.push({
            operation: 'hide',
            elementId: id,
            reason:
              'Fallback: dropped because normal priority-based degradation could not reach a valid layout, to guarantee no overlapping or clipped content.',
          });
        }
        final = fallback.layout;
      }

      break;
    }
    decisions.push(degradation);
  }

  if (!final) {
    // Surfaced elements marked `droppable: false` (e.g. price, cta) are a
    // deliberate spec-level guarantee: the resolver will never hide them to
    // force a fit. If the surface's safe area is smaller than the combined
    // minimum footprint of every non-droppable element, no valid layout can
    // exist without breaking that guarantee — this is a genuine surface/spec
    // mismatch, not a resolver defect. Name the offending elements instead
    // of throwing an opaque message, so this is diagnosable live.
    const blocking = (lastAttempt?.validation.issues ?? [])
      .filter((i) => i.code === 'MISSING_REQUIRED_ELEMENT' || i.code === 'OVERLAP' || i.code === 'TEXT_CLIPPING' || i.code === 'BELOW_MIN_TAP_TARGET' || i.code === 'BELOW_MIN_TEXT_SIZE')
      .map((i) => `${i.elementId} (${i.code})`);

    const detail =
      blocking.length > 0
        ? `Blocking issues: ${[...new Set(blocking)].join(', ')}.`
        : 'No specific issues were captured from the last attempted layout.';

    throw new Error(
      `No valid layout could be generated for surface "${surface.id}" (${surface.width}x${surface.height}). ` +
        `The safe area is too small to fit every element marked non-droppable without hiding, overlapping, or clipping it. ${detail}`,
    );
  }
  final.degradation = [...decisions, ...resizeDecisions(ad, final)];
  final.score = score(final);
  return final;
}
