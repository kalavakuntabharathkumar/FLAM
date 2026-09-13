import { describe, it, expect } from 'vitest';
import { resolveLayout } from '../../src/resolver/resolver';
import { validateSpecConstraints } from '../../src/resolver/constraints';
import { adSpec } from '../../src/spec/adSpec';
import { surfaces } from '../../src/surfaces/surfaces';
import type { AdElementSpec, TextElementSpec } from '../../src/types/ad';

/**
 * Regression coverage for the previously-silent gap where a contradictory
 * ad spec (e.g. minWidth > maxWidth) passed straight through the resolver
 * and produced confusing, mis-diagnosed degradation instead of a clear
 * error. See validateSpecConstraints() in constraints.ts.
 */
describe('validateSpecConstraints', () => {
  it('does not reject the shipped demo spec', () => {
    // The single most important regression check for this fix: adding
    // stricter validation must never break the actual demo content.
    expect(() => validateSpecConstraints(adSpec.elements)).not.toThrow();
    for (const s of surfaces) {
      expect(() => resolveLayout(adSpec, s)).not.toThrow();
    }
  });

  it('rejects minWidth > maxWidth with a clear, element-identifying error', () => {
    const bad: AdElementSpec[] = adSpec.elements.map(e =>
      e.id === 'headline' ? { ...e, minWidth: 700, maxWidth: 650 } : e,
    );

    expect(() => validateSpecConstraints(bad)).toThrowError(/headline/);
    expect(() => validateSpecConstraints(bad)).toThrowError(/minWidth/);
  });

  it('rejects text.minFontSize > text.maxFontSize', () => {
    const headline = adSpec.elements.find(e => e.id === 'headline') as TextElementSpec;
    const bad: AdElementSpec[] = adSpec.elements.map(e =>
      e.id === 'headline'
        ? { ...headline, text: { ...headline.text, minFontSize: 999, maxFontSize: 40 } }
        : e,
    );

    expect(() => validateSpecConstraints(bad)).toThrowError(/headline/);
    expect(() => validateSpecConstraints(bad)).toThrowError(/minFontSize/);
  });

  it('rejects a non-positive dimension instead of silently propagating it', () => {
    const bad: AdElementSpec[] = adSpec.elements.map(e =>
      e.id === 'cta' ? { ...e, minWidth: 0 } : e,
    );

    expect(() => validateSpecConstraints(bad)).toThrowError(/cta/);
  });

  it('rejects a non-positive image aspect ratio', () => {
    const bad: AdElementSpec[] = adSpec.elements.map(e =>
      e.id === 'product-image' && e.type === 'image' && e.image
        ? { ...e, image: { ...e.image, aspectRatio: 0 } }
        : e,
    );

    expect(() => validateSpecConstraints(bad)).toThrowError(/product-image/);
  });

  it('is invoked automatically by resolveLayout, so a caller cannot bypass it', () => {
    const bad: AdElementSpec[] = adSpec.elements.map(e =>
      e.id === 'headline' ? { ...e, minWidth: 700, maxWidth: 650 } : e,
    );

    expect(() => resolveLayout({ ...adSpec, elements: bad }, surfaces[0])).toThrow();
  });

  it('accepts a spec with no maxWidth/maxHeight/maxFontSize declared at all', () => {
    // price and cta in the shipped demo spec declare no max* fields —
    // confirms the validator treats "unset" as "no ceiling", not as 0.
    const price = adSpec.elements.find(e => e.id === 'price')!;
    const cta = adSpec.elements.find(e => e.id === 'cta')!;

    expect(price.maxWidth).toBeUndefined();
    expect(cta.maxWidth).toBeUndefined();
    expect(() => validateSpecConstraints([price, cta])).not.toThrow();
  });
});
