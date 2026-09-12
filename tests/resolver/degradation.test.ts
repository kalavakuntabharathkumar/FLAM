import { describe, it, expect } from 'vitest';
import { resolveLayout } from '../../src/resolver/resolver';
import { adSpec } from '../../src/spec/adSpec';
import { surfaces } from '../../src/surfaces/surfaces';

describe('degradation', () => {
  it('is deterministic and protects required content on a roomy surface', () => {
    const s = surfaces[0];
    const a = resolveLayout(adSpec, s);
    const b = resolveLayout(adSpec, s);
    expect(a).toEqual(b);
    expect(a.elements.find(e => e.id === 'headline')?.visible).toBe(true);
    expect(a.elements.find(e => e.id === 'product-image')?.visible).toBe(true);
  });

  it('actually drops branding on the intentionally tight surface, not just in theory', () => {
    const compact = surfaces.find(s => s.id === 'compactWidget')!;
    const layout = resolveLayout(adSpec, compact);

    expect(layout.validation.valid).toBe(true);

    // The degradation log must contain a real 'hide' decision for the
    // lowest-priority droppable element (logo/branding) — not an empty
    // array, which was the previous, silently-untested state.
    expect(layout.degradation.some(d => d.operation === 'hide' && d.elementId === 'logo')).toBe(true);

    // The dropped element must still be present in the resolved output,
    // marked visible:false — not simply absent from the array. This is
    // what lets the debug panel and any renderer report a drop instead of
    // an element quietly vanishing.
    const logo = layout.elements.find(e => e.id === 'logo');
    expect(logo).toBeDefined();
    expect(logo?.visible).toBe(false);

    // Higher-priority content must remain intact: not hidden, not
    // truncated, and the CTA must still be a real, tappable element.
    const headline = layout.elements.find(e => e.id === 'headline');
    const cta = layout.elements.find(e => e.id === 'cta');
    expect(headline?.visible).toBe(true);
    expect(headline?.truncated).toBeFalsy();
    expect(cta?.visible).toBe(true);
    expect(Math.min(cta!.width, cta!.height)).toBeGreaterThanOrEqual(compact.minTapTarget);
  });

  it('records a resize decision when a visible element renders below its preferred font size', () => {
    const compact = surfaces.find(s => s.id === 'compactWidget')!;
    const layout = resolveLayout(adSpec, compact);

    const headlineSpec = adSpec.elements.find(e => e.id === 'headline')!;
    const headline = layout.elements.find(e => e.id === 'headline');

    if (headline?.fontSize && headline.fontSize < headlineSpec.text!.preferredFontSize - 0.01) {
      expect(
        layout.degradation.some(d => d.operation === 'resize' && d.elementId === 'headline'),
      ).toBe(true);
    }
  });
});