import { describe, it, expect } from 'vitest';
import { place } from '../../src/resolver/placement';
import { resolveLayout } from '../../src/resolver/resolver';
import { adSpec } from '../../src/spec/adSpec';
import { surfaces } from '../../src/surfaces/surfaces';
import type { AdElementSpec } from '../../src/types/ad';
import type { SurfaceProfile } from '../../src/types/surface';

describe('reposition degradation', () => {
  it('places a repositioned element as a corner overlay, outside the main flow, without overlapping it', () => {
    const surface: SurfaceProfile = {
      id: 'synthetic',
      name: 'Synthetic',
      width: 600,
      height: 300,
      safeArea: { top: 16, right: 16, bottom: 16, left: 16 },
      minTapTarget: 44,
      minTextSize: 16,
      viewingDistance: 'near',
      touchOnly: false,
    };

    const hero: AdElementSpec = {
      id: 'hero',
      type: 'image',
      role: 'hero',
      content: 'x',
      priority: 1,
      minWidth: 200,
      minHeight: 200,
      preferredWidth: 200,
      preferredHeight: 200,
      image: { aspectRatio: 1, minWidth: 200, minHeight: 200, preferredWidth: 200, preferredHeight: 200 },
      flexibility: { resize: true, reposition: false, truncate: false, droppable: false },
    };

    const badge: AdElementSpec = {
      id: 'badge',
      type: 'image',
      role: 'branding',
      content: 'BADGE',
      priority: 3,
      minWidth: 60,
      minHeight: 24,
      preferredWidth: 60,
      preferredHeight: 24,
      flexibility: { resize: true, reposition: true, truncate: false, droppable: true },
    };

    // Same call shape resolver.ts uses for a reposition trial: pull `badge`
    // out of the flow via the `repositioned` set instead of hiding it.
    const elements = place([hero, badge], surface, 'vertical', new Set(), new Set(), new Set(['badge']));

    const heroEl = elements.find(e => e.id === 'hero')!;
    const badgeEl = elements.find(e => e.id === 'badge')!;

    expect(badgeEl.visible).toBe(true);
    expect(badgeEl.repositioned).toBe(true);

    const overlap =
      heroEl.x < badgeEl.x + badgeEl.width &&
      heroEl.x + heroEl.width > badgeEl.x &&
      heroEl.y < badgeEl.y + badgeEl.height &&
      heroEl.y + heroEl.height > badgeEl.y;

    expect(overlap).toBe(false);
  });

  it('falls back to hide (not reposition) when no safe-area corner is actually free, leaving the shipped demo unchanged', () => {
    // This is the exact surface the demo ships as "Compact Widget" — the
    // one intentionally too tight for all five elements. The reposition
    // trial should be attempted and rejected (no free corner), and the
    // resolver should fall through to the pre-existing hide behavior.
    const compact = surfaces.find(s => s.id === 'compactWidget')!;
    const layout = resolveLayout(adSpec, compact);

    expect(layout.validation.valid).toBe(true);
    expect(layout.degradation.some(d => d.operation === 'hide' && d.elementId === 'logo')).toBe(true);
    expect(layout.degradation.some(d => d.operation === 'reposition')).toBe(false);

    const logo = layout.elements.find(e => e.id === 'logo');
    expect(logo?.visible).toBe(false);
  });
});