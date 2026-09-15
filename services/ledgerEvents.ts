/**
 * Ledger rows this phone just changed, for the on-demand older ledger.
 *
 * The live listener sees its own rows change; rows read once from further
 * back do not, so the writes that can touch them say which ids they touched.
 * `server` means the write went through a transaction, which does not update
 * the phone's cache — the row has to be read back from the server.
 */
export interface RowChange {
  id: string;
  deleted?: boolean;
  server?: boolean;
}

const listeners = new Set<(changes: RowChange[]) => void>();

export const onActivityRowsChanged = (listener: (changes: RowChange[]) => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export const activityRowsChanged = (changes: RowChange[]) => {
  if (changes.length > 0) listeners.forEach((l) => l(changes));
};
