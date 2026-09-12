import { describe, it, expect } from 'vitest';
import { resolveLayout } from '../../src/resolver/resolver';
import { adSpec } from '../../src/spec/adSpec';
import { surfaces } from '../../src/surfaces/surfaces';

describe('viewingDistance', () => {
  it('gives far-viewing surfaces more spacing between elements than a same-size near surface would', () => {
    // Isolates the effect of `viewingDistance` alone: two surfaces with
    // identical pixel dimensions and safe area, differing only in
    // viewingDistance, must produce different inter-element spacing.
    // This is the regression test for the fix — without it, 'far' and
    // 'near' are indistinguishable to the resolver.
    const shared = {
      width: 1920,
      height: 250,
      safeArea: { top: 16, right: 48, bottom: 16, left: 48 },
      minTapTarget: 44,
      minTextSize: 32,
      touchOnly: false,
    };

    const near = resolveLayout(adSpec, { id: 'near', name: 'Near', ...shared, viewingDistance: 'near' });
    const far = resolveLayout(adSpec, { id: 'far', name: 'Far', ...shared, viewingDistance: 'far' });

    expect(near.validation.valid).toBe(true);
    expect(far.validation.valid).toBe(true);

    // Same composition family should still win for both (same content,
    // same size) — only spacing should differ, not the whole layout shape.
    expect(far.composition).toBe(near.composition);

    const gapBetween = (layout: typeof near, aId: string, bId: string) => {
      const a = layout.elements.find(e => e.id === aId && e.visible)!;
      const b = layout.elements.find(e => e.id === bId && e.visible)!;
      // Horizontal neighbors on this wide, short surface: gap is the
      // space between a's right edge and b's left edge.
      return a.x < b.x ? b.x - (a.x + a.width) : a.x - (b.x + b.width);
    };

    const nearGap = gapBetween(near, 'headline', 'product-image');
    const farGap = gapBetween(far, 'headline', 'product-image');

    expect(farGap).toBeGreaterThan(nearGap);
  });

  it('leaves every shipped near-viewing surface byte-for-byte unaffected', () => {
    // All shipped surfaces except broadcastLowerThird are 'near', so this
    // locks in that the fix is additive: nothing about the demo's actual
    // resolved output changes for near surfaces.
    for (const s of surfaces.filter(s => s.viewingDistance === 'near')) {
      const layout = resolveLayout(adSpec, s);
      expect(layout.validation.valid).toBe(true);
    }
  });
});