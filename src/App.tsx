import { useMemo, useState } from 'react';

import { adSpec } from './spec/adSpec';
import { surfaces, unknownSurface } from './surfaces/surfaces';
import { resolveLayout } from './resolver/resolver';
import type { ResolvedLayout } from './types/layout';
import type { AdSpecification } from './types/ad';

import { SurfacePicker } from './components/SurfacePicker';
import { AdRenderer } from './components/AdRenderer';
import { CanvasAdRenderer } from './components/CanvasAdRenderer';
import { ResolutionDebug } from './components/ResolutionDebug';

import './styles.css';

const allSurfaces = [...surfaces, unknownSurface];

/**
 * The shipped demo spec (adSpec.ts) intentionally uses a realistic price
 * so the live demo looks like a real product ad, not a stress-test
 * fixture. The assignment separately asks for "extreme price content" to
 * be evaluated as a stress case — that's exercised directly at the
 * resolver level in tests/resolver/text.test.ts.
 *
 * To let the *browser* (tests/e2e/extremeContent.spec.ts) also drive real
 * extreme content through the real rendered DOM — rather than trusting
 * that whatever the demo happens to show that day is still extreme —
 * this reads an explicit, dev-only `?stress=price` URL query param and
 * swaps in the same malformed, comma-heavy, no-whitespace price string
 * the unit test uses. Absent that query param, this is a no-op: the
 * returned spec is `adSpec` unchanged, so normal app usage and every
 * other e2e test are completely unaffected.
 */
function withStressContent(spec: AdSpecification): AdSpecification {
  if (typeof window === 'undefined') return spec;

  const stressPrice = new URLSearchParams(window.location.search).get('stress') === 'price';
  if (!stressPrice) return spec;

  return {
    ...spec,
    elements: spec.elements.map(e =>
      e.id === 'price' ? { ...e, content: '₹40,0000000000000' } : e,
    ),
  };
}

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
function resolveSafely(ad: AdSpecification, surfaceId: string): { layout: ResolvedLayout | null; error: string | null } {
  const surface = allSurfaces.find(s => s.id === surfaceId)!;

  try {
    return { layout: resolveLayout(ad, surface), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'This surface could not be resolved.';
    return { layout: null, error: message };
  }
}

export default function App() {
  const activeAdSpec = useMemo(() => withStressContent(adSpec), []);

  const [selected, setSelected] = useState(allSurfaces[0].id);
  const surface = allSurfaces.find(s => s.id === selected)!;

  // Renderer backend toggle — proves the same ResolvedLayout can drive a
  // second renderer (Canvas) with zero changes to the resolver or the
  // existing DOM renderer. Defaults to 'dom' so default app behavior,
  // markup, and existing DOM-based e2e assertions are unchanged unless the
  // person explicitly switches it.
  const [renderer, setRenderer] = useState<'dom' | 'canvas'>('dom');

  const { layout, error } = useMemo(() => resolveSafely(activeAdSpec, selected), [activeAdSpec, selected]);

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
                <AdRenderer layout={layout} ad={activeAdSpec} />
              ) : (
                <CanvasAdRenderer layout={layout} ad={activeAdSpec} />
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