import type { AdElementSpec } from '../types/ad';

export interface DegradeState {
  hidden: Set<string>;
  trunc: Set<string>;
  repositioned: Set<string>;
  repositionAttempted: Set<string>;
}

// Priority-ordered scan shared by nextReposition/nextDegradation: least
// important content (highest priority number) is considered first.
function byLeastImportantFirst(specs: AdElementSpec[]) {
  const byPriorityDesc = [...specs].sort(
    (a, b) => b.priority - a.priority || b.id.localeCompare(a.id),
  );

  const priorities = [...new Set(byPriorityDesc.map(e => e.priority))].sort(
    (a, b) => b - a,
  );

  return { byPriorityDesc, priorities };
}

/**
 * Picks the next droppable + repositionable element (lowest priority tier
 * first) that hasn't already been repositioned or already had a reposition
 * trial rejected. Does NOT itself decide whether reposition succeeds — the
 * caller (resolver.ts) runs an actual placement + validation trial and only
 * commits the id to `state.repositioned` if that trial is valid. This keeps
 * degradation.ts free of geometry concerns, matching nextDegradation below.
 */
export function nextReposition(specs: AdElementSpec[], state: DegradeState) {
  const { byPriorityDesc, priorities } = byLeastImportantFirst(specs);

  for (const p of priorities) {
    const atThisPriority = byPriorityDesc.filter(e => e.priority === p);

    const candidate = atThisPriority.find(
      e =>
        !state.hidden.has(e.id) &&
        !state.repositioned.has(e.id) &&
        !state.repositionAttempted.has(e.id) &&
        e.flexibility.droppable &&
        e.flexibility.reposition,
    );

    if (candidate) {
      return {
        elementId: candidate.id,
        reason: `Repositioned priority ${p} content to a free safe-area corner instead of dropping it.`,
      };
    }
  }

  return null;
}

export function nextDegradation(specs: AdElementSpec[], state: DegradeState) {
  const { byPriorityDesc, priorities } = byLeastImportantFirst(specs);

  for (const p of priorities) {
    const atThisPriority = byPriorityDesc.filter(e => e.priority === p);

    const droppable = atThisPriority.find(
      e => !state.hidden.has(e.id) && e.flexibility.droppable,
    );

    if (droppable) {
      state.hidden.add(droppable.id);
      return {
        operation: 'hide' as const,
        elementId: droppable.id,
        reason: `Dropped priority ${p} droppable content before compromising higher-priority elements.`,
      };
    }

    const truncatable = atThisPriority.find(
      e =>
        !state.trunc.has(e.id) &&
        e.flexibility.truncate &&
        e.text?.allowTruncation,
    );

    if (truncatable) {
      state.trunc.add(truncatable.id);
      return {
        operation: 'truncate' as const,
        elementId: truncatable.id,
        reason: `Truncated priority ${p} content before compromising higher-priority elements.`,
      };
    }
  }

  return null;
}