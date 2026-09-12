/**
 * Optional real text measurement backend.
 *
 * The resolver's own sizing decisions (estimateText / fitTextFontSize in
 * constraints.ts) intentionally continue to use the existing calibrated
 * heuristic (AVERAGE_CHARACTER_WIDTH / TEXT_ESTIMATE_SAFETY_FACTOR) so that
 * every already-passing resolver unit test and every already-tuned
 * degradation/placement decision stays byte-for-byte identical. That
 * heuristic bakes in a deliberate 12% safety margin specifically so the
 * resolver never under-allocates space relative to what the browser
 * actually renders.
 *
 * This module is a separate, additive concern: where real measurement is
 * available (a real browser with Canvas 2D), it is used in
 * rendering/renderDom.ts to sharpen the *display-only* truncation ellipsis
 * math so the truncated string fits its resolved box as precisely as
 * possible. In any environment without a usable canvas (Node/vitest, SSR,
 * older browsers) `measureTextWidth` returns null and callers fall back to
 * the exact same heuristic used today — so nothing about existing resolver
 * behavior, existing tests, or existing geometry changes.
 */

let cachedContext: CanvasRenderingContext2D | null | undefined;

function getMeasurementContext(): CanvasRenderingContext2D | null {
  if (cachedContext !== undefined) return cachedContext;

  if (typeof document === 'undefined') {
    cachedContext = null;
    return cachedContext;
  }

  try {
    const canvas = document.createElement('canvas');
    cachedContext = canvas.getContext('2d');
  } catch {
    cachedContext = null;
  }

  return cachedContext;
}

/**
 * Measures the real rendered pixel width of `text` at `fontSizePx`, using
 * the same font-weight/family the ad frame renders with. Returns null when
 * real measurement isn't available — callers must fall back to the
 * existing heuristic in that case.
 */
export function measureTextWidth(
  text: string,
  fontSizePx: number,
  fontWeight = 800,
  fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif',
): number | null {
  const ctx = getMeasurementContext();
  if (!ctx) return null;

  ctx.font = `${fontWeight} ${fontSizePx}px ${fontFamily}`;
  return ctx.measureText(text).width;
}