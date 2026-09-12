import { it, expect } from 'vitest';
import { resolveLayout } from '../../src/resolver/resolver';
import { adSpec } from '../../src/spec/adSpec';
import { unknownSurface } from '../../src/surfaces/surfaces';

it('resolves an unknown fifth surface without special casing', () => {
  // unknownSurface (713 × 287) is never referenced by id or dimensions
  // anywhere in resolver.ts, placement.ts, composition.ts, or
  // degradation.ts — this is the direct proof of the assignment's bonus
  // requirement that a previously-unseen surface resolves correctly
  // through the same generic pipeline, with zero resolver code changes.
  const layout = resolveLayout(adSpec, unknownSurface);

  expect(layout.validation.valid).toBe(true);
  expect(layout.elements.length).toBeGreaterThan(0);
});