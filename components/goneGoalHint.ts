import type { Activity, PiggyBank } from '../types';
import type { Messages } from '../i18n';

/**
 * What the app knows about where a deleted goal's money went, for the sheets
 * that ask how to settle a record that touched it. It only reports the "Moved
 * in" row written at deletion; it never guesses the destination for the person.
 */
export const goneGoalHint = (t: Messages, goalId: string, banks: PiggyBank[], activities: Activity[]) => {
  const w = t.goals.goneShare;
  const moved = activities.find((a) => a.type === 'transfer' && a.fromGoalId === goalId);
  if (!moved) return w.noRecord;
  const nameOf = (id: string) => banks.find((b) => b.id === id)?.name ?? t.history.deletedGoal;
  const to = moved.distributions.map((d) => w.quoted(nameOf(d.bankId))).join(w.listJoin);
  return w.movedTo(moved.fromGoal || t.history.deletedGoal, to);
};
