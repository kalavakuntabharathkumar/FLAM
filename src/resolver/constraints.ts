import type { AdElementSpec } from '../types/ad';
import type { SurfaceProfile } from '../types/surface';

export interface MeasuredText {
  width: number;
  height: number;
  fontSize: number;
  lines: number;
  truncated: boolean;
}

/*
 * Single source of truth for the text-measurement model.
 *
 * These were previously duplicated as separate hardcoded literals in
 * placement.ts (naturalTextWidth) and renderDom.ts (displayText's
 * truncation-ellipsis sizing). Duplicating them meant the renderer's
 * truncation math could silently drift from the resolver's own fit math if
 * only one copy was ever tuned — reintroducing the exact overflow/clipping
 * risk the resolver exists to prevent. Exported here and imported
 * everywhere else instead.
 */
export const AVERAGE_CHARACTER_WIDTH = 0.58;
export const LINE_HEIGHT = 1.2;

/*
 * Small deterministic safety allowance for the difference between the
 * resolver's character-width estimate and the browser's actual font metrics.
 *
 * This does NOT hide overflow with CSS.
 * It makes the resolver allocate enough real height for the text that the
 * browser will actually render.
 */
export const TEXT_ESTIMATE_SAFETY_FACTOR = 1.12;

/*
 * Characters that are considered safe break opportunities for the
 * resolver's deterministic wrapping model.
 *
 * The renderer also enables breaking inside long tokens, so the resolver
 * must account for those breaks rather than assuming an unbroken token will
 * always occupy exactly one browser line.
 */
const WHITESPACE_PATTERN = /\s/;

/**
 * Returns the width required by the longest unbreakable token.
 *
 * For normal prose this is usually a single word.
 * For content such as:
 *
 *   ₹40,000000000000000000
 *
 * there is no whitespace, so the complete string is the longest token.
 */
function getLongestUnbreakableToken(
  content: string,
  characterWidth: number,
): number {
  const tokens = WHITESPACE_PATTERN.test(content)
    ? content.split(/\s+/).filter(Boolean)
    : [content];

  const longestLength = Math.max(
    1,
    ...tokens.map((token) => token.length),
  );

  return longestLength * characterWidth;
}

/**
 * Estimates how text will occupy a box.
 *
 * The DOM renderer permits wrapping inside long tokens. Therefore line
 * capacity is modeled using the same deterministic character-width estimate
 * for both ordinary text and unbroken text.
 *
 * maxLines controls whether the resolver considers truncation necessary.
 */
export function estimateText(
  spec: AdElementSpec,
  width: number,
  surface: SurfaceProfile,
  fontSize?: number,
  maxLinesOverride?: number,
): MeasuredText {
  const minFont = Math.max(
    spec.text?.minFontSize ?? surface.minTextSize,
    surface.minTextSize,
  );

  const preferred = spec.text?.preferredFontSize ?? minFont;
  const fs = Math.max(minFont, fontSize ?? preferred);
  const safeWidth = Math.max(1, width);

  /*
   * Use a conservative effective character width so that the resolver does
   * not underestimate wrapping compared with the browser.
   */
  const effectiveCharacterWidth =
    fs * AVERAGE_CHARACTER_WIDTH * TEXT_ESTIMATE_SAFETY_FACTOR;

  const charsPerLine = Math.max(
    1,
    Math.floor(safeWidth / effectiveCharacterWidth),
  );

  /*
   * The DOM renderer deliberately uses overflowWrap/wordBreak so that even
   * an unbroken token can wrap when the allocated box is too narrow.
   *
   * Therefore the resolver must use the same basic model: line capacity is
   * character-based for both ordinary text and long tokens.
   */
  const rawLines = Math.max(
    1,
    Math.ceil(spec.content.length / charsPerLine),
  );

  const maxLines = Math.max(
    1,
    maxLinesOverride ?? spec.text?.maxLines ?? 999,
  );

  const lines = Math.min(rawLines, maxLines);

  /*
   * Width required by the longest token.
   *
   * For normal text this is the longest word.
   * For an unbroken price/number this is the complete string.
   */
  const requiredTokenWidth = getLongestUnbreakableToken(
    spec.content,
    effectiveCharacterWidth,
  );

  const widthFits =
    requiredTokenWidth <= safeWidth + 0.01;

  const truncated =
    spec.text?.allowTruncation === true &&
    spec.flexibility?.truncate === true &&
    (
      rawLines > maxLines ||
      !widthFits
    );

  return {
    /*
     * Keep the natural required width here.
     *
     * Returning the capped box width would make every measurement appear
     * to fit and would defeat the width check in fitTextFontSize().
     */
    width: requiredTokenWidth,

    /*
     * Browser text layout works in CSS pixels and the resulting DOM
     * scrollHeight/clientHeight values are integer-rounded.
     *
     * The mathematical line-box height can therefore be something such as
     * 64.8px while the browser reports 65px. Rounding up and adding one
     * pixel keeps the actual rendered line box inside the resolved box
     * without using clipping or overflow:hidden.
     */
    height:
      Math.ceil(
        lines * fs * LINE_HEIGHT,
      ) + 1,

    fontSize: fs,
    lines,
    truncated,
  };
}

/**
 * Largest readable font size that fits both width and allocated height.
 *
 * When forceTruncation is false, the candidate must genuinely fit.
 * When forceTruncation is true, width/content pressure may be resolved by
 * the renderer's explicit truncation behavior.
 */
export function fitTextFontSize(
  spec: AdElementSpec,
  width: number,
  height: number,
  surface: SurfaceProfile,
  preferred?: number,
  maxLinesOverride?: number,
  forceTruncation = false,
): MeasuredText | null {
  const minFont = Math.max(
    spec.text?.minFontSize ?? surface.minTextSize,
    surface.minTextSize,
  );

  const preferredFont = Math.max(
    minFont,
    preferred ?? spec.text?.preferredFontSize ?? minFont,
  );

  /*
   * Ceiling the binary search may grow into. Defaults to preferredFont when
   * `maxFontSize` is unset, so specs that don't opt in see zero behavior
   * change — the search range is exactly what it was before.
   */
  const maxFont = Math.max(
    preferredFont,
    spec.text?.maxFontSize ?? preferredFont,
  );

  const safeWidth = Math.max(1, width);

  const maxLines =
    maxLinesOverride ??
    spec.text?.maxLines ??
    999;

  let low = minFont;
  let high = maxFont;
  let best: MeasuredText | null = null;

  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;

    const measured = estimateText(
      spec,
      width,
      surface,
      mid,
      maxLines,
    );

    /*
     * Before truncation is requested, both dimensions must fit.
     *
     * This prevents the resolver from accepting a font size that fits
     * vertically but causes the browser to wrap a long token vertically.
     *
     * Once degradation explicitly requests truncation, width/content
     * pressure may be handled by the renderer's bounded text output.
     */
    const fitsHeight =
      measured.height <= height + 0.01;

    const fitsWidth =
      measured.width <= safeWidth + 0.01;

    const fitsContent =
      !measured.truncated ||
      forceTruncation;

    const usable =
      fitsHeight &&
      (
        (fitsWidth && fitsContent) ||
        forceTruncation
      );

    if (usable) {
      best = measured;
      low = mid;
    } else {
      high = mid;
    }
  }

  if (!best) {
    const minimum = estimateText(
      spec,
      width,
      surface,
      minFont,
      maxLines,
    );

    if (
      minimum.height <= height + 0.01 &&
      (
        forceTruncation ||
        minimum.width <= safeWidth + 0.01
      )
    ) {
      best = minimum;
    }
  }

  return best;
}

/**
 * Rejects ad specs whose declared numeric constraints are internally
 * contradictory (e.g. `minWidth > maxWidth`), instead of letting them pass
 * through silently.
 *
 * Before this existed, a contradictory spec was NOT caught anywhere:
 * `usefulWidth`/`usefulHeight` let a larger `min*` silently win over a
 * smaller `max*`, and `fitTextFontSize`'s binary search just ran with
 * `low > high` and returned whatever fell out. The resolver would then
 * often report an `EXCESSIVE_ALLOCATION` validation issue for the affected
 * element and "fix" it via ordinary degradation (hiding/truncating
 * unrelated content) — silently mis-diagnosing an authoring bug in the
 * spec as ordinary space pressure on the surface.
 *
 * This throws a specific, named error identifying exactly which element
 * and which pair of fields are contradictory, so a bad spec fails loudly
 * and immediately instead of producing confusing degradation elsewhere.
 */
export function validateSpecConstraints(elements: AdElementSpec[]): void {
  for (const e of elements) {
    const bad: string[] = [];

    if (e.minWidth > e.preferredWidth) {
      bad.push(`minWidth (${e.minWidth}) > preferredWidth (${e.preferredWidth})`);
    }
    if (e.minHeight > e.preferredHeight) {
      bad.push(`minHeight (${e.minHeight}) > preferredHeight (${e.preferredHeight})`);
    }
    if (e.maxWidth !== undefined && e.minWidth > e.maxWidth) {
      bad.push(`minWidth (${e.minWidth}) > maxWidth (${e.maxWidth})`);
    }
    if (e.maxHeight !== undefined && e.minHeight > e.maxHeight) {
      bad.push(`minHeight (${e.minHeight}) > maxHeight (${e.maxHeight})`);
    }
    if (e.maxWidth !== undefined && e.preferredWidth > e.maxWidth) {
      bad.push(`preferredWidth (${e.preferredWidth}) > maxWidth (${e.maxWidth})`);
    }
    if (e.maxHeight !== undefined && e.preferredHeight > e.maxHeight) {
      bad.push(`preferredHeight (${e.preferredHeight}) > maxHeight (${e.maxHeight})`);
    }
    if ([e.minWidth, e.minHeight, e.preferredWidth, e.preferredHeight].some(n => n <= 0)) {
      bad.push('minWidth/minHeight/preferredWidth/preferredHeight must all be > 0');
    }

    if (e.text) {
      const { minFontSize, preferredFontSize, maxFontSize } = e.text;

      if (minFontSize > preferredFontSize) {
        bad.push(`text.minFontSize (${minFontSize}) > text.preferredFontSize (${preferredFontSize})`);
      }
      if (maxFontSize !== undefined && preferredFontSize > maxFontSize) {
        bad.push(`text.preferredFontSize (${preferredFontSize}) > text.maxFontSize (${maxFontSize})`);
      }
      if (maxFontSize !== undefined && minFontSize > maxFontSize) {
        bad.push(`text.minFontSize (${minFontSize}) > text.maxFontSize (${maxFontSize})`);
      }
      if (minFontSize <= 0) {
        bad.push('text.minFontSize must be > 0');
      }
    }

    if (e.type === 'image' && e.image) {
      const { minWidth, minHeight, preferredWidth, preferredHeight, aspectRatio } = e.image;

      if (aspectRatio <= 0) {
        bad.push(`image.aspectRatio (${aspectRatio}) must be > 0`);
      }
      if (minWidth > preferredWidth) {
        bad.push(`image.minWidth (${minWidth}) > image.preferredWidth (${preferredWidth})`);
      }
      if (minHeight > preferredHeight) {
        bad.push(`image.minHeight (${minHeight}) > image.preferredHeight (${preferredHeight})`);
      }
    }

    if (bad.length > 0) {
      throw new Error(
        `Invalid ad specification: element "${e.id}" has contradictory constraints — ${bad.join('; ')}.`,
      );
    }
  }
}

export function usefulWidth(
  spec: AdElementSpec,
  available: number,
): number {
  return Math.max(
    spec.minWidth,
    Math.min(
      available,
      spec.maxWidth ??
        spec.preferredWidth,
    ),
  );
}

export function usefulHeight(
  spec: AdElementSpec,
  available: number,
): number {
  return Math.max(
    spec.minHeight,
    Math.min(
      available,
      spec.maxHeight ??
        spec.preferredHeight,
    ),
  );
}