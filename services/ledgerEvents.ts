/**
 * Ledger rows this phone just changed, for the on-demand older ledger.
 *
 * The live listener sees its own rows change; rows read once from further
 * back do not, so the writes that can touch them say which ids they touched.
 * `server` means the write went through a transaction, which does not update
 * the phone's cache — the row has to be read back from the server.
 *
 * `moved` means the row's date was changed; `dates` (ISO, before and after)
 * says from and to. Without them a move is assumed to cross the live window,
 * which only costs a streak being counted again.
 */
export interface RowChange {
  id: string;
  deleted?: boolean;
  server?: boolean;
  moved?: boolean;
  dates?: { from: string; to: string };
}

/**
 * Whether a change can have broken a remembered older streak even when the row
 * is not in the older ledger: a row moved out of, or into, the stretch before
 * the live window (`liveFrom`) adds or removes a saving day there.
 */
export const shouldClearStreak = (change: RowChange, liveFrom: Date): boolean => {
  if (!change.moved) return false;
  if (!change.dates) return true;
  const from = liveFrom.toISOString();
  return change.dates.from < from || change.dates.to < from;
};

const listeners = new Set<(changes: RowChange[]) => void>();

export const onActivityRowsChanged = (listener: (changes: RowChange[]) => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export const activityRowsChanged = (changes: RowChange[]) => {
  if (changes.length > 0) listeners.forEach((l) => l(changes));
};
