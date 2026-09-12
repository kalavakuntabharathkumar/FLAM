import type { ResolvedLayout } from '../types/layout';
import type { AdSpecification } from '../types/ad';

/**
 * Canvas rendering backend.
 *
 * Consumes the exact same `ResolvedLayout` the DOM renderer
 * (rendering/renderDom.ts / components/AdRenderer.tsx) consumes. It does
 * not import React, does not touch the DOM renderer, and does not call
 * back into the resolver — it only draws whatever `resolveLayout()` already
 * decided.
 *
 * `images` is an optional map of content-URL -> loaded HTMLImageElement.
 * When an entry is present and finished loading, the real bitmap is drawn
 * (contain-fit, preserving its natural aspect ratio, centered in the
 * resolved box). When it isn't present yet, this falls back to the
 * original placeholder rectangle unchanged — so nothing about existing
 * behavior changes for a caller that doesn't pass `images`.
 */
export function drawLayoutToCanvas(
  ctx: CanvasRenderingContext2D,
  layout: ResolvedLayout,
  ad: AdSpecification,
  images: ReadonlyMap<string, HTMLImageElement> = new Map(),
): void {
  const spec = (id: string) => ad.elements.find(e => e.id === id);

  ctx.clearRect(0, 0, layout.width, layout.height);

  // Hard-clip everything drawn below to the surface's own bounds. This is
  // the Canvas-backend equivalent of the DOM renderer's `.ad-frame
  // { overflow: hidden }` — a defensive guarantee that no draw call can
  // ever paint outside the resolved frame, independent of whether the
  // resolver's geometry is exactly right in every edge case.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, layout.width, layout.height);
  ctx.clip();

  // Frame background, matching the DOM renderer's .ad-frame background.
  ctx.fillStyle = '#f3f3f1';
  ctx.fillRect(0, 0, layout.width, layout.height);

  const visible = [...layout.elements]
    .filter(e => e.visible)
    .sort((a, b) => a.zIndex - b.zIndex);

  for (const e of visible) {
    const s = spec(e.id);
    if (!s) continue;

    ctx.save();

    if (e.type === 'image' && e.role !== 'branding') {
      const img = images.get(s.content);

      if (img && img.complete && img.naturalWidth > 0) {
        // Contain-fit: preserve the real image's natural aspect ratio
        // inside the resolver's resolved box, centered — same visual
        // contract as the DOM renderer's objectFit: 'contain'.
        const boxRatio = e.width / e.height;
        const imgRatio = img.naturalWidth / img.naturalHeight;

        let drawWidth = e.width;
        let drawHeight = e.height;

        if (imgRatio > boxRatio) {
          drawHeight = e.width / imgRatio;
        } else {
          drawWidth = e.height * imgRatio;
        }

        const dx = e.x + (e.width - drawWidth) / 2;
        const dy = e.y + (e.height - drawHeight) / 2;

        ctx.drawImage(img, dx, dy, drawWidth, drawHeight);
      } else {
        // Unchanged fallback — image not loaded yet (or failed to load).
        ctx.fillStyle = '#dddddd';
        ctx.fillRect(e.x, e.y, e.width, e.height);
      }
    } else if (e.type === 'image' && e.role === 'branding') {
      ctx.fillStyle = '#111111';
      ctx.fillRect(e.x, e.y, e.width, e.height);
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${e.fontSize ?? 14}px Inter, ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(e.text ?? '', e.x + e.width / 2, e.y + e.height / 2, e.width);
    } else if (e.type === 'button') {
      ctx.fillStyle = '#111111';
      ctx.beginPath();
      const r = e.height / 2;
      ctx.moveTo(e.x + r, e.y);
      ctx.arcTo(e.x + e.width, e.y, e.x + e.width, e.y + e.height, r);
      ctx.arcTo(e.x + e.width, e.y + e.height, e.x, e.y + e.height, r);
      ctx.arcTo(e.x, e.y + e.height, e.x, e.y, r);
      ctx.arcTo(e.x, e.y, e.x + e.width, e.y, r);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${Math.round(e.height * 0.32)}px Inter, ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.content, e.x + e.width / 2, e.y + e.height / 2, e.width - 16);
    } else {
      // text
      ctx.fillStyle = '#111111';
      ctx.font = `800 ${e.fontSize ?? 16}px Inter, ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const lineHeight = (e.fontSize ?? 16) * (e.lineHeight ?? 1.2);
      const words = (e.text ?? '').split(' ');
      let line = '';
      let y = e.y;
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > e.width && line) {
          ctx.fillText(line, e.x, y, e.width);
          line = word;
          y += lineHeight;
        } else {
          line = test;
        }
      }
      if (line) ctx.fillText(line, e.x, y, e.width);
    }

    ctx.restore();
  }

  // Pop the outer surface-bounds clip pushed above.
  ctx.restore();
}