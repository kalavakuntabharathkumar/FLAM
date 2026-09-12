import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { ResolvedLayout } from '../types/layout';
import type { AdSpecification } from '../types/ad';
import { drawLayoutToCanvas } from '../rendering/renderCanvas';

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = layout.width;
    canvas.height = layout.height;

    drawLayoutToCanvas(ctx, layout, ad, images);
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