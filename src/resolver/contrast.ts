/**
 * WCAG 2.x relative-luminance contrast ratio utility.
 *
 * This exists purely to support the OPTIONAL `LOW_CONTRAST_BRANDING`
 * validation in validator.ts. Both `SurfaceProfile.backgroundColor` and
 * `BrandingImageElementSpec.foregroundColor` are optional fields — the
 * check only runs when both are set. `broadcastLowerThird` sets
 * `backgroundColor: '#111111'` and the logo element sets
 * `foregroundColor: '#ffffff'`, so this check genuinely fires against real
 * demo content on that surface (~18.9:1, comfortably above the 4.5:1 WCAG
 * AA minimum). The other shipped surfaces don't set these fields, so the
 * check remains a no-op for them — that's opt-in by design, not an oversight.
 */

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!match) return null;
  return [
    parseInt(match[1], 16),
    parseInt(match[2], 16),
    parseInt(match[3], 16),
  ];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/**
 * Returns the WCAG contrast ratio (1 to 21) between two hex colors, or
 * null if either color string can't be parsed as `#rrggbb` / `rrggbb`.
 */
export function contrastRatio(hexA: string, hexB: string): number | null {
  const rgbA = hexToRgb(hexA);
  const rgbB = hexToRgb(hexB);
  if (!rgbA || !rgbB) return null;

  const lumA = relativeLuminance(rgbA);
  const lumB = relativeLuminance(rgbB);

  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);

  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA minimum contrast ratio for normal-size text/branding marks. */
export const WCAG_AA_MIN_CONTRAST = 4.5;
