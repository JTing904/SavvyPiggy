import { useEffect, useRef } from 'react';
import type { SavingsSettings } from '../types';
import { clearingPlan } from '../services/analytics';
import { addAlert, hasOlderThan, pruneOlderThan } from '../services/firestore';
import { hasBetween } from '../services/ledgerArchive';

/**
 * Clearing the old end of the ledger, once per app open.
 *
 * This exists for the read allowance, not for space. A free Firebase project
 * holds hundreds of thousands of entries — but the app reads the whole ledger
 * every time it opens, and 50,000 reads a day is spent by a few thousand
 * records opened a handful of times. Keeping a window means that day never
 * comes.
 *
 * Nothing is deleted without warning first. Records become deletable only once
 * the Statements screen has listed them as about to be cleared, beside their
 * download buttons; the screen records the cutoff it showed. Anything that has
 * become due since — a month aging out, or the window shrinking — raises the
 * alert again and is left alone until the screen has been opened again.
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
        const plan = clearingPlan(new Date(), savings.retentionMonths, savings.retentionAcknowledgedCutoff);
        if (!(await hasOlderThan(uid, plan.cutoff))) return;

        // Due but never shown as due: warn, and leave it where it is.
        const unseen =
          plan.unseenFrom !== null &&
          (plan.unseenFrom.getTime() <= 0 || (await hasBetween(uid, plan.unseenFrom, plan.cutoff)));
        if (unseen) {
          // A deterministic id, so the warning refreshes rather than stacking.
          await addAlert(uid, {
            id: 'retention_notice',
            kind: 'housekeeping',
            date: new Date().toISOString(),
            months: savings.retentionMonths ?? undefined,
          });
        }

        // What was shown can go, whether or not something newer is waiting.
        if (plan.clearBefore) await pruneOlderThan(uid, plan.clearBefore);
      } catch {
        // A failed clear is not worth interrupting anything for; it retries on
        // the next open, and nothing depends on it having happened.
      }
    })();
  }, [uid, ready, savings.retentionMonths, savings.retentionAcknowledgedCutoff]);
};
