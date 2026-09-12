export type ElementType = 'text' | 'image' | 'button';
export type ElementRole = 'primary' | 'secondary' | 'hero' | 'action' | 'branding';
export type Priority = 1 | 2 | 3;

// Before a droppable + repositionable element is hidden, the resolver tries
// pinning it to a free safe-area corner outside the main content flow (see
// `degradation.ts` / `placement.ts`'s `placeOverlays`). If that produces a
// valid, non-overlapping layout it is accepted as 'reposition' instead of
// 'hide'. If no free corner exists, the trial is rejected and the element
// falls through to the existing hide/truncate path unchanged.
export type DegradationOperation = 'resize' | 'reposition' | 'truncate' | 'hide';

export interface TextConstraints {
  minFontSize: number;
  preferredFontSize: number;
  /**
   * Optional ceiling above `preferredFontSize` the resolver may grow into
   * when a surface has more safe-area than the spec's preferred box
   * requires (see `fitTextFontSize` / `preferredBlockHeight`). Unset means
   * no growth past `preferredFontSize` — identical to today's behavior.
   */
  maxFontSize?: number;
  maxLines?: number;
  allowTruncation: boolean;
}

export interface ImageConstraints {
  aspectRatio: number;
  minWidth: number;
  minHeight: number;
  preferredWidth: number;
  preferredHeight: number;
}

export interface ElementFlexibility {
  resize: boolean;
  reposition: boolean;
  truncate: boolean;
  droppable: boolean;
}

interface BaseElementSpec {
  id: string;
  content: string;
  priority: Priority;
  minWidth: number;
  minHeight: number;
  preferredWidth: number;
  preferredHeight: number;
  maxWidth?: number;
  maxHeight?: number;
  flexibility: ElementFlexibility;
}

// Discriminated union keyed on `type` (and, for images, `role`), so that
// invalid combinations are compile-time errors instead of silently-optional
// fields:
//  - a 'text' element without `text` constraints can't be constructed
//  - a 'hero' image without `image` (aspect ratio etc.) can't be constructed
//  - a 'button' can't accidentally carry text/image constraints
//  - a 'text' element can't claim role 'hero', and a 'button'/'text' can't
//    claim role 'branding' (only an image can be branding)
export interface TextElementSpec extends BaseElementSpec {
  type: 'text';
  role: Exclude<ElementRole, 'hero' | 'branding'>;
  text: TextConstraints;
  image?: never;
}

export interface HeroImageElementSpec extends BaseElementSpec {
  type: 'image';
  role: 'hero';
  image: ImageConstraints;
  text?: never;
}

// Branding is rendered text-like (a wordmark), so it carries TextConstraints
// for font sizing only. It intentionally does NOT carry ImageConstraints:
// the resolver sizes branding via text-fit math (see constraints.ts /
// placement.ts), not aspect-ratio image math, and the renderer always draws
// it as a text node (AdRenderer.tsx). A field for real bitmap-logo geometry
// would promise behavior the pipeline doesn't implement.
export interface BrandingImageElementSpec extends BaseElementSpec {
  type: 'image';
  role: 'branding';
  image?: never;
  text?: TextConstraints;
  /**
   * Optional hex foreground color (e.g. '#ffffff') the branding mark
   * renders as. Purely additive / opt-in: only used by the optional
   * LOW_CONTRAST_BRANDING accessibility check in validator.ts, and only
   * when the surface also declares `backgroundColor`. Specs that don't set
   * this are completely unaffected.
   */
  foregroundColor?: string;
}

export interface ButtonElementSpec extends BaseElementSpec {
  type: 'button';
  role: Exclude<ElementRole, 'hero' | 'branding'>;
  text?: never;
  image?: never;
}

export type AdElementSpec =
  | TextElementSpec
  | HeroImageElementSpec
  | BrandingImageElementSpec
  | ButtonElementSpec;

export interface AdSpecification {
  id: string;
  elements: AdElementSpec[];
}