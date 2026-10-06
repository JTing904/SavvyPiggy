import type { PiggyBank } from '../types';

/**
 * The share of deposits a new goal starts with. The first goal has nothing to
 * share with, so it takes everything unless the person left it out of the
 * split; a goal put away does not count as "already saving". Every later goal
 * starts at 0 and is given a share on purpose.
 */
export const firstGoalSplit = (existing: readonly PiggyBank[], autoSplit: boolean | undefined): number =>
  autoSplit !== false && !existing.some((b) => !b.archivedAt) ? 100 : 0;
