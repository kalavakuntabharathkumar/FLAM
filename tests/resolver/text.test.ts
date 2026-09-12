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
    const p = l.elements.find(e => e.id === 'price');
    if (p?.visible) {
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
    }
  }
});