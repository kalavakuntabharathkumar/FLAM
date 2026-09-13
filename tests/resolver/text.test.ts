import { it, expect } from 'vitest';
import { resolveLayout } from '../../src/resolver/resolver';
import { adSpec } from '../../src/spec/adSpec';
import { surfaces } from '../../src/surfaces/surfaces';
import type { AdSpecification } from '../../src/types/ad';

/**
 * The shipped demo spec (adSpec.ts) uses a realistic price so the live
 * demo actually looks like a real product ad. This test builds its own
 * variant with a deliberately extreme, comma-malformed, no-whitespace
 * price string, so the "extreme price content" stress case the assignment
 * explicitly asks to be evaluated stays covered independently of whatever
 * the demo happens to display.
 */
const extremePriceSpec: AdSpecification = {
  ...adSpec,
  elements: adSpec.elements.map(e =>
    e.id === 'price' ? { ...e, content: '₹40,0000000000000' } : e,
  ),
};

it('extreme price never escapes its box', () => {
  for (const s of surfaces) {
    const l = resolveLayout(extremePriceSpec, s);

    // The resolver's own validator already checks TEXT_OVERFLOW/TEXT_CLIPPING
    // for every visible text element — asserting overall validity here is
    // the real "never escapes its box" guarantee, not just a >0 dimension
    // check that would pass even for a badly clipped box.
    expect(l.validation.valid, `resolved layout for ${s.name} should be valid`).toBe(true);

    const p = l.elements.find(e => e.id === 'price');

    // price is priority 2 and non-droppable (flexibility.droppable: false
    // in adSpec.ts), so it must remain visible on every surface even with
    // this deliberately extreme content — it may truncate, but never hide.
    expect(p?.visible, `price should be visible on ${s.name}`).toBe(true);
    expect(p!.width).toBeGreaterThan(0);
    expect(p!.height).toBeGreaterThan(0);
  }
});
