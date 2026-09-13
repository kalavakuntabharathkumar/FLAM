import type { AdElementSpec } from '../types/ad';
import type { SurfaceProfile } from '../types/surface';
import type { Composition, ResolvedElement } from '../types/layout';
import { overlaps } from './geometry';
import {
  AVERAGE_CHARACTER_WIDTH,
  TEXT_ESTIMATE_SAFETY_FACTOR,
  estimateText,
  fitTextFontSize,
  usefulHeight,
  usefulWidth,
} from './constraints';

interface Rect { x: number; y: number; width: number; height: number;}

const VIEWING_DISTANCE_GAP_MULTIPLIER: Record<SurfaceProfile['viewingDistance'], number> = {
  near: 1,
  far: 1.75,
};

const gapFor = (surface: SurfaceProfile) => {
  const multiplier = VIEWING_DISTANCE_GAP_MULTIPLIER[surface.viewingDistance];
  return Math.max(
    8 * multiplier,
    Math.min(20 * multiplier, Math.min(surface.width, surface.height) * 0.025 * multiplier),
  );
};

const safeRect = (surface: SurfaceProfile): Rect => ({
  x: surface.safeArea.left,
  y: surface.safeArea.top,
  width: Math.max(0, surface.width - surface.safeArea.left - surface.safeArea.right),
  height: Math.max(0, surface.height - surface.safeArea.top - surface.safeArea.bottom),
});

const ordered = (elements: AdElementSpec[]) =>
  [...elements].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));

function naturalTextWidth(spec: AdElementSpec, surface: SurfaceProfile): number {
  if (spec.type !== 'text' && !(spec.type === 'image' && spec.role === 'branding')) {
    return 0;
  }
  const fontSize = Math.max(spec.text?.minFontSize ?? surface.minTextSize, surface.minTextSize);
  const longestToken = Math.max(
    1,
    ...spec.content.split(/\s+/).filter(Boolean).map(token => token.length),
  );
  return longestToken * fontSize * AVERAGE_CHARACTER_WIDTH * TEXT_ESTIMATE_SAFETY_FACTOR;
}

function allocationWidth(spec: AdElementSpec, available: number, surface: SurfaceProfile): number {
  return Math.min(available, Math.max(usefulWidth(spec, available), naturalTextWidth(spec, surface)));
}

function buildElement(
  spec: AdElementSpec,
  rect: Rect,
  surface: SurfaceProfile,
  forceTruncate = false,
): ResolvedElement {
  let { width, height } = rect;
  let fontSize: number | undefined;
  let truncated = false;

  if (spec.type === 'image' && spec.role !== 'branding' && spec.image) {
    const ratio = Math.max(0.01, spec.image.aspectRatio);
    const maxWidth = Math.min(width, height * ratio);
    width = maxWidth;
    height = width / ratio;
  } else if (spec.type === 'text' || (spec.type === 'image' && spec.role === 'branding')) {
    const fitted = fitTextFontSize(spec, width, height, surface, undefined, undefined, forceTruncate);
    if (fitted) {
      fontSize = fitted.fontSize;
      height = fitted.height;
      truncated = forceTruncate && fitted.truncated && Boolean(spec.text?.allowTruncation);
    }
  } else if (spec.type === 'button') {
    const target = surface.touchOnly ? surface.minTapTarget : 0;
    height = Math.max(spec.minHeight, target, Math.min(rect.height, spec.maxHeight ?? spec.preferredHeight));
  }

  return {
    id: spec.id,
    type: spec.type,
    role: spec.role,
    x: rect.x,
    y: rect.y,
    width,
    height,
    visible: true,
    zIndex: 10 - spec.priority,
    fontSize,
    lineHeight: fontSize ? 1.2 : undefined,
    text:
      spec.type === 'text' || (spec.type === 'image' && spec.role === 'branding')
        ? spec.content
        : undefined,
    truncated,
    objectFit: spec.type === 'image' && spec.role !== 'branding' ? 'contain' : undefined,
    priority: spec.priority,
  };
}

function preferredBlockHeight(spec: AdElementSpec, width: number, surface: SurfaceProfile): number {
  if (spec.type === 'image' && spec.role !== 'branding' && spec.image) {
    return Math.min(usefulHeight(spec, Number.POSITIVE_INFINITY), width / spec.image.aspectRatio);
  }
  if (spec.type === 'text' || (spec.type === 'image' && spec.role === 'branding')) {
    const measured = estimateText(spec, width, surface, spec.text?.maxFontSize);
    return Math.max(spec.minHeight, measured.height);
  }
  return usefulHeight(spec, Number.POSITIVE_INFINITY);
}

function minimumBlockHeight(spec: AdElementSpec, width: number, surface: SurfaceProfile): number {
  if (spec.type === 'image' && spec.role !== 'branding' && spec.image) {
    return Math.max(spec.minHeight, spec.minWidth / spec.image.aspectRatio);
  }
  if (spec.type === 'text' || (spec.type === 'image' && spec.role === 'branding')) {
    const minimum = Math.max(spec.text?.minFontSize ?? surface.minTextSize, surface.minTextSize);
    return Math.max(spec.minHeight, estimateText(spec, width, surface, minimum).height);
  }
  return Math.max(spec.minHeight, surface.touchOnly && spec.type === 'button' ? surface.minTapTarget : 0);
}

function isTextLike(spec: AdElementSpec): boolean {
  return spec.type === 'text' || (spec.type === 'image' && spec.role === 'branding');
}

/**
 * Shrinks element heights to fit the available space.
 *
 * Text and branding-image elements give up spare room first.
 * Remaining elements are reduced by highest spare capacity,
 * then lower priority before higher priority.
 *
 * Shared by both vertical stacks and mixed-composition columns
 * to avoid duplicating the same redistribution logic.
 */
function redistributeExcessHeight(
  items: AdElementSpec[],
  startingHeights: number[],
  minimums: number[],
  startingExcess: number,
): number[] {
  const heights = [...startingHeights];
  let excess = startingExcess;

  while (excess > 0.01) {
    const order = items
      .map((_, i) => i)
      .sort((a, b) => {
        const aText = isTextLike(items[a]) ? 1 : 0;
        const bText = isTextLike(items[b]) ? 1 : 0;
        return (
          bText - aText ||
          (heights[b] - minimums[b]) - (heights[a] - minimums[a]) ||
          items[a].priority - items[b].priority
        );
      });

    let changed = false;

    for (const i of order) {
      const capacity = heights[i] - minimums[i];
      if (capacity <= 0.01) continue;

      const cut = isTextLike(items[i]) ? capacity : Math.min(excess, capacity);
      heights[i] -= cut;
      excess -= cut;
      changed = true;

      if (excess <= 0.01) break;
    }

    if (!changed) break;
  }

  return heights;
}

/**
 * Reduces widths toward their minimums to absorb `startingExcess`, always
 * cutting from whichever item currently has the most spare capacity.
 *
 * This is `placeHorizontal`'s own redistribution policy (simple greedy
 * single-largest-capacity), extracted verbatim into a named function.
 *
 * It is intentionally NOT unified with `redistributeExcessHeight` above:
 * that one gives text/branding elements their entire spare capacity
 * immediately and resolves ties by spec priority, which is the right
 * policy for stacked boxes but is a different (and untested-for-parity)
 * policy than row-width shrinking has always used. Merging them would
 * risk changing `placeHorizontal`'s numeric output, which this refactor
 * must not do.
 */
function redistributeExcessWidth(
  startingWidths: number[],
  minimums: number[],
  startingExcess: number,
): number[] {
  const widths = [...startingWidths];
  let excess = startingExcess;

  while (excess > 0.01) {
    let best = -1;
    let capacity = 0;

    for (let i = 0; i < widths.length; i++) {
      const c = widths[i] - minimums[i];
      if (c > capacity + 0.01) {
        capacity = c;
        best = i;
      }
    }

    if (best < 0) break;

    const cut = Math.min(excess, capacity);
    widths[best] -= cut;
    excess -= cut;
  }

  return widths;
}

/**
 * Stacks `items` top-to-bottom within a shared cross-axis box, computing
 * minimum/preferred heights, redistributing excess, and building each
 * element — the sequence `placeVertical` and `placeMixed` each used to
 * reimplement independently.
 *
 * - `widths[i]` is the cross-axis (horizontal) box each item gets *before*
 *   any per-item adjustment.
 * - `xFor` positions each item horizontally given its (possibly adjusted)
 *   width; callers close over their own left-edge/centering logic.
 * - `adjustSize`, if given, lets a caller reshape an item's box right
 *   before it's built (e.g. `placeMixed` shrinks non-branding images to
 *   their aspect-correct size before centering them in their column).
 *   `placeVertical` doesn't need this and omits it, matching its original
 *   behavior exactly.
 *
 * Returns `null` when even minimum sizes don't fit the available height —
 * callers treat that as "this composition doesn't fit here."
 */
function layoutAxis(
  items: AdElementSpec[],
  widths: number[],
  availableHeight: number,
  gap: number,
  originY: number,
  surface: SurfaceProfile,
  trunc: Set<string>,
  xFor: (width: number, index: number) => number,
  adjustSize?: (spec: AdElementSpec, width: number, height: number) => { width: number; height: number },
): ResolvedElement[] | null {
  const preferred = items.map((e, i) => preferredBlockHeight(e, widths[i], surface));
  const minimum = items.map((e, i) => minimumBlockHeight(e, widths[i], surface));

  const minTotal = minimum.reduce((a, b) => a + b, 0);
  if (minTotal > availableHeight + 0.01) {
    return null;
  }

  let heights = preferred.map((h, i) => Math.max(minimum[i], Math.min(h, availableHeight)));
  let excess = heights.reduce((a, b) => a + b, 0) - availableHeight;

  if (excess > 0.01) {
    heights = redistributeExcessHeight(items, heights, minimum, excess);
    excess = heights.reduce((a, b) => a + b, 0) - availableHeight;
  }

  if (excess > 0.01) {
    return null;
  }

  const out: ResolvedElement[] = [];
  let y = originY;

  items.forEach((spec, i) => {
    let width = widths[i];
    let height = heights[i];

    if (adjustSize) {
      const adjusted = adjustSize(spec, width, height);
      width = adjusted.width;
      height = adjusted.height;
    }

    const x = xFor(width, i);

    const element = buildElement(spec, { x, y, width, height }, surface, trunc.has(spec.id));
    out.push(element);

    /*
     * Advance by the element's actual resolved height, not its allocated
     * box height, to avoid unnecessary gaps. Text elements may resolve
     * to a smaller height, and using the allocated height can cause
     * spacing validation failures between elements.
     */
    y += element.height + (i < items.length - 1 ? gap : 0);
  });

  return out;
}

function placeVertical(active: AdElementSpec[], surface: SurfaceProfile, trunc: Set<string>): ResolvedElement[] {
  const safe = safeRect(surface);
  const gap = gapFor(surface);

  const widths = active.map(e => allocationWidth(e, safe.width, surface));
  const gaps = Math.max(0, active.length - 1) * gap;
  const available = Math.max(0, safe.height - gaps);

  const result = layoutAxis(
    active,
    widths,
    available,
    gap,
    safe.y,
    surface,
    trunc,
    width => safe.x + (safe.width - width) / 2,
  );

  return result ?? [];
}

function placeHorizontal(active: AdElementSpec[], surface: SurfaceProfile, trunc: Set<string>): ResolvedElement[] {
  const safe = safeRect(surface);
  const force = (e: AdElementSpec) => trunc.has(e.id);
  const gap = gapFor(surface);

  const available = Math.max(0, safe.width - Math.max(0, active.length - 1) * gap);

  const mins = active.map(e =>
    Math.max(e.minWidth, surface.touchOnly && e.type === 'button' ? surface.minTapTarget : 0),
  );

  if (mins.reduce((a, b) => a + b, 0) > available + 0.01) {
    return [];
  }

  let widths = active.map((e, i) => Math.max(mins[i], allocationWidth(e, available, surface)));
  let excess = widths.reduce((a, b) => a + b, 0) - available;

  if (excess > 0.01) {
    widths = redistributeExcessWidth(widths, mins, excess);
    excess = widths.reduce((a, b) => a + b, 0) - available;
  }

  if (excess > 0.01) {
    return [];
  }

  const out: ResolvedElement[] = [];
  let x = safe.x;

  for (let i = 0; i < active.length; i++) {
    const spec = active[i];
    const width = widths[i];
    let height = safe.height;

    if (spec.type === 'image' && spec.role !== 'branding' && spec.image) {
      height = Math.min(height, width / spec.image.aspectRatio);
    }

    if (spec.type === 'text' || (spec.type === 'image' && spec.role === 'branding')) {
      height = Math.min(height, preferredBlockHeight(spec, width, surface));
    }

    if (spec.type === 'button') {
      height = Math.min(
        safe.height,
        Math.max(spec.maxHeight ?? spec.preferredHeight, surface.touchOnly ? surface.minTapTarget : spec.minHeight),
      );
    }

    height = Math.max(spec.minHeight, height);

    if (spec.type === 'image' && spec.role !== 'branding' && spec.image) {
      height = Math.min(height, width / spec.image.aspectRatio);
    }

    const y = safe.y + (safe.height - height) / 2;

    out.push(buildElement(spec, { x, y, width, height }, surface, force(spec)));

    x += width + (i < active.length - 1 ? gap : 0);
  }

  return out;
}

function placeMixed(active: AdElementSpec[], surface: SurfaceProfile, trunc: Set<string>): ResolvedElement[] {
  const safe = safeRect(surface);
  const gap = gapFor(surface);

  if (active.length < 2) {
    return placeVertical(active, surface, trunc);
  }

  const left = active.filter(e => e.type === 'image' && e.role !== 'branding');
  const rest = active.filter(e => !(e.type === 'image' && e.role !== 'branding'));

  if (left.length === 0 || rest.length === 0) {
    return placeVertical(active, surface, trunc);
  }

  const minLeft = Math.max(...left.map(e => e.minWidth));
  const minRight = Math.max(...rest.map(e => e.minWidth));
  const usable = safe.width - gap;

  const leftPreferred = Math.max(
    minLeft,
    Math.min(usable - minRight, left.reduce((s, e) => s + (e.maxWidth ?? e.preferredWidth), 0)),
  );

  const rightWidth = usable - leftPreferred;

  if (leftPreferred < minLeft || rightWidth < minRight) {
    return [];
  }

  const columns = [[...left], [...rest]];
  const widths = [leftPreferred, rightWidth];
  const out: ResolvedElement[] = [];

  columns.forEach((group, col) => {
    const columnX = col === 0 ? safe.x : safe.x + leftPreferred + gap;
    const columnWidth = widths[col];
    const innerGap = gap;
    const availableHeight = safe.height - Math.max(0, group.length - 1) * innerGap;

    const itemWidths = group.map(e => allocationWidth(e, columnWidth, surface));

    const result = layoutAxis(
      group,
      itemWidths,
      availableHeight,
      innerGap,
      safe.y,
      surface,
      trunc,
      width => columnX + (columnWidth - width) / 2,
      (spec, width, height) => {
        if (spec.type === 'image' && spec.role !== 'branding' && spec.image) {
          const h = Math.min(height, width / spec.image.aspectRatio);
          return { width: h * spec.image.aspectRatio, height: h };
        }
        return { width, height };
      },
    );

    if (result) {
      out.push(...result);
    }
  });

  return out.length === active.length ? out : [];
}

function verticallyBalanceComposition(elements: ResolvedElement[], surface: SurfaceProfile): ResolvedElement[] {
  if (elements.length === 0) {
    return elements;
  }

  const safe = safeRect(surface);
  const top = Math.min(...elements.map(e => e.y));
  const bottom = Math.max(...elements.map(e => e.y + e.height));
  const compositionHeight = bottom - top;
  const freeHeight = safe.height - compositionHeight;

  if (freeHeight <= 0.01) {
    return elements;
  }

  const offset = safe.y + freeHeight / 2 - top;

  if (Math.abs(offset) <= 0.01) {
    return elements;
  }

  return elements.map(e => ({ ...e, y: e.y + offset }));
}

/**
 * Builds a placeholder for an element dropped during degradation.
 *
 * Dropped elements remain in the resolved output with `visible: false`,
 * allowing renderers, debug views, and validators to detect and handle them.
 */
function droppedPlaceholder(spec: AdElementSpec): ResolvedElement {
  return {
    id: spec.id,
    type: spec.type,
    role: spec.role,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    visible: false,
    zIndex: 0,
    priority: spec.priority,
  };
}

/**
 * Safe-area corners tried for repositioning, in preference order.
 * Bottom-right is preferred to reduce collisions with top-anchored
 * headlines and centered hero images.
 */
const OVERLAY_CORNERS = ['bottom-right', 'top-right', 'bottom-left', 'top-left'] as const;

function overlayRect(corner: (typeof OVERLAY_CORNERS)[number], width: number, height: number, safe: Rect): Rect {
  const x = corner.endsWith('right') ? safe.x + safe.width - width : safe.x;
  const y = corner.startsWith('top') ? safe.y : safe.y + safe.height - height;
  return { x, y, width, height };
}

/**
 * Places droppable, repositionable elements as corner overlays
 * outside the main content flow instead of dropping them.
 *
 * The element keeps its minimum footprint and uses a safe-area
 * corner without overlapping existing flow content.
 *
 * If no corner is free, the last attempt is returned visible;
 * normal overlap validation determines whether repositioning succeeded.
 */
function placeOverlays(
  elements: AdElementSpec[],
  surface: SurfaceProfile,
  existing: ResolvedElement[],
): ResolvedElement[] {
  const safe = safeRect(surface);
  const out: ResolvedElement[] = [];
  const placedSoFar = [...existing];

  for (const spec of elements) {
    const width = Math.min(safe.width, spec.minWidth);
    const height = Math.min(safe.height, spec.minHeight);
    let chosen: ResolvedElement | null = null;

    for (const corner of OVERLAY_CORNERS) {
      const rect = overlayRect(corner, width, height, safe);
      const candidate = buildElement(spec, rect, surface, false);
      candidate.repositioned = true;

      const clash = placedSoFar.some(e => e.visible && overlaps(candidate, e));
      chosen = candidate;
      if (!clash) break;
    }

    if (chosen) {
      out.push(chosen);
      placedSoFar.push(chosen);
    }
  }

  return out;
}

export function place(
  elements: AdElementSpec[],
  surface: SurfaceProfile,
  composition: Composition,
  hidden: Set<string>,
  trunc: Set<string> = new Set(),
  repositioned: Set<string> = new Set(),
): ResolvedElement[] {
  const active = ordered(elements.filter(e => !hidden.has(e.id) && !repositioned.has(e.id)));

  let placed: ResolvedElement[];

  if (composition === 'horizontal') {
    placed = placeHorizontal(active, surface, trunc);
  } else if (composition === 'mixed') {
    placed = placeMixed(active, surface, trunc);
  } else {
    placed = placeVertical(active, surface, trunc);
  }

  const balanced = verticallyBalanceComposition(placed, surface);

  const overlayElements = placeOverlays(
    elements.filter(e => repositioned.has(e.id)),
    surface,
    balanced,
  );

  const dropped = elements.filter(e => hidden.has(e.id)).map(droppedPlaceholder);

  return [...balanced, ...overlayElements, ...dropped];
}
