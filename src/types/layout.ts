import type {
  DegradationOperation,
  ElementRole,
  ElementType,
  Priority,
} from './ad';

export type Composition = 'vertical' | 'horizontal' | 'mixed';

export interface ResolvedElement {
  id: string;
  type: ElementType;
  role: ElementRole;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  zIndex: number;
  fontSize?: number;
  lineHeight?: number;
  text?: string;
  truncated?: boolean;
  repositioned?: boolean;
  objectFit?: 'contain';
  priority: Priority;
}

export interface ValidationIssue {
  code: string;
  elementId?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface DegradationDecision {
  operation: DegradationOperation;
  elementId: string;
  reason: string;
}

export interface ResolvedLayout {
  surfaceId: string;
  width: number;
  height: number;
  safeArea: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  composition: Composition;
  elements: ResolvedElement[];
  validation: ValidationResult;
  degradation: DegradationDecision[];
  score: number;
}