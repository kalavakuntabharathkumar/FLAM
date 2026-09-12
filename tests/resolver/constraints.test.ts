import {
  it,
  expect,
} from 'vitest';

import {
  resolveLayout,
} from '../../src/resolver/resolver';

import {
  adSpec,
} from '../../src/spec/adSpec';

import {
  surfaces,
} from '../../src/surfaces/surfaces';

it(
  'respects text and tap constraints',
  () => {
    for (const s of surfaces) {
      const l =
        resolveLayout(
          adSpec,
          s,
        );

      for (
        const e of
        l.elements.filter(
          e => e.visible,
        )
      ) {
        if (
          e.type === 'text' ||
          (
            e.type === 'image' &&
            e.role === 'branding'
          )
        ) {
          expect(
            e.fontSize!,
          ).toBeGreaterThanOrEqual(
            s.minTextSize,
          );
        }

        if (
          e.type === 'button'
        ) {
          expect(
            Math.min(
              e.width,
              e.height,
            ),
          ).toBeGreaterThanOrEqual(
            s.minTapTarget,
          );
        }
      }
    }
  },
);