export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface SurfaceProfile {
  id: string;
  name: string;
  width: number;
  height: number;
  safeArea: SafeArea;
  minTapTarget: number;
  minTextSize: number;
  viewingDistance: 'near' | 'far';
  touchOnly: boolean;

  /**
   * Optional background color (hex, e.g. '#111111') behind the resolved
   * layout on this surface. Purely additive / opt-in: when present, the
   * validator can check branding text contrast against it
   * (LOW_CONTRAST_BRANDING in validator.ts, using contrastRatio() from
   * resolver/contrast.ts). Surfaces that don't set this are completely
   * unaffected — the check simply doesn't run.
   */
  backgroundColor?: string;
}