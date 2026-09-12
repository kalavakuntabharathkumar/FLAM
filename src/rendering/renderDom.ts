import type React from 'react';

import type { ResolvedElement } from '../types/layout';
import {
  AVERAGE_CHARACTER_WIDTH,
  TEXT_ESTIMATE_SAFETY_FACTOR,
} from '../resolver/constraints';
import { measureTextWidth } from '../resolver/textMeasure';

export const elementStyle = (
  e: ResolvedElement,
): React.CSSProperties => ({
  position: 'absolute',

  left: e.x,

  top: e.y,

  width: e.width,

  height: e.height,

  zIndex: e.zIndex,

  boxSizing: 'border-box',

  /*
   * A resolved truncation decision is rendered as a single line.
   *
   * Normal text keeps the browser's normal wrapping behavior.
   * Truncated text has already been bounded by the resolver, so it should
   * not be allowed to wrap a second time inside the same resolved box.
   */
  ...(e.truncated
    ? { whiteSpace: 'nowrap' }
    : {}),
});

/**
 * Returns how many characters of `text` fit inside `maxWidthPx` at
 * `fontSizePx`.
 *
 * When real canvas measurement is available (see textMeasure.ts) this
 * binary-searches the *actual* rendered width, capped at the resolver's
 * existing heuristic capacity — so it can only ever be as tight or tighter
 * than today's behavior, never looser. When measurement isn't available
 * (Node/SSR/older browsers) this returns exactly the same heuristic
 * capacity the app already used before this change.
 */
function truncateCharacterCount(
  text: string,
  maxWidthPx: number,
  fontSizePx: number,
): number {
  const heuristicCharWidth =
    fontSizePx * AVERAGE_CHARACTER_WIDTH * TEXT_ESTIMATE_SAFETY_FACTOR;

  const heuristicCapacity = Math.max(
    1,
    Math.floor(maxWidthPx / heuristicCharWidth) - 1,
  );

  // Availability probe — if canvas measurement isn't supported in this
  // environment, keep the exact original heuristic-only behavior.
  if (measureTextWidth('', fontSizePx) === null) {
    return heuristicCapacity;
  }

  let low = 1;
  let high = Math.min(heuristicCapacity, text.length);
  let best = high;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const width = measureTextWidth(text.slice(0, mid), fontSizePx) ?? Infinity;

    if (width <= maxWidthPx) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

export function displayText(
  e: ResolvedElement,
): string {
  const text = e.text ?? '';

  if (
    !e.truncated ||
    !e.fontSize
  ) {
    return text;
  }

  /*
   * The resolver has explicitly decided that this element must be
   * truncated.
   *
   * Real canvas measurement (when available) sharpens exactly how many
   * characters fit; the resolver's own heuristic (imported from
   * constraints.ts) remains the fallback and the upper bound, so this can
   * only ever match or tighten the previous behavior — never loosen it.
   */
  const capacity = truncateCharacterCount(text, e.width, e.fontSize);

  return (
    text
      .slice(0, capacity)
      .trimEnd() +
    '…'
  );
}