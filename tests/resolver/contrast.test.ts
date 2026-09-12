import { describe, it, expect } from 'vitest';

import { contrastRatio, WCAG_AA_MIN_CONTRAST } from '../../src/resolver/contrast';
import { validate } from '../../src/resolver/validator';
import { place } from '../../src/resolver/placement';
import type { AdElementSpec, BrandingImageElementSpec } from '../../src/types/ad';
import type { SurfaceProfile } from '../../src/types/surface';

describe('contrastRatio', () => {
  it('returns the maximum ratio (21:1) for pure black vs pure white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('returns 1:1 for identical colors', () => {
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5);
  });

  it('is symmetric regardless of argument order', () => {
    const a = contrastRatio('#111111', '#eeeeee')!;
    const b = contrastRatio('#eeeeee', '#111111')!;
    expect(a).toBeCloseTo(b, 5);
  });

  it('returns null for an unparseable hex color', () => {
    expect(contrastRatio('not-a-color', '#ffffff')).toBeNull();
    expect(contrastRatio('#ffffff', '')).toBeNull();
  });

  it('accepts hex strings with or without a leading #', () => {
    const withHash = contrastRatio('#ff0000', '#000000')!;
    const withoutHash = contrastRatio('ff0000', '000000')!;
    expect(withoutHash).toBeCloseTo(withHash, 5);
  });
});

const surfaceWithBackground = (backgroundColor: string): SurfaceProfile => ({
  id: 'contrast-test-surface',
  name: 'Contrast Test Surface',
  width: 400,
  height: 400,
  safeArea: { top: 16, right: 16, bottom: 16, left: 16 },
  minTapTarget: 44,
  minTextSize: 16,
  viewingDistance: 'near',
  touchOnly: false,
  backgroundColor,
});

const brandingSpec = (foregroundColor: string): BrandingImageElementSpec => ({
  id: 'logo',
  type: 'image',
  role: 'branding',
  content: 'BRAND',
  priority: 3,
  minWidth: 60,
  minHeight: 24,
  preferredWidth: 100,
  preferredHeight: 30,
  foregroundColor,
  flexibility: {
    resize: true,
    reposition: false,
    truncate: false,
    droppable: false,
  },
});

describe('LOW_CONTRAST_BRANDING validation', () => {
  it('flags branding whose foreground color fails WCAG AA against the surface background', () => {
    // Near-identical light grays: contrast ratio is well under 4.5:1.
    const surface = surfaceWithBackground('#f0f0f0');
    const spec: AdElementSpec = brandingSpec('#f5f5f5');

    const elements = place([spec], surface, 'vertical', new Set());
    const result = validate(elements, [spec], surface);

    const ratio = contrastRatio('#f5f5f5', '#f0f0f0')!;
    expect(ratio).toBeLessThan(WCAG_AA_MIN_CONTRAST);
    expect(result.issues.some(i => i.code === 'LOW_CONTRAST_BRANDING')).toBe(true);
  });

  it('does not flag branding whose foreground color meets WCAG AA against the surface background', () => {
    // Black on white comfortably clears 4.5:1.
    const surface = surfaceWithBackground('#ffffff');
    const spec: AdElementSpec = brandingSpec('#000000');

    const elements = place([spec], surface, 'vertical', new Set());
    const result = validate(elements, [spec], surface);

    expect(result.issues.some(i => i.code === 'LOW_CONTRAST_BRANDING')).toBe(false);
  });

  it('is a no-op when the surface has no backgroundColor set (unaffected specs stay unaffected)', () => {
    const surface: SurfaceProfile = {
      id: 'no-bg-surface',
      name: 'No Background Surface',
      width: 400,
      height: 400,
      safeArea: { top: 16, right: 16, bottom: 16, left: 16 },
      minTapTarget: 44,
      minTextSize: 16,
      viewingDistance: 'near',
      touchOnly: false,
      // backgroundColor intentionally omitted
    };
    const spec: AdElementSpec = brandingSpec('#f5f5f5');

    const elements = place([spec], surface, 'vertical', new Set());
    const result = validate(elements, [spec], surface);

    expect(result.issues.some(i => i.code === 'LOW_CONTRAST_BRANDING')).toBe(false);
  });

  it('is a no-op when the branding element has no foregroundColor set', () => {
    const surface = surfaceWithBackground('#f0f0f0');
    const spec: AdElementSpec = {
      ...brandingSpec('#f5f5f5'),
      foregroundColor: undefined,
    };

    const elements = place([spec], surface, 'vertical', new Set());
    const result = validate(elements, [spec], surface);

    expect(result.issues.some(i => i.code === 'LOW_CONTRAST_BRANDING')).toBe(false);
  });
});