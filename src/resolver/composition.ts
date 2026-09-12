import type { AdElementSpec } from '../types/ad';
import type { SurfaceProfile } from '../types/surface';
import type { Composition } from '../types/layout';

/**
 * Enumerates every composition family the resolver should try for a given
 * surface + element set.
 *
 * This used to also rank the three compositions with its own
 * aspect-ratio/content-pressure heuristic before returning them. That
 * ranking was dead weight: resolveLayout() in resolver.ts always builds and
 * fully validates ALL compositions this function returns, then picks the
 * winner via its own `score()` — so the order this function produced never
 * affected the final chosen layout. Keeping two independent, differently
 * weighted scoring systems (one here, one in resolver.ts) made "why did
 * this layout win" harder to answer than it should be.
 *
 * `score()` in resolver.ts is now the single source of truth for which
 * composition wins. This function's only job is to generate the candidate
 * set for it to evaluate. `surface` and `elements` are kept as parameters
 * (rather than removed) so a future surface-aware pruning step — e.g.
 * skipping an obviously-impossible composition before doing a full
 * placement pass, as a performance optimization — has an obvious place to
 * live without changing this function's call sites.
 */
export function candidates(
  surface: SurfaceProfile,
  elements: AdElementSpec[],
): Composition[] {
  void surface;
  void elements;

  return ['vertical', 'horizontal', 'mixed'];
}