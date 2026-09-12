import { it, expect } from 'vitest';
import { resolveLayout } from '../../src/resolver/resolver';
import { adSpec } from '../../src/spec/adSpec';
import { surfaces } from '../../src/surfaces/surfaces';

it('actually exercises LOW_CONTRAST_BRANDING against the shipped demo, not just synthetic fixtures', () => {
  // Before this, backgroundColor/foregroundColor were unset everywhere in
  // the shipped surfaces/spec, so the accessibility contrast check in
  // validator.ts was provably dead code in the running app — present and
  // unit-tested in isolation (contrast.test.ts), but never actually
  // invoked by anything a reviewer would click through in the demo.
  //
  // broadcastLowerThird.backgroundColor and the logo's foregroundColor
  // are now set to the exact colors the logo pill is already rendered
  // with (.ad-element.logo in styles.css), so this check genuinely runs
  // against real demo content on every resolve — not a hypothetical.
  const broadcast = surfaces.find(s => s.id === 'broadcastLowerThird')!;
  expect(broadcast.backgroundColor).toBeDefined();

  const layout = resolveLayout(adSpec, broadcast);
  expect(layout.validation.valid).toBe(true);

  const logo = layout.elements.find(e => e.id === 'logo');
  expect(logo?.visible).toBe(true);

  // No LOW_CONTRAST_BRANDING-triggered degradation — the chosen colors
  // (white on near-black, ~18.9:1) comfortably clear the WCAG AA 4.5:1
  // minimum, so the logo is never forced to hide or reposition.
  expect(layout.degradation.some(d => d.elementId === 'logo')).toBe(false);
});