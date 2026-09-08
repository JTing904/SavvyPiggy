import { useEffect, useRef } from 'react';
import type { SavingsSettings } from '../types';
import { retentionCutoff } from '../services/analytics';
import { addAlert, hasOlderThan, pruneOlderThan } from '../services/firestore';

/**
 * Clearing the old end of the ledger, once per app open.
 *
 * This exists for the read allowance, not for space. A free Firebase project
 * holds hundreds of thousands of entries — but the app reads the whole ledger
 * every time it opens, and 50,000 reads a day is spent by a few thousand
 * records opened a handful of times. Keeping a window means that day never
 * comes.
 *
 * Nothing is deleted without warning first. The very first time there is
 * something old enough to go, this raises an alert and leaves it alone; only
 * once the user has seen the Statements screen — where that month sits with a
 * download button beside it — does the clearing actually start.
 *
 * Only activity documents are removed. Balances live on the goals and
 * positions are replayed from the trade log, so nothing here can cost anyone a
 * ringgit or a share.
 */
export const useLedgerPruning = (
  uid: string | undefined,
  savings: SavingsSettings,
  ready: boolean
) => {
  const ran = useRef(false);

  useEffect(() => {
    if (!uid || !ready || ran.current || savings.retentionMonths === null) return;
    ran.current = true;

    void (async () => {
      try {
        const cutoff = retentionCutoff(new Date(), savings.retentionMonths);
        if (!(await hasOlderThan(uid, cutoff))) return;

        if (!savings.retentionAcknowledged) {
          // A deterministic id, so the warning refreshes rather than stacking.
          await addAlert(uid, {
            id: 'retention_notice',
            kind: 'housekeeping',
            date: new Date().toISOString(),
            months: savings.retentionMonths,
          });
          return;
        }
        await pruneOlderThan(uid, cutoff);
      } catch {
        // A failed clear is not worth interrupting anything for; it retries on
        // the next open, and nothing depends on it having happened.
      }
    })();
  }, [uid, ready, savings.retentionMonths, savings.retentionAcknowledged]);
};
