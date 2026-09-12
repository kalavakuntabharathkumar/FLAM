import {
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import type { ResolvedLayout } from '../types/layout';
import type { AdSpecification } from '../types/ad';

import {
  displayText,
  elementStyle,
} from '../rendering/renderDom';

export function AdRenderer({
  layout,
  ad,
}: {
  layout: ResolvedLayout;
  ad: AdSpecification;
}) {
  const spec = (id: string) =>
    ad.elements.find(
      e => e.id === id,
    )!;

  const stageRef =
    useRef<HTMLDivElement>(null);

  const [scale, setScale] =
    useState(1);

  useLayoutEffect(() => {
    const stage =
      stageRef.current;

    if (!stage) {
      return;
    }

    const updateScale = () => {
      const rect =
        stage.getBoundingClientRect();

      const availableWidth =
        Math.max(
          1,
          rect.width,
        );

      const availableHeight =
        Math.max(
          1,
          rect.height,
        );

      const next = Math.min(
        availableWidth /
          layout.width,
        availableHeight /
          layout.height,
      );

      setScale(
        Number.isFinite(next) &&
          next > 0
          ? next
          : 1,
      );
    };

    updateScale();

    const observer =
      new ResizeObserver(
        updateScale,
      );

    observer.observe(stage);

    return () =>
      observer.disconnect();
  }, [
    layout.width,
    layout.height,
  ]);

  const previewWidth =
    layout.width * scale;

  const previewHeight =
    layout.height * scale;

  return (
    <div
      ref={stageRef}
      className="ad-render-stage"
      data-preview-scale={scale}
    >
      <div
        className="ad-viewport"
        style={{
          width: previewWidth,
          height: previewHeight,
        }}
        data-render-width={
          previewWidth
        }
        data-render-height={
          previewHeight
        }
      >
        <div
          className="ad-frame"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `scale(${scale})`,
          }}
          data-surface={
            layout.surfaceId
          }
          data-width={layout.width}
          data-height={layout.height}
          data-scale={scale}
        >
          {/*
           * Stable DOM order, not resolver output order.
           *
           * The resolver is free to return `layout.elements` in whatever
           * order a given composition family happened to place them in
           * (vertical/horizontal/mixed can each produce a different
           * internal ordering for the same element set). If this list is
           * mapped in *that* order, switching surfaces can reorder the
           * <div> children in the DOM even though their `key`s are
           * unchanged. A same-key-different-position update still gets
           * reconciled by React, but the DOM move happens in the same
           * commit as the style change — in practice this reads as the
           * CSS transition being skipped ("blinking") for exactly the
           * elements whose sibling order shifted, rather than a smooth
           * left/top/width/height interpolation.
           *
           * Sorting by each element's fixed position in the original ad
           * spec keeps sibling order identical across every surface and
           * every composition, so only style values change on relayout —
           * which is what .ad-element's CSS transitions can actually
           * animate. Visual stacking is unaffected because it's driven by
           * `zIndex` in `elementStyle()`, not DOM order.
           */}
          {[...layout.elements]
            .filter(e => e.visible)
            .sort(
              (a, b) =>
                ad.elements.findIndex(s => s.id === a.id) -
                ad.elements.findIndex(s => s.id === b.id),
            )
            .map(e => {
              const s =
                spec(e.id);

              const common =
                elementStyle(e);

              /*
               * Physical image elements retain the existing image
               * presentation. Branding images are handled separately
               * below because the existing logo representation was
               * text-like in the layout engine.
               */
              if (
                e.type === 'image' &&
                e.role !== 'branding'
              ) {
                return (
                  <div
                    key={e.id}
                    className="ad-element image"
                    data-element={
                      e.id
                    }
                    style={common}
                  >
                    <img
                      src={s.content}
                      alt={s.role}
                      draggable={false}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit:
                          e.objectFit ??
                          'contain',
                        display: 'block',
                        pointerEvents: 'none',
                      }}
                    />
                  </div>
                );
              }

              /*
               * Preserve the existing logo presentation while its
               * canonical semantic model is now:
               *
               * type: image
               * role: branding
               */
              if (
                e.type === 'image' &&
                e.role === 'branding'
              ) {
                return (
                  <div
                    key={e.id}
                    className="ad-element logo"
                    data-element={
                      e.id
                    }
                    data-truncated={
                      e.truncated
                        ? 'true'
                        : 'false'
                    }
                    data-repositioned={
                      e.repositioned
                        ? 'true'
                        : 'false'
                    }
                    style={{
                      ...common,
                      fontSize:
                        e.fontSize,
                      lineHeight:
                        e.lineHeight,
                      whiteSpace:
                        e.truncated
                          ? 'nowrap'
                          : 'normal',
                      overflowWrap:
                        'anywhere',
                      wordBreak:
                        'break-word',
                    }}
                  >
                    {displayText(e)}
                  </div>
                );
              }

              if (
                e.type === 'button'
              ) {
                return (
                  <button
                    key={e.id}
                    className="ad-element cta"
                    data-element={
                      e.id
                    }
                    style={common}
                  >
                    {s.content}
                  </button>
                );
              }

              return (
                <div
                  key={e.id}
                  className={`ad-element ${e.type}`}
                  data-element={e.id}
                  data-truncated={
                    e.truncated
                      ? 'true'
                      : 'false'
                  }
                  data-repositioned={
                    e.repositioned
                      ? 'true'
                      : 'false'
                  }
                  style={{
                    ...common,
                    fontSize:
                      e.fontSize,
                    lineHeight:
                      e.lineHeight,

                    /*
                     * Match the resolver's text model:
                     * normal text can wrap, while an explicitly
                     * truncated element stays on one line.
                     */
                    whiteSpace:
                      e.truncated
                        ? 'nowrap'
                        : 'normal',

                    overflowWrap:
                      'anywhere',

                    wordBreak:
                      'break-word',
                  }}
                >
                  {displayText(e)}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}