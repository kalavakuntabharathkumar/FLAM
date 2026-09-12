import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { ResolvedLayout, ResolvedElement } from '../types/layout';
import type { AdSpecification } from '../types/ad';
import { drawLayoutToCanvas } from '../rendering/renderCanvas';

const TRANSITION_MS = 320;

/** Matches the DOM renderer's `.ad-element`/`.ad-frame` easing curve. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * Builds an interpolated `ResolvedLayout` (plus a per-element opacity map)
 * for a single animation frame `t` (0 = `from`, 1 = `to`).
 *
 * Canvas has no CSS transitions of its own — the DOM backend gets smooth
 * relayout for free from `.ad-element`'s `transition` rules, but the
 * Canvas backend previously just cleared and redrew the bitmap once per
 * surface switch, i.e. a hard cut. This produces the equivalent of that
 * CSS behavior manually: elements present on both sides tween position/
 * size/font-size, elements only on one side cross-fade in or out at their
 * own (non-interpolated) geometry, matching the DOM renderer's fade-in
 * keyframe for newly-appearing elements.
 */
function interpolateLayout(
  from: ResolvedLayout,
  to: ResolvedLayout,
  t: number,
): { layout: ResolvedLayout; opacity: Map<string, number> } {
  const eased = easeOutCubic(t);
  const opacity = new Map<string, number>();
  const fromById = new Map(from.elements.map(e => [e.id, e]));
  const toById = new Map(to.elements.map(e => [e.id, e]));
  const ids = new Set([...fromById.keys(), ...toById.keys()]);

  const elements: ResolvedElement[] = [];

  for (const id of ids) {
    const a = fromById.get(id);
    const b = toById.get(id);

    if (a?.visible && b?.visible) {
      // Present (and visible) on both sides: tween geometry.
      elements.push({
        ...b,
        x: lerp(a.x, b.x, eased),
        y: lerp(a.y, b.y, eased),
        width: lerp(a.width, b.width, eased),
        height: lerp(a.height, b.height, eased),
        fontSize:
          a.fontSize !== undefined && b.fontSize !== undefined
            ? lerp(a.fontSize, b.fontSize, eased)
            : b.fontSize,
      });
      opacity.set(id, 1);
    } else if (b?.visible) {
      // Newly appearing (e.g. a reposition/repriority brought it back, or
      // it simply didn't exist on the previous surface's winning layout):
      // fade in at its final geometry rather than sliding from nowhere.
      elements.push(b);
      opacity.set(id, eased);
    } else if (a?.visible) {
      // Disappearing (dropped by degradation): fade out at its last
      // known geometry instead of vanishing instantly.
      elements.push(a);
      opacity.set(id, 1 - eased);
    }
  }

  // The frame itself (surface dimensions) also tweens, matching the DOM
  // renderer's `.ad-frame { transition: width, height, transform }`.
  return {
    layout: {
      ...to,
      width: lerp(from.width, to.width, eased),
      height: lerp(from.height, to.height, eased),
      elements,
    },
    opacity,
  };
}

/**
 * Loads and caches real <img> bitmaps for non-branding image elements in
 * the current ad spec, so the Canvas backend can draw the actual photo
 * instead of a placeholder rectangle — matching what the DOM renderer
 * already does with a plain <img src>.
 *
 * This is purely additive: it never touches the resolver, never touches
 * ResolvedLayout, and if an image hasn't finished loading yet
 * drawLayoutToCanvas falls back to its existing placeholder behavior
 * unchanged.
 */
function useLoadedImages(ad: AdSpecification): ReadonlyMap<string, HTMLImageElement> {
  const [images, setImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const requested = useRef<Set<string>>(new Set());

  useEffect(() => {
    const urls = new Set(
      ad.elements
        .filter(e => e.type === 'image' && e.role !== 'branding')
        .map(e => e.content),
    );

    for (const url of urls) {
      if (requested.current.has(url)) continue;
      requested.current.add(url);

      const img = new Image();
      img.onload = () => {
        setImages(prev => {
          const next = new Map(prev);
          next.set(url, img);
          return next;
        });
      };
      img.src = url;
    }
  }, [ad]);

  return images;
}

/**
 * Canvas rendering backend for the same `ResolvedLayout` AdRenderer.tsx
 * (the DOM backend) consumes. See rendering/renderCanvas.ts for the
 * framework-agnostic draw function this wraps.
 */
export function CanvasAdRenderer({
  layout,
  ad,
}: {
  layout: ResolvedLayout;
  ad: AdSpecification;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const images = useLoadedImages(ad);

  // Same measured-scale strategy as AdRenderer.tsx (the DOM backend):
  // observe the available box and compute an explicit scale factor,
  // rather than asking the browser to letterbox a <canvas> via CSS
  // object-fit. object-fit support/behavior for <canvas> intrinsic sizing
  // is inconsistent, and previously the canvas's own CSS border box (via
  // width:100%/height:100%) could end up a different aspect ratio than
  // the square/rectangular surface actually drawn inside it — this keeps
  // the on-screen box pixel-exact to the resolved layout, matching the
  // DOM renderer's guarantee.
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const updateScale = () => {
      const rect = stage.getBoundingClientRect();
      const availableWidth = Math.max(1, rect.width);
      const availableHeight = Math.max(1, rect.height);

      const next = Math.min(
        availableWidth / layout.width,
        availableHeight / layout.height,
      );

      setScale(Number.isFinite(next) && next > 0 ? next : 1);
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(stage);

    return () => observer.disconnect();
  }, [layout.width, layout.height]);

  // Previous committed layout, kept purely so a surface switch has
  // something to animate *from*. `undefined` on first mount (nothing to
  // tween from — draw the first layout immediately, matching the DOM
  // renderer's fade-in-only behavior for a fresh mount).
  const prevLayoutRef = useRef<ResolvedLayout | undefined>(undefined);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (rafRef.current !== undefined) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
    }

    const from = prevLayoutRef.current;

    // Canvas backbuffer must always match the *final* logical surface
    // size — the frame tween below only interpolates what's drawn inside
    // it, matching the DOM backend where the outer `.ad-frame` box itself
    // also animates via CSS but the canvas element's pixel buffer is
    // sized once per draw.
    canvas.width = layout.width;
    canvas.height = layout.height;

    if (!from || prefersReducedMotion()) {
      drawLayoutToCanvas(ctx, layout, ad, images);
      prevLayoutRef.current = layout;
      return;
    }

    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / TRANSITION_MS);
      const { layout: frameLayout, opacity } = interpolateLayout(from, layout, t);

      canvas.width = layout.width;
      canvas.height = layout.height;
      drawLayoutToCanvas(ctx, frameLayout, ad, images, opacity);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = undefined;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    prevLayoutRef.current = layout;

    return () => {
      if (rafRef.current !== undefined) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = undefined;
      }
    };
  }, [layout, ad, images]);

  return (
    <div ref={stageRef} className="ad-render-stage">
      <canvas
        ref={canvasRef}
        className="ad-canvas"
        data-surface={layout.surfaceId}
        style={{
          width: layout.width * scale,
          height: layout.height * scale,
          borderRadius: 10,
          boxShadow: '0 18px 60px #0008',
        }}
      />
    </div>
  );
}