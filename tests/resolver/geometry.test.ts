import { describe, it, expect } from 'vitest';
import { resolveLayout } from '../../src/resolver/resolver';
import { adSpec } from '../../src/spec/adSpec';
import { surfaces, unknownSurface } from '../../src/surfaces/surfaces';

describe('geometry', () => {
  // Every shipped surface, plus the unknown fifth surface, must resolve to
  // a valid layout whose visible elements stay strictly inside that
  // surface's own safe area — never past its edges, regardless of
  // composition family or degradation state.
  for (const s of [...surfaces, unknownSurface]) {
    it(`${s.name} is valid`, () => {
      const layout = resolveLayout(adSpec, s);
      expect(layout.validation.valid).toBe(true);

      const safeLeft = s.safeArea.left;
      const safeTop = s.safeArea.top;
      const safeRight = s.width - s.safeArea.right;
      const safeBottom = s.height - s.safeArea.bottom;

      for (const element of layout.elements.filter(e => e.visible)) {
        expect(element.x).toBeGreaterThanOrEqual(safeLeft - 0.01);
        expect(element.y).toBeGreaterThanOrEqual(safeTop - 0.01);
        expect(element.x + element.width).toBeLessThanOrEqual(safeRight + 0.01);
        expect(element.y + element.height).toBeLessThanOrEqual(safeBottom + 0.01);
      }
    });
  }
});