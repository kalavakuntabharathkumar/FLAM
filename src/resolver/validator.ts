import type { AdElementSpec } from '../types/ad';
import type { SurfaceProfile } from '../types/surface';
import type { ResolvedElement, ValidationResult } from '../types/layout';
import { finite, overlaps } from './geometry';
import { estimateText } from './constraints';
import { contrastRatio, WCAG_AA_MIN_CONTRAST } from './contrast';

export function validate(
  elements: ResolvedElement[],
  specs: AdElementSpec[],
  surface: SurfaceProfile,
): ValidationResult {
  const issues: ValidationResult['issues'] = [];

  const safe = {
    left: surface.safeArea.left,
    top: surface.safeArea.top,
    right: surface.width - surface.safeArea.right,
    bottom: surface.height - surface.safeArea.bottom,
  };

  for (const e of elements.filter((x) => x.visible)) {
    const spec = specs.find((x) => x.id === e.id);

    if (!spec) {
      continue;
    }

    if (![e.x, e.y, e.width, e.height].every(finite) || e.width <= 0 || e.height <= 0) {
      issues.push({
        code: 'INVALID_DIMENSION',
        elementId: e.id,
        message: 'Geometry contains an invalid or non-positive dimension.',
      });
      continue;
    }

    if (spec.maxWidth !== undefined && e.width > spec.maxWidth + 0.01) {
      issues.push({
        code: 'EXCESSIVE_ALLOCATION',
        elementId: e.id,
        message: 'Element width exceeds its maximum useful allocation.',
      });
    }

    if (spec.maxHeight !== undefined && e.height > spec.maxHeight + 0.01) {
      issues.push({
        code: 'EXCESSIVE_ALLOCATION',
        elementId: e.id,
        message: 'Element height exceeds its maximum useful allocation.',
      });
    }

    if (
      e.x < 0 ||
      e.y < 0 ||
      e.x + e.width > surface.width + 0.01 ||
      e.y + e.height > surface.height + 0.01
    ) {
      issues.push({
        code: 'OUT_OF_BOUNDS',
        elementId: e.id,
        message: 'Element crosses the logical surface bounds.',
      });
    }

    if (
      e.x < safe.left - 0.01 ||
      e.y < safe.top - 0.01 ||
      e.x + e.width > safe.right + 0.01 ||
      e.y + e.height > safe.bottom + 0.01
    ) {
      issues.push({
        code: 'SAFE_AREA_VIOLATION',
        elementId: e.id,
        message: 'Element crosses the safe area.',
      });
    }

    if (
      (spec.type === 'text' || (spec.type === 'image' && spec.role === 'branding')) &&
      (e.fontSize ?? 0) < Math.max(surface.minTextSize, spec.text?.minFontSize ?? 0) - 0.01
    ) {
      issues.push({
        code: 'BELOW_MIN_TEXT_SIZE',
        elementId: e.id,
        message: 'Text is below the minimum readable font size.',
      });
    }

    if (
      spec.type === 'button' &&
      surface.touchOnly &&
      (e.width < surface.minTapTarget - 0.01 || e.height < surface.minTapTarget - 0.01)
    ) {
      issues.push({
        code: 'BELOW_MIN_TAP_TARGET',
        elementId: e.id,
        message: 'CTA is below the required tap target.',
      });
    }

    if (
      spec.type === 'image' &&
      spec.role === 'branding' &&
      spec.foregroundColor &&
      surface.backgroundColor
    ) {
      const ratio = contrastRatio(spec.foregroundColor, surface.backgroundColor);

      if (ratio !== null && ratio < WCAG_AA_MIN_CONTRAST) {
        issues.push({
          code: 'LOW_CONTRAST_BRANDING',
          elementId: e.id,
          message:
            'Branding contrast ratio ' +
            ratio.toFixed(2) +
            ':1 is below the WCAG AA minimum of ' +
            WCAG_AA_MIN_CONTRAST +
            ':1 against the surface background.',
        });
      }
    }

    if (spec.type === 'text' || (spec.type === 'image' && spec.role === 'branding')) {
      const measured = estimateText(
        spec,
        e.width,
        surface,
        e.fontSize,
        e.truncated ? 1 : spec.text?.maxLines,
      );

      if (measured.height > e.height + 0.5) {
        issues.push({
          code: 'TEXT_OVERFLOW',
          elementId: e.id,
          message: 'Text does not fit the resolved box.',
        });
      }

      if (!e.truncated && measured.truncated) {
        issues.push({
          code: 'TEXT_CLIPPING',
          elementId: e.id,
          message: 'Text would require truncation but truncation is not recorded.',
        });
      }

      if (e.truncated && !spec.text?.allowTruncation) {
        issues.push({
          code: 'TEXT_CLIPPING',
          elementId: e.id,
          message: 'Text was truncated without explicit permission.',
        });
      }
    }

    if (spec.type === 'image' && spec.role !== 'branding' && spec.image) {
      const ratio = e.width / Math.max(0.01, e.height);

      if (Math.abs(ratio - spec.image.aspectRatio) > 0.02) {
        issues.push({
          code: 'IMAGE_CONSTRAINT_VIOLATION',
          elementId: e.id,
          message: 'Image aspect ratio is not respected.',
        });
      }
    }
  }

  const visible = elements.filter((x) => x.visible);

  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      if (overlaps(visible[i], visible[j])) {
        issues.push({
          code: 'OVERLAP',
          elementId: visible[i].id,
          message: 'Overlaps ' + visible[j].id + '.',
        });
      }
    }
  }

  const spacingThreshold = Math.max(24, Math.min(surface.width, surface.height) * 0.08);

  const byY = [...visible].sort((a, b) => a.y - b.y || a.x - b.x);

  for (let i = 0; i < byY.length - 1; i++) {
    const a = byY[i];
    const b = byY[i + 1];

    const horizontalOverlap = a.x < b.x + b.width && a.x + a.width > b.x;

    if (horizontalOverlap && b.y - (a.y + a.height) > spacingThreshold) {
      issues.push({
        code: 'INVALID_SPACING',
        elementId: b.id,
        message: 'Vertical spacing is substantially larger than the shared spacing scale.',
      });
    }
  }

  const resolvedIds = new Set(visible.map((e) => e.id));

  for (const spec of specs) {
    if (!resolvedIds.has(spec.id) && !spec.flexibility.droppable) {
      issues.push({
        code: 'MISSING_REQUIRED_ELEMENT',
        elementId: spec.id,
        message: 'Required content was not placed.',
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}