import {
  describe,
  expect,
  it,
} from 'vitest';

import type {
  AdElementSpec,
} from '../../src/types/ad';

const base = {
  id: 'element',
  content: 'content',
  priority: 1 as const,
  minWidth: 10,
  minHeight: 10,
  preferredWidth: 20,
  preferredHeight: 20,
  flexibility: {
    resize: true,
    reposition: true,
    truncate: false,
    droppable: false,
  },
};

const textConstraints = {
  minFontSize: 12,
  preferredFontSize: 16,
  allowTruncation: true,
};

const imageConstraints = {
  aspectRatio: 1,
  minWidth: 10,
  minHeight: 10,
  preferredWidth: 20,
  preferredHeight: 20,
};

describe(
  'element type and role model',
  () => {
    it(
      'represents the required type/role combinations independently',
      () => {
        const elements:
          AdElementSpec[] = [
            {
              ...base,
              id: 'headline',
              type: 'text',
              role: 'primary',
              text: textConstraints,
            },
            {
              ...base,
              id: 'product-image',
              type: 'image',
              role: 'hero',
              image: imageConstraints,
            },
            {
              ...base,
              id: 'cta',
              type: 'button',
              role: 'action',
            },
            {
              ...base,
              id: 'logo',
              type: 'image',
              role: 'branding',
            },
            {
              ...base,
              id: 'price',
              type: 'text',
              role: 'secondary',
              text: textConstraints,
            },
          ];

        expect(
          elements.map(
            ({
              type,
              role,
            }) => ({
              type,
              role,
            }),
          ),
        ).toEqual([
          {
            type: 'text',
            role: 'primary',
          },
          {
            type: 'image',
            role: 'hero',
          },
          {
            type: 'button',
            role: 'action',
          },
          {
            type: 'image',
            role: 'branding',
          },
          {
            type: 'text',
            role: 'secondary',
          },
        ]);
      },
    );

    it(
      'allows the same type to carry different roles',
      () => {
        const textPrimary:
          AdElementSpec = {
            ...base,
            id: 'primary',
            type: 'text',
            role: 'primary',
            text: textConstraints,
          };

        const textSecondary:
          AdElementSpec = {
            ...base,
            id: 'secondary',
            type: 'text',
            role: 'secondary',
            text: textConstraints,
          };

        const imageHero:
          AdElementSpec = {
            ...base,
            id: 'hero',
            type: 'image',
            role: 'hero',
            image: imageConstraints,
          };

        const imageBranding:
          AdElementSpec = {
            ...base,
            id: 'branding',
            type: 'image',
            role: 'branding',
          };

        expect(
          textPrimary.type,
        ).toBe(
          textSecondary.type,
        );

        expect(
          textPrimary.role,
        ).not.toBe(
          textSecondary.role,
        );

        expect(
          imageHero.type,
        ).toBe(
          imageBranding.type,
        );

        expect(
          imageHero.role,
        ).not.toBe(
          imageBranding.role,
        );
      },
    );
  },
);