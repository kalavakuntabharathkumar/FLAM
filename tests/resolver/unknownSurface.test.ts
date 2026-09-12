import {it,expect} from 'vitest'; import {resolveLayout} from '../../src/resolver/resolver'; import {adSpec} from '../../src/spec/adSpec'; import {unknownSurface} from '../../src/surfaces/surfaces';
it('resolves an unknown fifth surface without special casing',()=>{const l=resolveLayout(adSpec,unknownSurface);expect(l.validation.valid).toBe(true);expect(l.elements.length).toBeGreaterThan(0)});
