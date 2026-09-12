import type { AdSpecification } from '../types/ad';

/**
 * Thin, purely-typed factory around an `AdSpecification` literal.
 *
 * This is intentionally a typed identity function — it does not change,
 * validate, or transform the spec in any way, so wrapping the existing
 * literal in it cannot change resolver output. Its only job is to give spec
 * authors the same `defineAd({...})` entry point the assignment brief uses,
 * and a single place to add spec-level validation later (e.g. duplicate
 * role checks) without touching every call site.
 */
export function defineAd(spec: AdSpecification): AdSpecification {
  return spec;
}

export const adSpec = defineAd({
  id: 'demo-product-ad',

  elements: [
    {
      id: 'headline',
      type: 'text',
      role: 'primary',
      content: 'Fresh technology. Designed for everyday performance.',
      priority: 1,
      minWidth: 110,
      minHeight: 24,
      preferredWidth: 520,
      preferredHeight: 72,
      maxWidth: 650,
      maxHeight: 165,
      text: {
        minFontSize: 18,
        preferredFontSize: 34,
        maxFontSize: 40,
        maxLines: 3,
        allowTruncation: true,
      },
      flexibility: {
        resize: true,
        reposition: true,
        truncate: true,
        droppable: false,
      },
    },

    {
      id: 'product-image',
      type: 'image',
      role: 'hero',
      // A real, renderable image URL. The resolver never inspects this
      // value (it only uses `image.aspectRatio` etc. for layout math) —
      // the renderer passes it straight to an <img src>.
      content:
        'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=600&h=444&fit=crop',
      priority: 1,
      minWidth: 80,
      minHeight: 80,
      preferredWidth: 260,
      preferredHeight: 220,
      maxWidth: 640,
      maxHeight: 474,
      image: {
        aspectRatio: 1.35,
        minWidth: 80,
        minHeight: 80,
        preferredWidth: 260,
        preferredHeight: 220,
      },
      flexibility: {
        resize: true,
        reposition: true,
        truncate: false,
        droppable: false,
      },
    },

    {
      id: 'price',
      type: 'text',
      role: 'secondary',
      content: '₹4,999',
      priority: 2,
      minWidth: 72,
      minHeight: 24,
      preferredWidth: 210,
      preferredHeight: 50,
      text: {
        minFontSize: 16,
        preferredFontSize: 28,
        maxLines: 1,
        allowTruncation: true,
      },
      flexibility: {
        resize: true,
        reposition: true,
        truncate: true,
        droppable: false,
      },
    },

    {
      id: 'cta',
      type: 'button',
      role: 'action',
      content: 'SHOP NOW',
      priority: 2,
      minWidth: 96,
      minHeight: 44,
      preferredWidth: 150,
      preferredHeight: 52,
      flexibility: {
        resize: true,
        reposition: true,
        truncate: false,
        droppable: false,
      },
    },

    {
      id: 'logo',
      type: 'image',
      role: 'branding',
      content: 'FLAM AI',
      priority: 3,
      minWidth: 70,
      minHeight: 24,
      preferredWidth: 110,
      preferredHeight: 34,
      flexibility: {
      resize: true,
      reposition: true,
      truncate: false,
      droppable: true,
    },
    // Matches .ad-element.logo's actual rendered text color (color:#fff
    // in styles.css / '#ffffff' fillStyle in renderCanvas.ts). See
    // broadcastLowerThird's backgroundColor in surfaces.ts.
    foregroundColor: '#ffffff',
    },
  ],
});