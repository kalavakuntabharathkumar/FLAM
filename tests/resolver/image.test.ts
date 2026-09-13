import { it, expect } from 'vitest';
import { resolveLayout } from '../../src/resolver/resolver';
import { adSpec } from '../../src/spec/adSpec';
import { surfaces } from '../../src/surfaces/surfaces';

it('preserves product image aspect ratio', () => {
  // The hero product image's declared aspect ratio (1.35, see adSpec.ts)
  // must survive resolution on every surface it's actually visible on —
  // buildElement() derives width/height from the ratio directly, so any
  // drift here would mean a surface is stretching or squashing the image
  // rather than fitting it.
  for (const s of surfaces) {
    const layout = resolveLayout(adSpec, s);
    const productImage = layout.elements.find(e => e.id === 'product-image');

    // product-image is priority 1 and non-droppable (see adSpec.ts) on
    // every shipped surface, so it must be visible everywhere. Asserting
    // this — instead of silently `continue`-ing past a surface where it
    // isn't — turns "the hero image got dropped somewhere it shouldn't
    // have" into a loud failure instead of a quietly skipped check.
    expect(productImage?.visible, `product-image should be visible on ${s.name}`).toBe(true);

    const resolvedRatio = productImage!.width / productImage!.height;
    expect(Math.abs(resolvedRatio - 1.35)).toBeLessThan(0.09);
  }
});