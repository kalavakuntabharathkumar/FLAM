import { useMemo, useState } from 'react';

import { adSpec } from './spec/adSpec';
import { surfaces, unknownSurface } from './surfaces/surfaces';
import { resolveLayout } from './resolver/resolver';
import type { ResolvedLayout } from './types/layout';

import { SurfacePicker } from './components/SurfacePicker';
import { AdRenderer } from './components/AdRenderer';
import { CanvasAdRenderer } from './components/CanvasAdRenderer';
import { ResolutionDebug } from './components/ResolutionDebug';

import './styles.css';

const allSurfaces = [...surfaces, unknownSurface];

/**
 * `resolveLayout()` can legitimately throw when a surface is too small to
 * fit even the highest-priority, non-droppable content (see
 * `resolver.ts` / `resolveMinimalFallback`). That is the resolver's own
 * documented failure mode — it refuses to hand back broken geometry rather
 * than silently overlapping or clipping content.
 *
 * Previously nothing caught that throw, so picking (or live-testing) a
 * sufficiently small unforeseen surface crashed the whole app to a blank
 * screen. This runs the resolution inside a try/catch during render and
 * surfaces a clean message instead. For every surface that already resolves
 * successfully, this branch is never taken — the resolved layout and its
 * on-screen rendering are unchanged.
 */
function resolveSafely(surfaceId: string): { layout: ResolvedLayout | null; error: string | null } {
  const surface = allSurfaces.find(s => s.id === surfaceId)!;

  try {
    return { layout: resolveLayout(adSpec, surface), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'This surface could not be resolved.';
    return { layout: null, error: message };
  }
}

export default function App() {
  const [selected, setSelected] = useState(allSurfaces[0].id);
  const surface = allSurfaces.find(s => s.id === selected)!;

  // Renderer backend toggle — proves the same ResolvedLayout can drive a
  // second renderer (Canvas) with zero changes to the resolver or the
  // existing DOM renderer. Defaults to 'dom' so default app behavior,
  // markup, and existing DOM-based e2e assertions are unchanged unless the
  // person explicitly switches it.
  const [renderer, setRenderer] = useState<'dom' | 'canvas'>('dom');

  const { layout, error } = useMemo(() => resolveSafely(selected), [selected]);

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">FLAM AI · CONSTRAINT-BASED DEMO</p>
          <h1>Adaptive Layout Engine</h1>
          <p className="subtitle">
            One surface-independent ad specification, resolved against different mathematical surface constraints.
          </p>
        </div>
        <div className="badge">
          {error ? '! Unresolvable' : layout?.validation.valid ? '✓ Valid' : '! Review'}
        </div>
      </header>

      <SurfacePicker surfaces={allSurfaces} selected={selected} onSelect={setSelected} />

      <div className="renderer-toggle" role="group" aria-label="Renderer backend">
        <button
          type="button"
          className={renderer === 'dom' ? 'active' : ''}
          onClick={() => setRenderer('dom')}
        >
          DOM
        </button>
        <button
          type="button"
          className={renderer === 'canvas' ? 'active' : ''}
          onClick={() => setRenderer('canvas')}
        >
          Canvas
        </button>
      </div>

      <section className="workspace">
        <div className="preview-panel">
          <div className="preview-label">LIVE RESOLUTION · {surface.name}</div>
          <div className="preview-stage">
            {layout ? (
              renderer === 'dom' ? (
                <AdRenderer layout={layout} ad={adSpec} />
              ) : (
                <CanvasAdRenderer layout={layout} ad={adSpec} />
              )
            ) : (
              <div className="resolution-error">
                <strong>This surface has no valid layout.</strong>
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>

        {layout && <ResolutionDebug layout={layout} />}
      </section>
    </main>
  );
}