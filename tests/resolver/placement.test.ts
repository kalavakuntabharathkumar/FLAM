import { describe, it, expect } from 'vitest';
import { resolveLayout } from '../../src/resolver/resolver';
import { adSpec } from '../../src/spec/adSpec';
import { surfaces } from '../../src/surfaces/surfaces';

it('never overlaps visible elements', () => {
  for (const s of surfaces) {
    const l = resolveLayout(adSpec, s);
    const v = l.elements.filter(e => e.visible);

    for (let i = 0; i < v.length; i++) {
      for (let j = i + 1; j < v.length; j++) {
        const noOverlap =
          v[i].x >= v[j].x + v[j].width ||
          v[j].x >= v[i].x + v[i].width ||
          v[i].y >= v[j].y + v[j].height ||
          v[j].y >= v[i].y + v[i].height;

        expect(noOverlap).toBe(true);
      }
    }
  }
});

describe('composition vertical balance', () => {
  it('keeps a sparse composition centered inside the safe area', () => {
    const kiosk = surfaces.find(s => s.width === 1080 && s.height === 1080)!;
    const layout = resolveLayout(adSpec, kiosk);
    const visible = layout.elements.filter(e => e.visible);
    const top = Math.min(...visible.map(e => e.y));
    const bottom = Math.max(...visible.map(e => e.y + e.height));
    const safeTop = kiosk.safeArea.top;
    const safeBottom = kiosk.height - kiosk.safeArea.bottom;
    const topFree = top - safeTop;
    const bottomFree = safeBottom - bottom;

    expect(Math.abs(topFree - bottomFree)).toBeLessThan(0.1);
    expect(visible.every(e => e.y >= safeTop - 0.01)).toBe(true);
    expect(visible.every(e => e.y + e.height <= safeBottom + 0.01)).toBe(true);
  });

  it('grows elements with growth ceilings into a spacious surface instead of leaving it sparse', () => {
    const kiosk = surfaces.find(s => s.width === 1080 && s.height === 1080)!;
    const layout = resolveLayout(adSpec, kiosk);

    expect(layout.validation.valid).toBe(true);

    const visible = layout.elements.filter(e => e.visible);
    const usedArea = visible.reduce((sum, e) => sum + e.width * e.height, 0);
    const safeWidth = kiosk.width - kiosk.safeArea.left - kiosk.safeArea.right;
    const safeHeight = kiosk.height - kiosk.safeArea.top - kiosk.safeArea.bottom;
    const efficiency = usedArea / (safeWidth * safeHeight);

    // Before the growth ceilings were wired up, this surface's efficiency
    // was ~12.8% (elements frozen at their mobile-tuned preferred size).
    // Locks in that the fix actually grows content to fill the space,
    // rather than just re-centering the same small elements.
    expect(efficiency).toBeGreaterThan(0.4);

    const heroImage = visible.find(e => e.id === 'product-image')!;
    const headline = visible.find(e => e.id === 'headline')!;

    expect(heroImage.width).toBeGreaterThan(260);
    expect(headline.fontSize).toBeGreaterThan(34);
  });

  it('does not regrow elements that have no declared growth ceiling (price stays at its preferred size on the kiosk)', () => {
    const kiosk = surfaces.find(s => s.width === 1080 && s.height === 1080)!;
    const layout = resolveLayout(adSpec, kiosk);
    const price = layout.elements.find(e => e.id === 'price' && e.visible)!;

    // price/CTA deliberately have no maxWidth/maxHeight/maxFontSize, so
    // they must stay at their declared preferredFontSize (28, see
    // adSpec.ts) even on a surface with abundant spare room — never
    // shrinking (there's plenty of space) and never growing past it
    // (no growth ceiling is declared).
    expect(price.fontSize).toBeCloseTo(28, 1);
  });

  it('does not regress mobileLandscape hero image size (the redistribution regression caught during development)', () => {
    const mobileLandscape = surfaces.find(s => s.width === 480 && s.height === 320)!;
    const layout = resolveLayout(adSpec, mobileLandscape);
    const heroImage = layout.elements.find(e => e.id === 'product-image' && e.visible)!;

    expect(heroImage.width).toBeCloseTo(155, 0);
    expect(heroImage.height).toBeCloseTo(115, 0);
  });
});