import type { AdSpecification } from './ad';
import type { SurfaceProfile } from './surface';
import type { ResolvedLayout } from './layout';
export interface ResolveOptions { maxIterations?: number; }
export type LayoutResolver = (ad: AdSpecification, surface: SurfaceProfile, options?: ResolveOptions) => ResolvedLayout;
