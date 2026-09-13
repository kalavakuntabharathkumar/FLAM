import type { Composition } from '../types/layout';

/**
 * Enumerates every composition family the resolver should try.
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
 * set for it to evaluate. It previously accepted `surface` and `elements`
 * parameters reserved for a hypothetical future surface-aware pruning step,
 * but they were never read — an unused API surface is worse than adding the
 * parameters back if and when a real pruning optimization is implemented.
 */
export function candidates(): Composition[] {
  return ['vertical', 'horizontal', 'mixed'];
}