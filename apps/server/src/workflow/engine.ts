import type { ChapterStatus } from '@grid-story/schema';

// Valid state transitions for chapter status.
// Any status NOT listed as a key has no valid outgoing transitions (terminal).
const TRANSITIONS: Record<ChapterStatus, ChapterStatus[]> = {
  draft: ['review', 'revised'],
  review: ['draft', 'revised'],
  revised: ['review', 'final'],
  final: ['published'],
  published: [],
};

/** Returns the list of valid next statuses from the given status. */
export function validTransitions(from: ChapterStatus): ChapterStatus[] {
  return TRANSITIONS[from] ?? [];
}

/** Check whether a transition from one status to another is legal. */
export function canTransition(from: ChapterStatus, to: ChapterStatus): boolean {
  return validTransitions(from).includes(to);
}

/** Validate and return an error message if the transition is illegal. */
export function validateTransition(from: ChapterStatus, to: ChapterStatus): string | null {
  if (from === to) {
    return `Chapter is already in status "${from}".`;
  }
  if (!canTransition(from, to)) {
    const allowed = validTransitions(from);
    if (allowed.length === 0) {
      return `Status "${from}" is terminal — no further transitions allowed.`;
    }
    return `Cannot transition from "${from}" to "${to}". Valid next statuses: ${allowed.map((s) => `"${s}"`).join(', ')}.`;
  }
  return null;
}

/** All chapter statuses in workflow order. */
export const STATUS_ORDER: ChapterStatus[] = ['draft', 'review', 'revised', 'final', 'published'];
